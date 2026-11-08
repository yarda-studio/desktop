/// ThML (Theological Markup Language) parser — plain-text extraction.
///
/// ThML is HTML-like XML. We extract text content and Strong's numbers from
/// <sync type="Strongs" value="G25"/> elements. Formatting tags are ignored.
/// Footnotes (<note>) are skipped from the main text flow.
use super::xml_text::TextRun;
use crate::types::{Result, TextSpan};
use quick_xml::events::Event;
use quick_xml::Reader;

pub fn parse(raw: &str) -> Result<Vec<TextSpan>> {
    let mut reader = Reader::from_str(raw);
    // No trim_text: an entity splits one run of text into several events, and
    // trimming each would drop the spaces beside it. The whole run is trimmed
    // below instead.

    let mut spans = Vec::new();
    let mut buf = Vec::new();
    let mut pending_strongs: Option<String> = None;
    let mut in_note = false;
    let mut run = TextRun::default();

    loop {
        let event = reader.read_event_into(&mut buf);
        let in_run = match &event {
            Ok(Event::Text(t)) => {
                run.push_text(t);
                true
            }
            Ok(Event::GeneralRef(r)) => {
                run.push_ref(r);
                true
            }
            _ => false,
        };
        if in_run {
            drop(event);
            buf.clear();
            continue;
        }
        if let Some(raw_text) = run.take() {
            let text = raw_text.trim();
            if !in_note && !text.is_empty() {
                spans.push(TextSpan {
                    text: text.to_string(),
                    strongs: pending_strongs.take().map(|strongs| vec![strongs]),
                    morph: None,
                    is_added: None,
                    is_footnote: None,
                    is_red_letter: None,
                    is_title: None,
                });
            }
        }

        match event {
            Ok(Event::Empty(ref e)) => {
                let name = std::str::from_utf8(e.name().as_ref())
                    .unwrap_or("")
                    .to_lowercase();
                if name == "sync" {
                    let mut sync_type = String::new();
                    let mut sync_val = String::new();
                    for attr in e.attributes().flatten() {
                        let k = std::str::from_utf8(attr.key.as_ref())
                            .unwrap_or("")
                            .to_lowercase();
                        let v = std::str::from_utf8(attr.value.as_ref())
                            .unwrap_or("")
                            .to_string();
                        if k == "type" {
                            sync_type = v.to_lowercase();
                        }
                        if k == "value" {
                            sync_val = v;
                        }
                    }
                    if sync_type == "strongs" && !sync_val.is_empty() {
                        pending_strongs = Some(sync_val);
                    }
                }
            }
            Ok(Event::Start(ref e)) => {
                let name = std::str::from_utf8(e.name().as_ref())
                    .unwrap_or("")
                    .to_lowercase();
                if name == "note" || name == "scripref" {
                    in_note = true;
                }
            }
            Ok(Event::End(ref e)) => {
                let name = std::str::from_utf8(e.name().as_ref())
                    .unwrap_or("")
                    .to_lowercase();
                if name == "note" || name == "scripref" {
                    in_note = false;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => {
                // On parse failure, return the raw text stripped of tags as a fallback
                if spans.is_empty() {
                    let stripped = raw
                        .chars()
                        .scan(0i32, |depth, c| {
                            if c == '<' {
                                *depth += 1;
                                Some(None)
                            } else if c == '>' {
                                *depth -= 1;
                                Some(None)
                            } else if *depth == 0 {
                                Some(Some(c))
                            } else {
                                Some(None)
                            }
                        })
                        .flatten()
                        .collect::<String>();
                    spans.push(TextSpan::plain(stripped.trim()));
                }
                break;
            }
            _ => {}
        }
        buf.clear();
    }

    Ok(spans)
}

#[cfg(test)]
mod tests {
    use super::parse;

    #[test]
    fn keeps_entities_and_character_references_in_text() {
        let spans =
            parse("<p>He said &quot;Go&quot; &amp; left it&#8217;s &lt;ok&gt; &apos;x&apos;</p>")
                .unwrap();
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].text, "He said \"Go\" & left it\u{2019}s <ok> 'x'");
    }

    #[test]
    fn strongs_numbers_still_attach_and_notes_are_skipped() {
        let spans = parse(
            r#"<p><sync type="Strongs" value="G25"/>love &amp; grace<note>skip &amp; me</note></p>"#,
        )
        .unwrap();
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].text, "love & grace");
        assert_eq!(spans[0].strongs.as_ref().unwrap(), &vec!["G25".to_string()]);
    }
}
