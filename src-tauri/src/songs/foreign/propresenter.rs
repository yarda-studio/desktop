//! ProPresenter songs.
//!
//! ProPresenter 4, 5 and 6 save XML (`.pro4`, `.pro5`, `.pro6`) with each text
//! box's RTF as base64; slides sit inside named groups ("Verse 1", "Chorus"),
//! which become the song's sections.
//!
//! ProPresenter 7 (`.pro`) is a binary format. We don't read its structure; we
//! pull out the RTF text blocks it embeds, in order. That recovers the words but
//! not the group names, so those songs come in as numbered verses.

use super::{song_with, SongBuilder};
use crate::songs::model::Song;
use crate::songs::rtf::{extract_embedded_rtf, rtf_to_text};
use crate::types::{AppError, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;

fn attr(e: &BytesStart, name: &str) -> String {
    e.attributes()
        .flatten()
        .find(|a| a.key.local_name().as_ref() == name.as_bytes())
        .map(|a| {
            a.unescape_value()
                .map(|v| v.to_string())
                .unwrap_or_default()
        })
        .unwrap_or_default()
}

fn first_non_empty(values: &[String]) -> String {
    values
        .iter()
        .find(|v| !v.trim().is_empty())
        .cloned()
        .unwrap_or_default()
}

/// Decode a base64 RTF text box into plain text. Bad data yields no text rather than an error.
fn decode_rtf(b64: &str) -> String {
    let compact: String = b64.chars().filter(|c| !c.is_whitespace()).collect();
    STANDARD
        .decode(compact)
        .map(|bytes| rtf_to_text(&bytes))
        .unwrap_or_default()
}

struct Group {
    name: Option<String>,
    slides: Vec<String>,
}

pub fn parse_xml(xml: &str, stem: &str) -> Result<Vec<Song>> {
    let mut reader = Reader::from_str(xml);
    let err = |e: quick_xml::Error| AppError::Other(format!("Invalid ProPresenter file: {e}"));

    let mut groups: Vec<Group> = Vec::new();
    let mut slide_texts: Option<Vec<String>> = None;
    let mut capture_rtf = false;
    let mut rtf_buf = String::new();
    let mut meta: Option<[String; 4]> = None; // title, author, copyright, ccli

    loop {
        let event = reader.read_event().map_err(err)?;
        match &event {
            Event::Start(e) | Event::Empty(e) => {
                let name = e.local_name();
                match name.as_ref() {
                    b"RVPresentationDocument" => {
                        let author = first_non_empty(&[
                            attr(e, "CCLIAuthor"),
                            attr(e, "author"),
                            attr(e, "CCLIArtistCredits"),
                            attr(e, "artist"),
                        ]);
                        meta = Some([
                            attr(e, "CCLISongTitle"),
                            author,
                            first_non_empty(&[
                                attr(e, "CCLICopyrightInfo"),
                                attr(e, "CCLICopyrightYear"),
                            ]),
                            first_non_empty(&[
                                attr(e, "CCLISongNumber"),
                                attr(e, "CCLILicenseNumber"),
                            ]),
                        ]);
                    }
                    b"RVSlideGrouping" if matches!(event, Event::Start(_)) => {
                        let n = attr(e, "name");
                        groups.push(Group {
                            name: (!n.trim().is_empty()).then_some(n),
                            slides: Vec::new(),
                        });
                    }
                    b"RVDisplaySlide" if matches!(event, Event::Start(_)) => {
                        slide_texts = Some(Vec::new())
                    }
                    // ProPresenter 4 and 5 keep the RTF in an attribute.
                    b"RVTextElement" => {
                        let rtf = attr(e, "RTFData");
                        if !rtf.is_empty() {
                            if let Some(texts) = slide_texts.as_mut() {
                                texts.push(decode_rtf(&rtf));
                            }
                        }
                    }
                    // ProPresenter 6 keeps it in a child element.
                    b"NSString"
                        if matches!(event, Event::Start(_))
                            && attr(e, "rvXMLIvarName") == "RTFData" =>
                    {
                        capture_rtf = true;
                        rtf_buf.clear();
                    }
                    _ => {}
                }
            }
            Event::Text(t) if capture_rtf => rtf_buf.push_str(&t.unescape().map_err(err)?),
            Event::CData(c) if capture_rtf => rtf_buf.push_str(&String::from_utf8_lossy(c)),
            Event::End(e) => match e.local_name().as_ref() {
                b"NSString" if capture_rtf => {
                    capture_rtf = false;
                    if let Some(texts) = slide_texts.as_mut() {
                        texts.push(decode_rtf(&rtf_buf));
                    }
                }
                b"RVDisplaySlide" => {
                    if let Some(texts) = slide_texts.take() {
                        let text = texts
                            .into_iter()
                            .filter(|t| !t.trim().is_empty())
                            .collect::<Vec<_>>()
                            .join("\n");
                        // ProPresenter 4 has no groups; slides then stand alone.
                        if groups.is_empty() {
                            groups.push(Group {
                                name: None,
                                slides: Vec::new(),
                            });
                        }
                        groups.last_mut().unwrap().slides.push(text);
                    }
                }
                _ => {}
            },
            Event::Eof => break,
            _ => {}
        }
    }

    let Some([title, author, copyright, ccli]) = meta else {
        return Err(AppError::Other("Not a ProPresenter song file".into()));
    };

    let mut builder = SongBuilder::new();
    for g in &groups {
        builder.add_group(g.name.as_deref(), &g.slides);
    }
    if builder.is_empty() {
        return Err(AppError::Other("No lyrics found".into()));
    }
    Ok(vec![builder.finish(song_with(
        &title, stem, &author, &copyright, &ccli,
    ))])
}

/// ProPresenter 7: the embedded RTF blocks, in order, as unlabelled slides.
pub fn parse_pro7(bytes: &[u8], stem: &str) -> Result<Vec<Song>> {
    let mut texts: Vec<String> = extract_embedded_rtf(bytes)
        .into_iter()
        .map(rtf_to_text)
        .filter(|t| !t.trim().is_empty())
        .collect();
    texts.dedup();
    let mut builder = SongBuilder::new();
    for text in &texts {
        builder.add_group(None, std::slice::from_ref(text));
    }
    if builder.is_empty() {
        return Err(AppError::Other(
            "No lyrics found. ProPresenter 7 files are read on a best-effort basis; export the song as text from ProPresenter if this one fails.".into(),
        ));
    }
    Ok(vec![builder.finish(song_with("", stem, "", "", ""))])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn b64(rtf: &str) -> String {
        STANDARD.encode(rtf.as_bytes())
    }

    fn rtf(text: &str) -> String {
        format!(
            r"{{\rtf1\ansi{{\fonttbl{{\f0 Arial;}}}}\pard\f0\fs80 {}}}",
            text.replace('\n', r"\par ")
        )
    }

    #[test]
    fn propresenter_6_groups_become_sections() {
        let xml = format!(
            r#"<RVPresentationDocument versionNumber="600" CCLISongTitle="Amazing Grace" CCLIArtistCredits="John Newton" CCLICopyrightYear="1779" CCLISongNumber="4768151">
 <array rvXMLIvarName="groups">
  <RVSlideGrouping name="Verse 1">
   <array rvXMLIvarName="slides">
    <RVDisplaySlide><array rvXMLIvarName="displayElements"><RVTextElement><NSString rvXMLIvarName="RTFData">{a}</NSString></RVTextElement></array></RVDisplaySlide>
    <RVDisplaySlide><array rvXMLIvarName="displayElements"><RVTextElement><NSString rvXMLIvarName="RTFData">{b}</NSString></RVTextElement></array></RVDisplaySlide>
   </array>
  </RVSlideGrouping>
  <RVSlideGrouping name="Chorus">
   <array rvXMLIvarName="slides">
    <RVDisplaySlide><array rvXMLIvarName="displayElements"><RVTextElement><NSString rvXMLIvarName="RTFData">{c}</NSString></RVTextElement></array></RVDisplaySlide>
   </array>
  </RVSlideGrouping>
  <RVSlideGrouping name="Chorus">
   <array rvXMLIvarName="slides">
    <RVDisplaySlide><array rvXMLIvarName="displayElements"><RVTextElement><NSString rvXMLIvarName="RTFData">{c}</NSString></RVTextElement></array></RVDisplaySlide>
   </array>
  </RVSlideGrouping>
 </array>
</RVPresentationDocument>"#,
            a = b64(&rtf("Amazing grace\nhow sweet the sound")),
            b = b64(&rtf("That saved a wretch\nlike me")),
            c = b64(&rtf("My chains are gone")),
        );
        let song = parse_xml(&xml, "file").unwrap().remove(0);
        assert_eq!(
            (
                song.title.as_str(),
                song.author.as_str(),
                song.ccli_number.as_str()
            ),
            ("Amazing Grace", "John Newton", "4768151")
        );
        assert_eq!(song.copyright, "1779");
        assert_eq!(song.sections.len(), 2);
        assert_eq!(
            (
                song.sections[0].key.as_str(),
                song.sections[0].label.as_str()
            ),
            ("v1", "Verse 1")
        );
        assert_eq!(
            song.sections[0].lyrics,
            "Amazing grace\nhow sweet the sound\n\nThat saved a wretch\nlike me"
        );
        assert_eq!(song.sections[1].lyrics, "My chains are gone");
        assert_eq!(song.arrangement, ["v1", "c", "c"]);
    }

    #[test]
    fn propresenter_5_reads_rtf_from_attributes() {
        let xml = format!(
            r#"<RVPresentationDocument versionNumber="500" CCLISongTitle="" CCLILicenseNumber="123" CCLICopyrightInfo="(c) Someone">
 <groups><RVSlideGrouping name="Verse 1"><slides><RVDisplaySlide><displayElements><RVTextElement RTFData="{a}"/></displayElements></RVDisplaySlide></slides></RVSlideGrouping></groups>
</RVPresentationDocument>"#,
            a = b64(&rtf("Line one\nLine two")),
        );
        let song = parse_xml(&xml, "Fallback Title").unwrap().remove(0);
        assert_eq!(song.title, "Fallback Title");
        assert_eq!(song.ccli_number, "123");
        assert_eq!(song.copyright, "(c) Someone");
        assert_eq!(song.sections[0].lyrics, "Line one\nLine two");
    }

    #[test]
    fn rejects_other_xml_and_empty_songs() {
        assert!(parse_xml("<other/>", "x").is_err());
        assert!(parse_xml(r#"<RVPresentationDocument versionNumber="600"/>"#, "x").is_err());
    }

    #[test]
    fn propresenter_7_pulls_embedded_rtf_in_order() {
        let mut data = vec![0x0a, 0x05, b'a', 0xff];
        for text in ["First slide", "Second slide", "Second slide", "Third slide"] {
            let doc = rtf(text);
            data.push(0x12);
            data.push(doc.len() as u8);
            data.extend_from_slice(doc.as_bytes());
            data.extend_from_slice(&[0x1a, 0x00]);
        }
        let song = parse_pro7(&data, "Great Song").unwrap().remove(0);
        assert_eq!(song.title, "Great Song");
        assert_eq!(
            song.sections
                .iter()
                .map(|s| s.lyrics.as_str())
                .collect::<Vec<_>>(),
            ["First slide", "Second slide", "Third slide"]
        );
        assert!(parse_pro7(&[1, 2, 3], "x").is_err());
    }
}
