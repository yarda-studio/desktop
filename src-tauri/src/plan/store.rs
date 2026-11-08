use super::model::PlanItem;
use crate::types::{AppError, Result};
use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

const MAX_ITEMS: usize = 200;
const MAX_TITLE_CHARS: usize = 200;
const MAX_NOTE_CHARS: usize = 2_000;
/// A plan step longer than a day is a typo.
const MAX_SECS: i64 = 24 * 60 * 60;

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS plan_items (
    position      INTEGER PRIMARY KEY,
    id            TEXT NOT NULL UNIQUE,
    kind          TEXT NOT NULL,
    title         TEXT NOT NULL,
    subtitle      TEXT NOT NULL DEFAULT '',
    ref_id        INTEGER,
    book          TEXT,
    chapter       INTEGER,
    verse         INTEGER,
    module        TEXT,
    duration_secs INTEGER,
    note          TEXT NOT NULL DEFAULT ''
);
-- Cloud sync bookkeeping (see sync.rs): when the plan was last edited here and
-- whether that edit has been sent yet. One row.
CREATE TABLE IF NOT EXISTS plan_sync (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    updated_at TEXT NOT NULL DEFAULT '',
    dirty      INTEGER NOT NULL DEFAULT 0
);
";

/// Holds the plan database, or the reason it could not be opened, so a broken
/// `plan.db` shows up as an error in the plan only.
pub struct PlanStore(std::result::Result<PlanDb, String>);

impl PlanStore {
    pub fn open(path: &Path) -> Self {
        Self(PlanDb::open(path).map_err(|e| e.to_string()))
    }

    pub fn db(&self) -> Result<&PlanDb> {
        self.0
            .as_ref()
            .map_err(|e| AppError::Other(format!("Service plan unavailable: {e}")))
    }
}

pub struct PlanDb(Mutex<Connection>);

fn clip(s: &str, max_chars: usize) -> String {
    s.trim().chars().take(max_chars).collect()
}

fn default_title(item: &PlanItem) -> String {
    match item.kind.as_str() {
        "verse" => format!(
            "{} {}:{}",
            item.book.as_deref().unwrap_or(""),
            item.chapter.unwrap_or(1),
            item.verse.unwrap_or(1)
        ),
        "song" => "Song".into(),
        "slide" => "Slide".into(),
        "countdown" => "Countdown".into(),
        "black" => "Black screen".into(),
        _ => "Note".into(),
    }
}

/// `require_link`: a song or slide step must name the song or slide. A plan that
/// arrives from another device cannot, because their ids are not ours; those
/// steps are kept and shown as not linked.
fn clean_item(
    item: &PlanItem,
    index: usize,
    seen: &mut HashSet<String>,
    require_link: bool,
) -> Result<PlanItem> {
    let kind = match item.kind.as_str() {
        "verse" | "song" | "slide" | "countdown" | "black" | "note" => item.kind.as_str(),
        _ => {
            return Err(AppError::Other(format!(
                "Step {} has an unknown type.",
                index + 1
            )))
        }
    };

    // Ids must be short and unique; anything else is replaced rather than failing the save.
    let mut id = if item.id.is_empty() || item.id.len() > 40 {
        format!("i{index}")
    } else {
        item.id.clone()
    };
    while !seen.insert(id.clone()) {
        id.push('_');
    }

    let mut out = PlanItem {
        id,
        kind: kind.into(),
        title: clip(&item.title, MAX_TITLE_CHARS),
        subtitle: clip(&item.subtitle, MAX_TITLE_CHARS),
        note: clip(&item.note, MAX_NOTE_CHARS),
        duration_secs: item.duration_secs.map(|s| s.clamp(0, MAX_SECS)),
        ..Default::default()
    };

    match kind {
        "song" | "slide" => {
            out.ref_id = match item.ref_id {
                Some(id) => Some(id),
                None if !require_link => None,
                None => {
                    return Err(AppError::Other(format!(
                        "Step {} must point at a {kind}.",
                        index + 1
                    )))
                }
            };
        }
        "verse" => {
            let book = clip(item.book.as_deref().unwrap_or(""), 40);
            if book.is_empty() {
                return Err(AppError::Other(format!(
                    "Step {} needs a book of the Bible.",
                    index + 1
                )));
            }
            out.book = Some(book);
            out.chapter = Some(item.chapter.unwrap_or(1).clamp(1, 200));
            out.verse = Some(item.verse.unwrap_or(1).clamp(1, 200));
            out.module = item
                .module
                .as_deref()
                .map(|m| clip(m, 40))
                .filter(|m| !m.is_empty());
        }
        "countdown" if out.duration_secs.unwrap_or(0) == 0 => {
            return Err(AppError::Other(format!(
                "Step {} is a countdown and needs a length.",
                index + 1
            )));
        }
        _ => {}
    }

    if out.title.is_empty() {
        out.title = default_title(&out);
    }
    Ok(out)
}

pub(super) fn clean(items: &[PlanItem], require_link: bool) -> Result<Vec<PlanItem>> {
    if items.len() > MAX_ITEMS {
        return Err(AppError::Other(format!(
            "A plan can have at most {MAX_ITEMS} steps."
        )));
    }
    let mut seen = HashSet::new();
    items
        .iter()
        .enumerate()
        .map(|(i, item)| clean_item(item, i, &mut seen, require_link))
        .collect()
}

/// The plan's steps in order.
pub(super) fn read_items(conn: &Connection) -> Result<Vec<PlanItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, kind, title, subtitle, ref_id, book, chapter, verse, module, duration_secs, note
         FROM plan_items ORDER BY position",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(PlanItem {
            id: r.get(0)?,
            kind: r.get(1)?,
            title: r.get(2)?,
            subtitle: r.get(3)?,
            ref_id: r.get(4)?,
            book: r.get(5)?,
            chapter: r.get(6)?,
            verse: r.get(7)?,
            module: r.get(8)?,
            duration_secs: r.get(9)?,
            note: r.get(10)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

impl PlanDb {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self(Mutex::new(conn)))
    }

    #[cfg(test)]
    pub(super) fn in_memory() -> Self {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        Self(Mutex::new(conn))
    }

    /// Recover from a poisoned lock rather than bricking the plan for the rest of the session.
    pub(crate) fn conn(&self) -> MutexGuard<'_, Connection> {
        self.0.lock().unwrap_or_else(|p| p.into_inner())
    }

    pub fn list(&self) -> Result<Vec<PlanItem>> {
        read_items(&self.conn())
    }

    /// Replace the whole plan, in order. The list is validated first, so a bad
    /// step leaves the saved plan untouched. Returns the plan as stored (ids
    /// and text normalised) for the editor to adopt.
    pub fn replace(&self, items: &[PlanItem]) -> Result<Vec<PlanItem>> {
        let cleaned = clean(items, true)?;
        {
            let mut conn = self.conn();
            let tx = conn.transaction()?;
            write_items(&tx, &cleaned)?;
            // An edit made here: the cloud copy is now out of date.
            super::sync::mark_edited(&tx)?;
            tx.commit()?;
        }
        Ok(cleaned)
    }
}

/// Replace every step with `items` (already cleaned), inside the caller's transaction.
pub(super) fn write_items(tx: &rusqlite::Transaction, items: &[PlanItem]) -> Result<()> {
    tx.execute("DELETE FROM plan_items", [])?;
    let mut stmt = tx.prepare(
        "INSERT INTO plan_items
         (position, id, kind, title, subtitle, ref_id, book, chapter, verse, module, duration_secs, note)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
    )?;
    for (position, it) in items.iter().enumerate() {
        stmt.execute(params![
            position as i64,
            it.id,
            it.kind,
            it.title,
            it.subtitle,
            it.ref_id,
            it.book,
            it.chapter,
            it.verse,
            it.module,
            it.duration_secs,
            it.note,
        ])?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn song(id: &str, song_id: i64) -> PlanItem {
        PlanItem {
            id: id.into(),
            kind: "song".into(),
            title: "Amazing Grace".into(),
            ref_id: Some(song_id),
            ..Default::default()
        }
    }

    fn verse(id: &str) -> PlanItem {
        PlanItem {
            id: id.into(),
            kind: "verse".into(),
            book: Some("John".into()),
            chapter: Some(3),
            verse: Some(16),
            module: Some("KJV".into()),
            ..Default::default()
        }
    }

    fn cue(id: &str, kind: &str) -> PlanItem {
        PlanItem {
            id: id.into(),
            kind: kind.into(),
            ..Default::default()
        }
    }

    #[test]
    fn plan_round_trips_in_order_with_every_field() {
        let db = PlanDb::in_memory();
        let mut timed = song("b", 7);
        timed.subtitle = "Verses 1 and 3".into();
        timed.duration_secs = Some(240);
        timed.note = "Key of G".into();
        let saved = db
            .replace(&[verse("a"), timed, cue("c", "black"), cue("d", "note")])
            .unwrap();
        assert_eq!(saved, db.list().unwrap());
        let ids: Vec<_> = saved.iter().map(|i| i.id.as_str()).collect();
        assert_eq!(ids, ["a", "b", "c", "d"]);
        assert_eq!(saved[0].book.as_deref(), Some("John"));
        assert_eq!(saved[1].ref_id, Some(7));
        assert_eq!(saved[1].duration_secs, Some(240));
        assert_eq!(saved[1].note, "Key of G");
    }

    #[test]
    fn replace_swaps_the_whole_plan_and_empty_clears_it() {
        let db = PlanDb::in_memory();
        db.replace(&[song("a", 1), song("b", 2)]).unwrap();
        db.replace(&[song("c", 3)]).unwrap();
        assert_eq!(db.list().unwrap().len(), 1);
        db.replace(&[]).unwrap();
        assert!(db.list().unwrap().is_empty());
    }

    #[test]
    fn a_bad_step_rejects_the_save_and_keeps_the_old_plan() {
        let db = PlanDb::in_memory();
        db.replace(&[song("keep", 1)]).unwrap();

        let mut unknown = cue("x", "dance");
        unknown.title = "?".into();
        assert!(db.replace(&[song("a", 1), unknown]).is_err());

        let mut orphan = song("y", 0);
        orphan.ref_id = None;
        assert!(db.replace(&[orphan]).is_err(), "a song step needs a song");

        let mut no_book = verse("z");
        no_book.book = None;
        assert!(db.replace(&[no_book]).is_err(), "a verse step needs a book");

        assert!(
            db.replace(&[cue("t", "countdown")]).is_err(),
            "a countdown needs a length"
        );

        let too_many: Vec<_> = (0..=MAX_ITEMS)
            .map(|i| cue(&format!("n{i}"), "note"))
            .collect();
        assert!(db.replace(&too_many).is_err());

        let kept = db.list().unwrap();
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].id, "keep");
    }

    #[test]
    fn ids_are_made_unique_and_titles_defaulted() {
        let db = PlanDb::in_memory();
        let saved = db
            .replace(&[
                cue("same", "note"),
                cue("same", "black"),
                cue("", "note"),
                verse(&"x".repeat(80)),
            ])
            .unwrap();
        let unique: HashSet<_> = saved.iter().map(|i| i.id.clone()).collect();
        assert_eq!(unique.len(), 4);
        assert!(saved.iter().all(|i| i.id.len() <= 41));
        assert_eq!(saved[1].title, "Black screen");
        assert_eq!(saved[3].title, "John 3:16");
    }

    #[test]
    fn numbers_and_text_are_clamped() {
        let db = PlanDb::in_memory();
        let mut long = song("a", 1);
        long.title = "t".repeat(500);
        long.note = "n".repeat(5_000);
        long.duration_secs = Some(10_000_000);
        let mut neg = verse("b");
        neg.chapter = Some(-5);
        neg.verse = Some(9_999);
        neg.duration_secs = Some(-30);
        let saved = db.replace(&[long, neg]).unwrap();
        assert_eq!(saved[0].title.chars().count(), MAX_TITLE_CHARS);
        assert_eq!(saved[0].note.chars().count(), MAX_NOTE_CHARS);
        assert_eq!(saved[0].duration_secs, Some(MAX_SECS));
        assert_eq!(saved[1].chapter, Some(1));
        assert_eq!(saved[1].verse, Some(200));
        assert_eq!(saved[1].duration_secs, Some(0));
    }

    #[test]
    fn a_countdown_keeps_its_length() {
        let db = PlanDb::in_memory();
        let mut c = cue("c", "countdown");
        c.duration_secs = Some(300);
        let saved = db.replace(&[c]).unwrap();
        assert_eq!(saved[0].duration_secs, Some(300));
        assert_eq!(saved[0].title, "Countdown");
    }
}
