//! OpenSong songs: one XML file per song (OpenSong names them without an
//! extension) with the lyrics in a `<lyrics>` block.
//!
//! In the lyrics, `[V1]` starts a section, a leading space marks a lyric line,
//! `.` a chord line and `;` a comment (both dropped), `---` a slide break,
//! `|` a line break inside a line and `||` a slide break inside a line.

use super::{song_with, SongBuilder};
use crate::songs::model::Song;
use crate::types::{AppError, Result};
use quick_xml::events::Event;
use quick_xml::Reader;
use std::collections::HashMap;

pub fn looks_like_opensong(content: &str) -> bool {
    content.contains("<song") && content.contains("<lyrics") && !content.contains("openlyrics.info")
}

#[derive(Default)]
struct Fields {
    map: HashMap<String, String>,
}

impl Fields {
    fn get(&self, key: &str) -> &str {
        self.map.get(key).map(String::as_str).unwrap_or("")
    }
}

fn read_fields(xml: &str) -> Result<Fields> {
    let mut reader = Reader::from_str(xml);
    let mut fields = Fields::default();
    let mut depth = 0usize;
    let mut current: Option<String> = None;
    let err = |e: quick_xml::Error| AppError::Other(format!("Invalid OpenSong file: {e}"));
    loop {
        match reader.read_event().map_err(err)? {
            Event::Start(e) => {
                depth += 1;
                if depth == 2 {
                    current = Some(String::from_utf8_lossy(e.local_name().as_ref()).to_lowercase());
                }
            }
            Event::End(_) => {
                if depth == 2 {
                    current = None;
                }
                depth = depth.saturating_sub(1);
            }
            Event::Text(t) => {
                if let (Some(k), true) = (&current, depth >= 2) {
                    fields
                        .map
                        .entry(k.clone())
                        .or_default()
                        .push_str(&t.unescape().map_err(err)?);
                }
            }
            Event::CData(c) => {
                if let (Some(k), true) = (&current, depth >= 2) {
                    fields
                        .map
                        .entry(k.clone())
                        .or_default()
                        .push_str(&String::from_utf8_lossy(&c));
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(fields)
}

struct Section {
    header: String,
    lines: Vec<String>,
    /// Lines written for a particular verse inside a bare `[V]` section ("1 …", "2 …").
    numbered: Vec<(u32, Vec<String>)>,
}

impl Section {
    fn new(header: &str) -> Self {
        Self {
            header: header.trim().to_string(),
            lines: Vec::new(),
            numbered: Vec::new(),
        }
    }

    fn is_bare_verse(&self) -> bool {
        self.header.eq_ignore_ascii_case("v")
    }
}

/// Text of one lyric line with OpenSong's inline markers resolved.
fn lyric_text(raw: &str) -> String {
    raw.replace('_', "")
        .replace("||", "\n\n")
        .replace('|', "\n")
}

fn parse_lyrics(lyrics: &str) -> Vec<Section> {
    let mut sections: Vec<Section> = Vec::new();
    for raw in lyrics.replace("\r\n", "\n").lines() {
        let t = raw.trim();
        if t.is_empty() || raw.starts_with(';') || raw.starts_with('.') {
            continue;
        }
        if t == "---" || t == "-!!" {
            if let Some(s) = sections.last_mut() {
                if s.lines.last().is_some_and(|l| !l.is_empty()) {
                    s.lines.push(String::new());
                }
            }
            continue;
        }
        if t.starts_with('[') {
            if let Some(end) = t.find(']') {
                sections.push(Section::new(&t[1..end]));
                continue;
            }
        }
        if sections.is_empty() {
            sections.push(Section::new("V1"));
        }
        let section = sections.last_mut().unwrap();
        let body = raw.strip_prefix(' ').unwrap_or(raw);

        // "1 First verse line" inside a bare [V] section belongs to verse 1.
        let first = body.chars().next();
        if section.is_bare_verse() && first.is_some_and(|c| c.is_ascii_digit()) {
            let n = first.unwrap().to_digit(10).unwrap();
            let text = lyric_text(body[1..].trim_start());
            match section.numbered.iter_mut().find(|(k, _)| *k == n) {
                Some((_, lines)) => lines.push(text),
                None => section.numbered.push((n, vec![text])),
            }
            continue;
        }
        let text = lyric_text(body);
        if text.trim() == "" {
            if section.lines.last().is_some_and(|l| !l.is_empty()) {
                section.lines.push(String::new());
            }
        } else {
            section.lines.push(text);
        }
    }

    // Expand numbered lines into their own verses.
    let mut out = Vec::new();
    for s in sections {
        if s.numbered.is_empty() {
            out.push(s);
        } else {
            let mut numbered = s.numbered;
            numbered.sort_by_key(|(n, _)| *n);
            for (n, lines) in numbered {
                out.push(Section {
                    header: format!("V{n}"),
                    lines,
                    numbered: Vec::new(),
                });
            }
        }
    }
    out
}

pub fn parse(content: &str, stem: &str) -> Result<Vec<Song>> {
    let content = content.trim_start_matches('\u{feff}');
    let fields = read_fields(content)?;
    let sections = parse_lyrics(fields.get("lyrics"));
    if sections.is_empty() {
        return Err(AppError::Other("No lyrics found".into()));
    }

    // Sections written twice under one header are one section with more slides.
    let mut merged: Vec<(String, Vec<String>)> = Vec::new();
    for s in sections {
        let lyrics = s.lines.join("\n");
        match merged
            .iter_mut()
            .find(|(h, _)| h.eq_ignore_ascii_case(&s.header))
        {
            Some((_, slides)) => slides.push(lyrics),
            None => merged.push((s.header.clone(), vec![lyrics])),
        }
    }

    let mut builder = SongBuilder::new();
    let mut keys: HashMap<String, String> = HashMap::new();
    for (header, slides) in &merged {
        // Blank lines inside a section already start new slides.
        if let Some(key) = builder.add_group(Some(&format!("[{header}]")), slides) {
            keys.insert(header.to_lowercase(), key);
        }
    }
    if builder.is_empty() {
        return Err(AppError::Other("No lyrics found".into()));
    }

    // The <presentation> element is the playing order: "V1 C V2 C".
    let order: Vec<String> = fields
        .get("presentation")
        .split_whitespace()
        .filter_map(|tok| {
            let tok = tok.to_lowercase();
            keys.get(&tok)
                .or_else(|| keys.get(&format!("{tok}1")))
                .cloned()
        })
        .collect();
    builder.set_order(order);

    let mut song = song_with(
        fields.get("title"),
        stem,
        fields.get("author"),
        fields.get("copyright"),
        fields.get("ccli"),
    );
    let theme = fields.get("theme").trim();
    if !theme.is_empty() {
        song.tags.push(theme.to_string());
    }
    Ok(vec![builder.finish(song)])
}

#[cfg(test)]
mod tests {
    use super::*;

    const SONG: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<song>
  <title>Amazing Grace</title>
  <author>John Newton</author>
  <copyright>Public Domain</copyright>
  <ccli>4,768,151</ccli>
  <theme>Grace</theme>
  <presentation>V1 C V2 C</presentation>
  <lyrics>[V1]
.G        C
 Amazing grace how sweet the sound
 That saved a wretch like me
;a comment
[C]
 My chains are gone|I've been set free
[V2]
 The Lord has promised good to me
---
 His word my hope secures</lyrics>
</song>"#;

    #[test]
    fn parses_sections_order_and_fields() {
        let songs = parse(SONG, "file").unwrap();
        let s = &songs[0];
        assert_eq!(s.title, "Amazing Grace");
        assert_eq!(s.author, "John Newton");
        assert_eq!(s.ccli_number, "4768151");
        assert_eq!(s.tags, ["Grace"]);
        assert_eq!(
            s.sections
                .iter()
                .map(|x| (x.key.as_str(), x.label.as_str()))
                .collect::<Vec<_>>(),
            [("v1", "Verse 1"), ("c", "Chorus"), ("v2", "Verse 2")]
        );
        assert_eq!(
            s.sections[0].lyrics,
            "Amazing grace how sweet the sound\nThat saved a wretch like me"
        );
        assert_eq!(
            s.sections[1].lyrics,
            "My chains are gone\nI've been set free"
        );
        assert_eq!(
            s.sections[2].lyrics,
            "The Lord has promised good to me\n\nHis word my hope secures"
        );
        assert_eq!(s.arrangement, ["v1", "c", "v2", "c"]);
    }

    #[test]
    fn numbered_lines_in_a_bare_verse_section_become_verses() {
        let xml = "<song><title>T</title><lyrics>[V]\n1 First one\n2 Second one\n[C]\n Chorus line</lyrics></song>";
        let song = parse(xml, "").unwrap().remove(0);
        assert_eq!(
            song.sections
                .iter()
                .map(|x| x.key.as_str())
                .collect::<Vec<_>>(),
            ["v1", "v2", "c"]
        );
        assert_eq!(song.sections[1].lyrics, "Second one");
    }

    #[test]
    fn falls_back_to_the_file_name_and_rejects_empty_songs() {
        let song = parse("<song><lyrics>[V1]\n One line</lyrics></song>", "My Song")
            .unwrap()
            .remove(0);
        assert_eq!(song.title, "My Song");
        assert!(parse("<song><title>x</title><lyrics></lyrics></song>", "x").is_err());
        assert!(!looks_like_opensong(
            "<song xmlns=\"http://openlyrics.info/namespace/2009/song\"><lyrics/></song>"
        ));
        assert!(looks_like_opensong(SONG));
    }
}
