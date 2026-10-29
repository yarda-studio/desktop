//! EasyWorship 6 and 7 songs.
//!
//! * The song library is two SQLite files in EasyWorship's data folder:
//!   `Songs.db` (title, author, copyright, CCLI number) and `SongWords.db` (the
//!   lyrics as RTF, one row per song).
//! * A song or service exported as `.ewsx` is a zip holding a `main.db` SQLite
//!   file whose slides carry the same RTF.
//!
//! Older EasyWorship (2009 and before) used a different database format, which
//! is not read here.

use super::{song_with, SongBuilder};
use crate::songs::import::parse_label;
use crate::songs::model::Song;
use crate::songs::rtf::{looks_like_rtf, rtf_to_text};
use crate::types::{AppError, Result};
use rusqlite::types::ValueRef;
use rusqlite::{Connection, OpenFlags};
use std::io::Read;
use std::path::{Path, PathBuf};

const MAX_SONGS: usize = 20_000;

/// A scratch folder removed when dropped, so the user's own databases are never opened in place.
struct Scratch(PathBuf);

impl Scratch {
    fn new() -> Result<Self> {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("scriptura-ew-{}-{nanos}", std::process::id()));
        std::fs::create_dir_all(&dir)?;
        Ok(Self(dir))
    }

    fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn open_read_only(path: &Path) -> Result<Connection> {
    Ok(Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?)
}

fn cell(v: ValueRef) -> String {
    match v {
        ValueRef::Null => String::new(),
        ValueRef::Integer(i) => i.to_string(),
        ValueRef::Real(f) => f.to_string(),
        ValueRef::Text(b) | ValueRef::Blob(b) => String::from_utf8_lossy(b).into_owned(),
    }
}

fn cell_bytes(v: ValueRef) -> Vec<u8> {
    match v {
        ValueRef::Text(b) | ValueRef::Blob(b) => b.to_vec(),
        other => cell(other).into_bytes(),
    }
}

/// Plain text of a lyrics blob, which is RTF in practice but may already be text.
fn lyrics_text(bytes: &[u8]) -> String {
    if looks_like_rtf(bytes) {
        rtf_to_text(bytes)
    } else {
        String::from_utf8_lossy(bytes).trim().to_string()
    }
}

/// Split a song's text into labelled groups. EasyWorship writes each slide as a
/// block that starts with its label ("Verse 1", "Chorus"); consecutive blocks
/// with the same label, and blocks with no label, continue the group before them.
fn build_song(blocks: &[String], song: Song) -> Option<Song> {
    let mut groups: Vec<(Option<String>, Vec<String>)> = Vec::new();
    for block in blocks.iter().map(|b| b.trim()).filter(|b| !b.is_empty()) {
        let (first, rest) = block.split_once('\n').unwrap_or((block, ""));
        let heading = parse_label(first).map(|_| first.trim().to_string());
        let body = if heading.is_some() {
            rest.trim()
        } else {
            block
        };
        match heading {
            Some(h)
                if groups
                    .last()
                    .is_some_and(|(lh, _)| lh.as_deref() == Some(h.as_str())) =>
            {
                groups.last_mut().unwrap().1.push(body.to_string())
            }
            Some(h) => groups.push((Some(h), vec![body.to_string()])),
            None => match groups.last_mut() {
                Some(last) => last.1.push(body.to_string()),
                None => groups.push((None, vec![body.to_string()])),
            },
        }
    }
    let mut builder = SongBuilder::new();
    for (heading, slides) in &groups {
        builder.add_group(heading.as_deref(), slides);
    }
    (!builder.is_empty()).then(|| builder.finish(song))
}

/// Blocks of a whole-song text: separated by blank lines.
fn blocks_of(text: &str) -> Vec<String> {
    text.split("\n\n").map(str::to_string).collect()
}

fn sibling(dir: &Path, wanted: &str) -> Option<PathBuf> {
    std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .find(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.eq_ignore_ascii_case(wanted))
        })
}

/// Read an EasyWorship 6/7 library from its `Songs.db` (or `SongWords.db`).
pub fn parse_library(picked: &Path) -> Result<Vec<Song>> {
    let dir = picked
        .parent()
        .ok_or_else(|| AppError::Other("Can't find the EasyWorship folder".into()))?;
    let songs_db = sibling(dir, "Songs.db")
        .ok_or_else(|| AppError::Other("Songs.db not found next to SongWords.db".into()))?;
    let words_db = sibling(dir, "SongWords.db")
        .ok_or_else(|| AppError::Other("SongWords.db not found next to Songs.db".into()))?;

    let scratch = Scratch::new()?;
    std::fs::copy(&songs_db, scratch.path("Songs.db"))?;
    std::fs::copy(&words_db, scratch.path("SongWords.db"))?;
    let songs = open_read_only(&scratch.path("Songs.db"))?;
    let words = open_read_only(&scratch.path("SongWords.db"))?;

    let not_ew = |e: rusqlite::Error| {
        AppError::Other(format!(
            "This doesn't look like an EasyWorship 6 or 7 library ({e})"
        ))
    };
    let mut list = songs
        .prepare("SELECT rowid, title, author, copyright, vendor_id FROM song ORDER BY title COLLATE NOCASE")
        .map_err(not_ew)?;
    let mut lyrics = words
        .prepare("SELECT words FROM word WHERE song_id = ?1 LIMIT 1")
        .map_err(not_ew)?;

    let mut out = Vec::new();
    let mut rows = list.query([]).map_err(not_ew)?;
    while let Some(row) = rows.next()? {
        if out.len() >= MAX_SONGS {
            break;
        }
        let id: i64 = row.get(0)?;
        let text = match lyrics.query_row([id], |r| Ok(lyrics_text(&cell_bytes(r.get_ref(0)?)))) {
            Ok(t) => t,
            Err(rusqlite::Error::QueryReturnedNoRows) => continue,
            Err(e) => return Err(e.into()),
        };
        let song = song_with(
            &cell(row.get_ref(1)?),
            "",
            &cell(row.get_ref(2)?),
            &cell(row.get_ref(3)?),
            &cell(row.get_ref(4)?),
        );
        if song.title.is_empty() {
            continue;
        }
        if let Some(song) = build_song(&blocks_of(&text), song) {
            out.push(song);
        }
    }
    if out.is_empty() {
        return Err(AppError::Other(
            "No songs found in this EasyWorship library".into(),
        ));
    }
    Ok(out)
}

/// Read a zip entry fully, tolerating the bad checksum EasyWorship writes for `main.db`.
fn read_entry_tolerant(entry: &mut impl Read) -> Result<Vec<u8>> {
    let mut data = Vec::new();
    match entry.read_to_end(&mut data) {
        Ok(_) => Ok(data),
        Err(e) if !data.is_empty() && e.to_string().to_lowercase().contains("checksum") => Ok(data),
        Err(e) => Err(e.into()),
    }
}

/// Read the songs in an EasyWorship `.ewsx` export.
pub fn parse_ewsx(path: &Path) -> Result<Vec<Song>> {
    let file = std::fs::File::open(path)?;
    let mut zip = zip::ZipArchive::new(file)
        .map_err(|e| AppError::Other(format!("Not an EasyWorship export: {e}")))?;
    let index = (0..zip.len())
        .find(|&i| {
            zip.by_index_raw(i)
                .map(|f| f.name().to_lowercase().ends_with("main.db"))
                .unwrap_or(false)
        })
        .ok_or_else(|| AppError::Other("Not an EasyWorship export (no main.db inside)".into()))?;
    let data = read_entry_tolerant(
        &mut zip
            .by_index(index)
            .map_err(|e| AppError::Other(e.to_string()))?,
    )?;

    let scratch = Scratch::new()?;
    std::fs::write(scratch.path("main.db"), data)?;
    let db = open_read_only(&scratch.path("main.db"))?;

    let not_ew = |e: rusqlite::Error| {
        AppError::Other(format!(
            "This doesn't look like an EasyWorship export ({e})"
        ))
    };
    // presentation_type 6 is a song; element_type 6 / style 4 is its lyric text.
    let mut songs = db
        .prepare("SELECT rowid, title, author, copyright, reference_number FROM presentation WHERE presentation_type = 6 ORDER BY rowid")
        .map_err(not_ew)?;
    let mut slides = db
        .prepare(
            "SELECT rt.rtf FROM slide s
             JOIN element e ON e.slide_id = s.rowid
             JOIN resource_text rt ON rt.resource_id = e.foreground_resource_id
             WHERE s.presentation_id = ?1 AND e.element_type = 6 AND e.element_style_type = 4
             ORDER BY s.order_index",
        )
        .map_err(not_ew)?;

    let mut out = Vec::new();
    let mut rows = songs.query([]).map_err(not_ew)?;
    while let Some(row) = rows.next()? {
        let id: i64 = row.get(0)?;
        let blocks: Vec<String> = slides
            .query_map([id], |r| Ok(lyrics_text(&cell_bytes(r.get_ref(0)?))))?
            .collect::<rusqlite::Result<_>>()?;
        let song = song_with(
            &cell(row.get_ref(1)?),
            "",
            &cell(row.get_ref(2)?),
            &cell(row.get_ref(3)?),
            &cell(row.get_ref(4)?),
        );
        if song.title.is_empty() {
            continue;
        }
        if let Some(song) = build_song(&blocks, song) {
            out.push(song);
        }
    }
    if out.is_empty() {
        return Err(AppError::Other(
            "No songs found in this EasyWorship export".into(),
        ));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn rtf(text: &str) -> String {
        format!(
            r"{{\rtf1\ansi\deff0{{\fonttbl{{\f0 Arial;}}}}\pard\fs60 {}}}",
            text.replace('\n', r"\par ")
        )
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("scriptura-ew-test-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn reads_an_ew6_library() {
        let dir = temp_dir("lib");
        let songs = Connection::open(dir.join("Songs.db")).unwrap();
        songs
            .execute_batch(
                "CREATE TABLE song (title TEXT, author TEXT, copyright TEXT, vendor_id INTEGER);",
            )
            .unwrap();
        songs.execute("INSERT INTO song (title, author, copyright, vendor_id) VALUES ('Amazing Grace', 'John Newton', 'Public Domain', 4768151)", []).unwrap();
        songs.execute("INSERT INTO song (title, author, copyright, vendor_id) VALUES ('No Words', '', '', NULL)", []).unwrap();
        drop(songs);
        let words = Connection::open(dir.join("songwords.db")).unwrap();
        words
            .execute_batch("CREATE TABLE word (song_id INTEGER, words BLOB);")
            .unwrap();
        let text = "Verse 1\nAmazing grace\nhow sweet the sound\n\nChorus\nMy chains are gone\n\nVerse 2\nThe Lord has promised\n\nChorus\nMy chains are gone";
        words
            .execute(
                "INSERT INTO word (song_id, words) VALUES (1, ?1)",
                [rtf(text).into_bytes()],
            )
            .unwrap();
        drop(words);

        // Picking either file finds the pair; names are matched case-insensitively.
        for picked in ["Songs.db", "songwords.db"] {
            let found = parse_library(&dir.join(picked)).unwrap();
            assert_eq!(found.len(), 1, "the song with no lyrics is skipped");
            let s = &found[0];
            assert_eq!(
                (s.title.as_str(), s.author.as_str(), s.ccli_number.as_str()),
                ("Amazing Grace", "John Newton", "4768151")
            );
            assert_eq!(
                s.sections
                    .iter()
                    .map(|x| x.key.as_str())
                    .collect::<Vec<_>>(),
                ["v1", "c", "v2"]
            );
            assert_eq!(s.sections[0].lyrics, "Amazing grace\nhow sweet the sound");
            assert_eq!(s.arrangement, ["v1", "c", "v2", "c"]);
        }
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn reads_an_ewsx_export() {
        let dir = temp_dir("ewsx");
        let db_path = dir.join("main.db");
        let db = Connection::open(&db_path).unwrap();
        db.execute_batch(
            "CREATE TABLE presentation (title TEXT, author TEXT, copyright TEXT, reference_number TEXT, presentation_type INTEGER);
             CREATE TABLE slide (presentation_id INTEGER, order_index INTEGER);
             CREATE TABLE element (slide_id INTEGER, element_type INTEGER, element_style_type INTEGER, foreground_resource_id INTEGER);
             CREATE TABLE resource_text (resource_id INTEGER, rtf TEXT);
             INSERT INTO presentation VALUES ('Great Is Thy Faithfulness', 'Thomas Chisholm', '1923', '18723', 6);
             INSERT INTO presentation VALUES ('Sunday Service', '', '', '', 5);",
        )
        .unwrap();
        // Slides inserted out of order: order_index decides.
        for (slide_id, order, resource, text) in [
            (1, 2, 11, "Chorus\nGreat is Thy faithfulness"),
            (2, 1, 10, "Verse 1\nO God my Father"),
            (3, 3, 12, "Verse 1\nThere is no shadow"),
        ] {
            db.execute(
                "INSERT INTO slide (rowid, presentation_id, order_index) VALUES (?1, 1, ?2)",
                rusqlite::params![slide_id, order],
            )
            .unwrap();
            db.execute(
                "INSERT INTO element VALUES (?1, 6, 4, ?2)",
                rusqlite::params![slide_id, resource],
            )
            .unwrap();
            db.execute(
                "INSERT INTO resource_text VALUES (?1, ?2)",
                rusqlite::params![resource, rtf(text)],
            )
            .unwrap();
        }
        drop(db);
        let bytes = std::fs::read(&db_path).unwrap();

        let zip_path = dir.join("export.ewsx");
        let mut zw = zip::ZipWriter::new(std::fs::File::create(&zip_path).unwrap());
        zw.start_file("main.db", zip::write::SimpleFileOptions::default())
            .unwrap();
        zw.write_all(&bytes).unwrap();
        zw.finish().unwrap();

        let found = parse_ewsx(&zip_path).unwrap();
        assert_eq!(found.len(), 1, "only presentation_type 6 is a song");
        let s = &found[0];
        assert_eq!(
            (s.title.as_str(), s.ccli_number.as_str()),
            ("Great Is Thy Faithfulness", "18723")
        );
        assert_eq!(
            s.sections
                .iter()
                .map(|x| x.lyrics.as_str())
                .collect::<Vec<_>>(),
            [
                "O God my Father",
                "Great is Thy faithfulness",
                "There is no shadow"
            ]
        );
        assert!(
            parse_ewsx(&db_path).is_err(),
            "a bare database is not an export"
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn unlabelled_slides_continue_the_previous_group() {
        let song = build_song(
            &[
                "Verse 1\nline a".into(),
                "line b".into(),
                "Chorus\nline c".into(),
            ],
            Song {
                title: "T".into(),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(song.sections[0].lyrics, "line a\n\nline b");
        assert_eq!(song.sections[1].lyrics, "line c");
    }
}
