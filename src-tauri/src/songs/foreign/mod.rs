//! Importers for other presentation programs' song files: OpenSong,
//! ProPresenter and EasyWorship. Each turns a file into `Song` values without
//! saving anything; the Songs view previews them before they are imported.

use super::import::{normalise_lyrics, parse_label};
use super::model::{Song, SongSection};
use crate::types::{AppError, Result};
use serde::Serialize;
use std::path::{Path, PathBuf};

pub mod easyworship;
pub mod opensong;
pub mod propresenter;

/// Largest song database or bundle we will open (an EasyWorship library can be sizeable).
const MAX_BINARY_BYTES: u64 = 200 * 1024 * 1024;
const MAX_TEXT_BYTES: u64 = 2_000_000;
const MAX_FILES: usize = 5000;
const MAX_SONGS: usize = 20_000;
const MAX_REPORTED_ERRORS: usize = 12;

/// Builds a song's sections from groups of slides, the way other programs store
/// them. Identical groups are stored once and played wherever they occur, so a
/// chorus that appears three times becomes one section with an arrangement.
pub(super) struct SongBuilder {
    sections: Vec<SongSection>,
    order: Vec<String>,
    unlabelled: u32,
}

impl SongBuilder {
    pub fn new() -> Self {
        Self {
            sections: Vec::new(),
            order: Vec::new(),
            unlabelled: 0,
        }
    }

    /// Add one group (a verse, the chorus, …) made of one or more slides. Returns
    /// the key it is stored under, or None when it holds no text.
    pub fn add_group(&mut self, heading: Option<&str>, slides: &[String]) -> Option<String> {
        let slides: Vec<&str> = slides
            .iter()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();
        if slides.is_empty() {
            return None;
        }
        let lyrics = slides.join("\n\n");
        let norm = normalise_lyrics(&lyrics);
        if let Some(existing) = self
            .sections
            .iter()
            .find(|s| normalise_lyrics(&s.lyrics) == norm)
        {
            let key = existing.key.clone();
            self.order.push(key.clone());
            return Some(key);
        }
        let (base, label) = match heading.map(str::trim).filter(|h| !h.is_empty()) {
            Some(h) => parse_label(h).unwrap_or_else(|| (slug(h), h.to_string())),
            None => {
                self.unlabelled += 1;
                (
                    format!("v{}", self.unlabelled),
                    format!("Verse {}", self.unlabelled),
                )
            }
        };
        let mut key = base.clone();
        let mut n = 2;
        while self.sections.iter().any(|s| s.key == key) {
            key = format!("{base}_{n}");
            n += 1;
        }
        self.order.push(key.clone());
        self.sections.push(SongSection {
            key: key.clone(),
            label,
            lyrics,
        });
        Some(key)
    }

    pub fn is_empty(&self) -> bool {
        self.sections.is_empty()
    }

    /// Use the source's own playing order. Ignored when it is empty.
    pub fn set_order(&mut self, order: Vec<String>) {
        if !order.is_empty() {
            self.order = order;
        }
    }

    /// Put the sections (and the playing order, when it differs from the stored order) onto `song`.
    pub fn finish(self, mut song: Song) -> Song {
        let stored: Vec<&String> = self.sections.iter().map(|s| &s.key).collect();
        let arrangement = if self.order.iter().collect::<Vec<_>>() == stored {
            Vec::new()
        } else {
            self.order.clone()
        };
        song.sections = self.sections;
        song.arrangement = arrangement;
        song
    }
}

fn slug(heading: &str) -> String {
    let s: String = heading
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect::<String>()
        .trim_matches('_')
        .chars()
        .take(20)
        .collect();
    if s.is_empty() {
        "x".into()
    } else {
        format!("x_{s}")
    }
}

pub(super) fn file_stem(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

/// True for XML written by ProPresenter or OpenSong (as opposed to OpenLyrics).
pub fn is_foreign_xml(content: &str) -> bool {
    content.contains("<RVPresentationDocument") || opensong::looks_like_opensong(content)
}

/// Pick the right XML importer for a document's text (see `is_foreign_xml`).
pub fn parse_xml_text(stem: &str, content: &str) -> Result<Vec<Song>> {
    if content.contains("<RVPresentationDocument") {
        propresenter::parse_xml(content, stem)
    } else if opensong::looks_like_opensong(content) {
        opensong::parse(content, stem)
    } else {
        Err(AppError::Other("Not a recognised song file".into()))
    }
}

#[derive(Debug, Serialize)]
pub struct ImportCandidate {
    /// The file the song came from.
    pub source: String,
    pub song: Song,
}

#[derive(Debug, Default, Serialize)]
pub struct PathImport {
    pub candidates: Vec<ImportCandidate>,
    pub errors: Vec<String>,
}

/// Read and parse every picked file and folder. Never fails as a whole: a file
/// that can't be read is reported in `errors` and the rest still import.
pub fn parse_paths(paths: &[String]) -> PathImport {
    let mut out = PathImport::default();
    let mut files: Vec<(PathBuf, bool)> = Vec::new(); // (path, found inside a picked folder)
    for p in paths {
        let path = PathBuf::from(p);
        if path.is_dir() {
            files.extend(collect_folder(&path).into_iter().map(|f| (f, true)));
        } else {
            files.push((path, false));
        }
    }
    files.truncate(MAX_FILES);

    // A Songs.db and its SongWords.db are one library; read it once.
    let has_songs_db: Vec<PathBuf> = files
        .iter()
        .filter(|(f, _)| name_lower(f) == "songs.db")
        .filter_map(|(f, _)| f.parent().map(Path::to_path_buf))
        .collect();
    files.retain(|(f, _)| {
        !(name_lower(f) == "songwords.db"
            && f.parent()
                .is_some_and(|d| has_songs_db.iter().any(|x| x == d)))
    });

    let mut unreadable_in_folders = 0usize;
    for (file, from_folder) in files {
        if out.candidates.len() >= MAX_SONGS {
            out.errors.push(format!("Stopped after {MAX_SONGS} songs."));
            break;
        }
        match parse_path(&file) {
            Ok(songs) => {
                let source = file
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                out.candidates
                    .extend(songs.into_iter().map(|song| ImportCandidate {
                        source: source.clone(),
                        song,
                    }));
            }
            Err(e) if from_folder => {
                unreadable_in_folders += 1;
                if unreadable_in_folders <= MAX_REPORTED_ERRORS {
                    out.errors.push(format!(
                        "{}: {e}",
                        file.file_name().and_then(|n| n.to_str()).unwrap_or("file")
                    ));
                }
            }
            Err(e) => out.errors.push(format!(
                "{}: {e}",
                file.file_name().and_then(|n| n.to_str()).unwrap_or("file")
            )),
        }
    }
    if unreadable_in_folders > MAX_REPORTED_ERRORS {
        out.errors.push(format!(
            "…and {} more files in the folder were not songs.",
            unreadable_in_folders - MAX_REPORTED_ERRORS
        ));
    }
    out
}

fn name_lower(path: &Path) -> String {
    path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase()
}

/// Files in a folder that could be songs: known song extensions, EasyWorship
/// databases, and extensionless files (how OpenSong names its songs).
fn collect_folder(dir: &Path) -> Vec<PathBuf> {
    const EXTENSIONS: &[&str] = &[
        "txt", "xml", "pro", "pro4", "pro5", "pro6", "ewsx", "lyrics",
    ];
    walkdir::WalkDir::new(dir)
        .max_depth(5)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.into_path())
        .filter(|p| {
            let name = name_lower(p);
            if name.starts_with('.') {
                return false;
            }
            if name == "songs.db" || name == "songwords.db" {
                return true;
            }
            match p.extension().and_then(|e| e.to_str()) {
                None => true,
                Some(ext) => EXTENSIONS.contains(&ext.to_lowercase().as_str()),
            }
        })
        .take(MAX_FILES)
        .collect()
}

/// Parse one file, choosing the importer from its name and contents.
pub fn parse_path(path: &Path) -> Result<Vec<Song>> {
    let name = name_lower(path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let size = std::fs::metadata(path)?.len();

    if name == "songs.db" || name == "songwords.db" {
        check_size(size, MAX_BINARY_BYTES)?;
        return easyworship::parse_library(path);
    }
    if ext == "ewsx" {
        check_size(size, MAX_BINARY_BYTES)?;
        return easyworship::parse_ewsx(path);
    }

    check_size(
        size,
        MAX_TEXT_BYTES.max(if ext == "pro" { MAX_BINARY_BYTES } else { 0 }),
    )?;
    let bytes = std::fs::read(path)?;
    let stem = file_stem(path);
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(64)]);
    let xml = head
        .trim_start_matches('\u{feff}')
        .trim_start()
        .starts_with('<');

    if !xml && (ext == "pro" || super::rtf::extract_embedded_rtf(&bytes).len() > 0) {
        return propresenter::parse_pro7(&bytes, &stem);
    }
    let text = String::from_utf8_lossy(&bytes);
    // OpenLyrics, plain text and SongSelect downloads go through the general importer,
    // which hands ProPresenter and OpenSong XML back to this module.
    super::import::parse_song_file(&name_with_ext(path), &text)
}

fn name_with_ext(path: &Path) -> String {
    path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("song")
        .to_string()
}

fn check_size(size: u64, max: u64) -> Result<()> {
    if size > max {
        Err(AppError::Other("File is too large to import".into()))
    } else {
        Ok(())
    }
}

/// Fields shared by every importer's songs, so each only has to fill what it has.
pub(super) fn song_with(
    title: &str,
    stem: &str,
    author: &str,
    copyright: &str,
    ccli: &str,
) -> Song {
    let clean = |s: &str| s.split_whitespace().collect::<Vec<_>>().join(" ");
    Song {
        title: if clean(title).is_empty() {
            stem.trim().to_string()
        } else {
            clean(title)
        },
        author: clean(author),
        copyright: clean(copyright),
        ccli_number: ccli.chars().filter(|c| c.is_ascii_digit()).collect(),
        ..Default::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const OPENSONG: &str = "<song><title>Amazing Grace</title><lyrics>[V1]\n Amazing grace\n[C]\n My chains are gone</lyrics></song>";

    #[test]
    fn folder_import_finds_extensionless_opensong_files_and_reports_the_rest() {
        let dir =
            std::env::temp_dir().join(format!("scriptura-folder-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("Sets")).unwrap();
        std::fs::write(dir.join("Amazing Grace"), OPENSONG).unwrap(); // OpenSong has no extension
        std::fs::write(
            dir.join("Sets").join("notes.txt"),
            "Title Only\n\nVerse 1\nA line of words\n",
        )
        .unwrap();
        std::fs::write(dir.join("Sets").join("not a song"), "<set name=\"x\"/>").unwrap();
        std::fs::write(dir.join("cover.png"), [0x89, b'P', b'N', b'G']).unwrap(); // wrong extension: never read

        let result = parse_paths(&[dir.to_string_lossy().into_owned()]);
        let mut titles: Vec<_> = result
            .candidates
            .iter()
            .map(|c| c.song.title.as_str())
            .collect();
        titles.sort();
        assert_eq!(titles, ["Amazing Grace", "Title Only"]);
        assert_eq!(result.errors.len(), 1, "{:?}", result.errors);
        assert!(result.errors[0].starts_with("not a song"));

        // A picked file that can't be read is reported, not fatal.
        let missing = parse_paths(&[dir.join("missing.pro6").to_string_lossy().into_owned()]);
        assert!(missing.candidates.is_empty() && missing.errors.len() == 1);

        // The plain-text entry point (the old file picker) recognises OpenSong too.
        let via_text = crate::songs::import::parse_song_file("Amazing Grace", OPENSONG).unwrap();
        assert_eq!(via_text[0].sections.len(), 2);
        let _ = std::fs::remove_dir_all(dir);
    }
}
