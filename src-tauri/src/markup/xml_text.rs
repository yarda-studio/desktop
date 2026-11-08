//! Text from quick-xml events, with entities put back.
//!
//! Since quick-xml 0.37 the reader no longer leaves `&amp;`, `&quot;` or
//! `&#8217;` inside a text event: each one arrives as its own
//! `Event::GeneralRef` between two text events. A parser that only reads
//! `Event::Text` loses them with no error ("Tom &amp; Jerry" reads as
//! "Tom  Jerry"), and one that trims every text event also loses the spaces
//! next to them. Parsers gather text and references here instead.
//!
//! The input is always a `&str`, so it is valid UTF-8 and decoding cannot fail.

use quick_xml::escape::resolve_predefined_entity;
use quick_xml::events::{BytesRef, BytesText};

/// The text of one `Event::Text`.
pub fn text(t: &BytesText) -> String {
    t.xml10_content()
        .map(|c| c.into_owned())
        .unwrap_or_default()
}

/// What an entity (`&amp;`) or character reference (`&#8217;`, `&#x2014;`)
/// stands for. A name that is not one of the five predefined entities, and a
/// character reference that is not a valid character, give an empty string so
/// the text around it still comes through.
pub fn reference(r: &BytesRef) -> String {
    match r.resolve_char_ref() {
        Ok(Some(c)) => c.to_string(),
        Ok(None) => r
            .decode()
            .ok()
            .and_then(|name| resolve_predefined_entity(&name))
            .unwrap_or("")
            .to_string(),
        Err(_) => String::new(),
    }
}

/// The text and references between two tags, joined back into one string.
#[derive(Default)]
pub struct TextRun(String);

impl TextRun {
    pub fn push_text(&mut self, t: &BytesText) {
        self.0.push_str(&text(t));
    }

    pub fn push_ref(&mut self, r: &BytesRef) {
        self.0.push_str(&reference(r));
    }

    /// The run so far, leaving it empty. `None` when nothing was collected.
    pub fn take(&mut self) -> Option<String> {
        (!self.0.is_empty()).then(|| std::mem::take(&mut self.0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use quick_xml::events::Event;
    use quick_xml::Reader;

    /// Run every text and reference event of `xml` through `TextRun`.
    fn gather(xml: &str) -> String {
        let mut reader = Reader::from_str(xml);
        let mut run = TextRun::default();
        let mut out = String::new();
        loop {
            match reader.read_event().unwrap() {
                Event::Text(t) => run.push_text(&t),
                Event::GeneralRef(r) => run.push_ref(&r),
                Event::Eof => break,
                _ => out.push_str(&run.take().unwrap_or_default()),
            }
        }
        out
    }

    #[test]
    fn rejoins_text_around_every_kind_of_reference() {
        assert_eq!(
            gather("<a>Tom &amp; Jerry &#8217;s &#x2014; &quot;x&quot; &apos;y&apos; &lt;&gt;</a>"),
            "Tom & Jerry \u{2019}s \u{2014} \"x\" 'y' <>"
        );
    }

    #[test]
    fn an_unknown_entity_or_bad_character_reference_keeps_the_text_around_it() {
        assert_eq!(gather("<a>one&nbsp;two &#0; three</a>"), "onetwo  three");
    }

    #[test]
    fn take_is_none_when_nothing_was_gathered() {
        let mut run = TextRun::default();
        assert_eq!(run.take(), None);
    }
}
