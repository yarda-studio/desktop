//! A small RTF-to-plain-text converter for the lyric blobs that EasyWorship and
//! ProPresenter store. It keeps the text, paragraph breaks and special
//! characters and drops fonts, colours and formatting; it is not a general RTF
//! renderer.

/// Control words whose group holds no visible text.
const SKIPPED_DESTINATIONS: &[&str] = &[
    "fonttbl",
    "colortbl",
    "stylesheet",
    "info",
    "pict",
    "header",
    "footer",
    "headerl",
    "headerr",
    "footerl",
    "footerr",
    "generator",
    "expandedcolortbl",
    "listtable",
    "listoverridetable",
    "themedata",
    "colorschememapping",
    "latentstyles",
    "datastore",
    "rsidtbl",
    "xmlnstbl",
    "filetbl",
    "revtbl",
    "fldinst",
    "object",
    "private",
    "mmathPr",
    "wgrffmtfilter",
];

/// The Windows-1252 characters in 0x80..=0x9F; everything else maps to the same code point.
const CP1252_HIGH: [char; 32] = [
    '€', '\u{81}', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', '\u{8d}', 'Ž', '\u{8f}',
    '\u{90}', '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', '\u{9d}', 'ž', 'Ÿ',
];

fn cp1252(byte: u8) -> char {
    if (0x80..=0x9f).contains(&byte) {
        CP1252_HIGH[(byte - 0x80) as usize]
    } else {
        byte as char
    }
}

#[derive(Clone, Copy)]
struct Group {
    skip: bool,
    /// How many fallback characters follow each \uN.
    uc: usize,
}

/// True when `data` starts like an RTF document.
pub fn looks_like_rtf(data: &[u8]) -> bool {
    data.iter()
        .skip_while(|b| b.is_ascii_whitespace())
        .take(5)
        .copied()
        .eq(*b"{\\rtf")
}

pub fn rtf_to_text(data: &[u8]) -> String {
    let mut out = String::new();
    let mut stack: Vec<Group> = Vec::new();
    let mut cur = Group { skip: false, uc: 1 };
    let mut skip_fallback = 0usize;
    let mut i = 0;

    while i < data.len() {
        let b = data[i];
        match b {
            b'{' => {
                stack.push(cur);
                i += 1;
            }
            b'}' => {
                if let Some(g) = stack.pop() {
                    cur = g;
                }
                i += 1;
            }
            b'\r' | b'\n' => i += 1,
            b'\\' => {
                i += 1;
                let Some(&c) = data.get(i) else { break };
                match c {
                    b'\\' | b'{' | b'}' => {
                        if skip_fallback > 0 {
                            skip_fallback -= 1;
                        } else if !cur.skip {
                            out.push(c as char);
                        }
                        i += 1;
                    }
                    // A backslash before a line break is a paragraph break.
                    b'\r' | b'\n' => {
                        if !cur.skip {
                            out.push('\n');
                        }
                        i += 1;
                    }
                    b'*' => {
                        cur.skip = true;
                        i += 1;
                    }
                    b'\'' => {
                        let hex = data
                            .get(i + 1..i + 3)
                            .and_then(|h| std::str::from_utf8(h).ok())
                            .and_then(|h| u8::from_str_radix(h, 16).ok());
                        i += 3;
                        if let Some(v) = hex {
                            if skip_fallback > 0 {
                                skip_fallback -= 1;
                            } else if !cur.skip {
                                out.push(cp1252(v));
                            }
                        }
                    }
                    b'~' => {
                        if !cur.skip {
                            out.push('\u{a0}');
                        }
                        i += 1;
                    }
                    b'_' => {
                        if !cur.skip {
                            out.push('-');
                        }
                        i += 1;
                    }
                    b'-' | b'|' | b':' => i += 1,
                    c if c.is_ascii_alphabetic() => {
                        let start = i;
                        while data.get(i).is_some_and(|b| b.is_ascii_alphabetic()) {
                            i += 1;
                        }
                        let word = std::str::from_utf8(&data[start..i]).unwrap_or("");
                        let neg = data.get(i) == Some(&b'-');
                        if neg {
                            i += 1;
                        }
                        let num_start = i;
                        while data.get(i).is_some_and(|b| b.is_ascii_digit()) {
                            i += 1;
                        }
                        let param: Option<i64> = std::str::from_utf8(&data[num_start..i])
                            .ok()
                            .and_then(|s| s.parse().ok())
                            .map(|n: i64| if neg { -n } else { n });
                        if data.get(i) == Some(&b' ') {
                            i += 1;
                        }

                        if SKIPPED_DESTINATIONS.contains(&word) {
                            cur.skip = true;
                            continue;
                        }
                        if cur.skip {
                            continue;
                        }
                        match word {
                            "par" | "line" | "sect" | "page" => out.push('\n'),
                            "tab" => out.push('\t'),
                            "emdash" => out.push('—'),
                            "endash" => out.push('–'),
                            "lquote" => out.push('‘'),
                            "rquote" => out.push('’'),
                            "ldblquote" => out.push('“'),
                            "rdblquote" => out.push('”'),
                            "bullet" => out.push('•'),
                            "uc" => cur.uc = param.unwrap_or(1).clamp(0, 8) as usize,
                            "u" => {
                                if let Some(n) = param {
                                    let code = if n < 0 { (n + 65536) as u32 } else { n as u32 };
                                    out.push(char::from_u32(code).unwrap_or('\u{fffd}'));
                                    skip_fallback = cur.uc;
                                }
                            }
                            _ => {}
                        }
                    }
                    _ => i += 1,
                }
            }
            _ => {
                i += 1;
                if skip_fallback > 0 {
                    skip_fallback -= 1;
                } else if !cur.skip {
                    out.push(cp1252(b));
                }
            }
        }
    }
    tidy(&out)
}

/// Trim line ends, collapse runs of blank lines to one, and trim the whole text.
fn tidy(text: &str) -> String {
    let mut lines: Vec<&str> = Vec::new();
    let mut blank = false;
    let cleaned = text.replace('\u{a0}', " ");
    for line in cleaned.lines() {
        let line = line.trim_end();
        if line.trim().is_empty() {
            blank = true;
            continue;
        }
        if blank && !lines.is_empty() {
            lines.push("");
        }
        blank = false;
        lines.push(line.trim_start_matches(' '));
    }
    lines.join("\n")
}

/// Every top-level `{\rtf…}` document found in `data`, in order. Used for binary
/// files that embed RTF as raw bytes between other data.
pub fn extract_embedded_rtf(data: &[u8]) -> Vec<&[u8]> {
    const MARK: &[u8] = b"{\\rtf";
    let mut found = Vec::new();
    let mut i = 0;
    while i + MARK.len() <= data.len() {
        if &data[i..i + MARK.len()] != MARK {
            i += 1;
            continue;
        }
        let mut depth = 0i32;
        let mut j = i;
        let mut end = None;
        while j < data.len() {
            match data[j] {
                b'\\' => j += 1, // skip the escaped byte so \{ and \} don't count
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        end = Some(j + 1);
                        break;
                    }
                }
                _ => {}
            }
            j += 1;
        }
        match end {
            Some(e) => {
                found.push(&data[i..e]);
                i = e;
            }
            None => i += MARK.len(),
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_formatting_and_keeps_paragraphs() {
        let rtf = br"{\rtf1\ansi\deff0{\fonttbl{\f0\fnil Arial;}}{\colortbl;\red0\green0\blue0;}\pard\qc\f0\fs60 Verse 1\par Amazing grace\par how sweet the sound\par\par Chorus\par My chains are gone}";
        assert_eq!(
            rtf_to_text(rtf),
            "Verse 1\nAmazing grace\nhow sweet the sound\n\nChorus\nMy chains are gone"
        );
    }

    #[test]
    fn decodes_escapes() {
        // The \u control word is spliced in so the unicode escape isn't read as Rust syntax.
        let rtf = format!(
            "{{\\rtf1 caf\\'e9 {}8217? s \\\\ \\{{x\\}} \\'93q\\'94}}",
            "\\u"
        );
        assert_eq!(rtf_to_text(rtf.as_bytes()), "café ’ s \\ {x} “q”");
        // A negative \u value is a 16-bit code point (here U+2200); an unpaired surrogate becomes U+FFFD.
        assert_eq!(
            rtf_to_text(br"{\rtf1 \u-30720?\u-10179?}"),
            "\u{8800}\u{fffd}"
        );
    }

    #[test]
    fn skips_ignorable_destinations() {
        assert_eq!(
            rtf_to_text(br"{\rtf1{\*\generator Riched20;}{\info{\title X}}Hello}"),
            "Hello"
        );
    }

    #[test]
    fn backslash_newline_is_a_paragraph_break() {
        assert_eq!(rtf_to_text(b"{\\rtf1 one\\\ntwo}"), "one\ntwo");
    }

    #[test]
    fn finds_rtf_embedded_in_binary() {
        let mut data = vec![0u8, 1, 2, 0xff];
        data.extend_from_slice(br"{\rtf1 a \{ b\}}");
        data.extend_from_slice(&[9, 9, 9]);
        data.extend_from_slice(br"{\rtf1 second}");
        let docs = extract_embedded_rtf(&data);
        assert_eq!(docs.len(), 2);
        assert_eq!(rtf_to_text(docs[0]), "a { b}");
        assert_eq!(rtf_to_text(docs[1]), "second");
        assert!(looks_like_rtf(b"  {\\rtf1"));
        assert!(!looks_like_rtf(b"plain"));
    }
}
