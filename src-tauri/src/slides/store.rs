use super::model::{SlideDoc, SlideElement, SlidePage, SlideSummary};
use super::pictures::{is_picture_name, PictureFolder};
use crate::types::{AppError, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

const MAX_PAGES: usize = 50;
/// Per page.
const MAX_ELEMENTS: usize = 60;
const MAX_TEXT_BYTES: usize = 20_000;
const MAX_IMAGE_BYTES: usize = 6 * 1024 * 1024;
const MAX_DOC_BYTES: usize = 24 * 1024 * 1024;

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS slides (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    kind       TEXT NOT NULL,
    background TEXT NOT NULL DEFAULT 'theme',
    elements   TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS slide_schedule (
    slide_id INTEGER PRIMARY KEY REFERENCES slides(id) ON DELETE CASCADE,
    position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_slides_title ON slides(title COLLATE NOCASE);
";

/// Holds the slide database, or the reason it could not be opened, so a broken
/// `slides.db` shows up as an error in the Slides view only.
///
/// The picture folder is kept apart from the database result, so a backup can
/// still read the picture files when the database could not be opened.
pub struct SlideStore {
    db: std::result::Result<SlideDb, String>,
    pictures: PictureFolder,
}

impl SlideStore {
    pub fn open(path: &Path, pictures: PictureFolder) -> Self {
        let db = SlideDb::open(path, pictures.clone()).map_err(|e| e.to_string());
        if let Ok(db) = &db {
            // Move pictures saved inline by older versions out to files, and
            // drop files nothing refers to. A failure here changes nothing:
            // inline pictures keep working.
            if let Err(e) = db.tidy_pictures() {
                eprintln!("Slide pictures could not be tidied: {e}");
            }
        }
        Self { db, pictures }
    }

    pub fn db(&self) -> Result<&SlideDb> {
        self.db
            .as_ref()
            .map_err(|e| AppError::Other(format!("Slide library unavailable: {e}")))
    }

    pub fn pictures(&self) -> &PictureFolder {
        &self.pictures
    }
}

pub struct SlideDb {
    conn: Mutex<Connection>,
    pictures: PictureFolder,
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn is_hex_colour(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s[1..].bytes().all(|b| b.is_ascii_hexdigit())
}

/// Colours are interpolated into CSS, so only plain hex (and, for text, nothing
/// else) is accepted; anything else falls back to the default.
fn clean_colour(s: &str, fallback: &str) -> String {
    if is_hex_colour(s.trim()) {
        s.trim().to_string()
    } else {
        fallback.to_string()
    }
}

fn clean_element(e: &SlideElement, index: usize) -> Result<SlideElement> {
    let kind = if e.kind == "image" { "image" } else { "text" };
    if e.text.len() > MAX_TEXT_BYTES {
        return Err(AppError::Other("A text box is too long.".into()));
    }
    let image = match (kind, &e.image) {
        // A picture already saved as a file: only the name it was given is valid.
        ("image", Some(name)) if is_picture_name(name) => Some(name.clone()),
        ("image", Some(data)) => {
            if !data.starts_with("data:image/") {
                return Err(AppError::Other(
                    "A picture on the slide isn't a valid image.".into(),
                ));
            }
            if data.len() > MAX_IMAGE_BYTES {
                return Err(AppError::Other(
                    "A picture on the slide is too large.".into(),
                ));
            }
            Some(data.clone())
        }
        _ => None,
    };
    let id = if e.id.is_empty() || e.id.len() > 40 {
        format!("e{index}")
    } else {
        e.id.clone()
    };
    let align = match e.align.as_str() {
        "left" | "right" => e.align.clone(),
        _ => "center".into(),
    };
    Ok(SlideElement {
        id,
        kind: kind.into(),
        x: e.x.clamp(0.0, 100.0),
        y: e.y.clamp(0.0, 100.0),
        w: e.w.clamp(2.0, 100.0),
        h: e.h.clamp(2.0, 100.0),
        text: if kind == "text" {
            e.text.clone()
        } else {
            String::new()
        },
        font_size: e.font_size.clamp(10.0, 400.0),
        color: clean_colour(&e.color, "#ffffff"),
        align,
        bold: e.bold,
        auto_fit: kind == "text" && e.auto_fit,
        image,
    })
}

fn clean_background(b: &str) -> String {
    match b {
        "black" => "black".to_string(),
        b if is_hex_colour(b) => b.to_string(),
        _ => "theme".to_string(),
    }
}

/// A page id must be short and unique within its slide; anything else is replaced.
fn clean_page_id(id: &str, index: usize, seen: &mut HashSet<String>) -> String {
    let mut candidate = if id.is_empty() || id.len() > 40 {
        format!("p{index}")
    } else {
        id.to_string()
    };
    while !seen.insert(candidate.clone()) {
        candidate.push('_');
    }
    candidate
}

fn clean_page(page: &SlidePage, index: usize, seen: &mut HashSet<String>) -> Result<SlidePage> {
    if page.elements.len() > MAX_ELEMENTS {
        return Err(AppError::Other(format!(
            "A page can hold at most {MAX_ELEMENTS} items."
        )));
    }
    let elements = page
        .elements
        .iter()
        .enumerate()
        .map(|(i, e)| clean_element(e, i))
        .collect::<Result<Vec<_>>>()?;
    Ok(SlidePage {
        id: clean_page_id(&page.id, index, seen),
        background: clean_background(&page.background),
        elements,
    })
}

fn clean(doc: &SlideDoc) -> Result<SlideDoc> {
    if doc.pages.len() > MAX_PAGES {
        return Err(AppError::Other(format!(
            "A slide can have at most {MAX_PAGES} pages."
        )));
    }
    let kind = if doc.kind == "freeform" {
        "freeform"
    } else {
        "announcement"
    };
    // An announcement is one fixed layout, so only a free-form slide keeps extra pages.
    let keep = if kind == "freeform" { MAX_PAGES } else { 1 };
    let mut seen = HashSet::new();
    let mut pages = doc
        .pages
        .iter()
        .take(keep)
        .enumerate()
        .map(|(i, p)| clean_page(p, i, &mut seen))
        .collect::<Result<Vec<_>>>()?;
    if pages.is_empty() {
        pages.push(clean_page(&SlidePage::default(), 0, &mut seen)?);
    }
    let title = doc.title.trim();
    Ok(SlideDoc {
        id: doc.id,
        title: if title.is_empty() {
            "Untitled slide".into()
        } else {
            title.chars().take(200).collect()
        },
        kind: kind.into(),
        pages,
        updated_at: doc.updated_at,
    })
}

/// What the `elements` column holds. Slides saved before pages existed stored a
/// bare array of elements (their backdrop lived in the `background` column);
/// slides saved since store `{"pages": [...]}`. Reading both means no migration
/// and a restored old backup still opens.
#[derive(Deserialize)]
#[serde(untagged)]
enum StoredContent {
    Pages { pages: Vec<SlidePage> },
    Legacy(Vec<SlideElement>),
}

#[derive(Serialize)]
struct StoredPages<'a> {
    pages: &'a [SlidePage],
}

fn pages_from_row(elements_json: &str, background: &str) -> Vec<SlidePage> {
    let mut pages = match serde_json::from_str::<StoredContent>(elements_json) {
        Ok(StoredContent::Pages { pages }) => pages,
        Ok(StoredContent::Legacy(elements)) => vec![SlidePage {
            id: "p0".into(),
            background: background.to_string(),
            elements,
        }],
        Err(_) => Vec::new(),
    };
    if pages.is_empty() {
        pages.push(SlidePage {
            id: "p0".into(),
            background: background.to_string(),
            elements: Vec::new(),
        });
    }
    pages
}

impl SlideDb {
    pub fn open(path: &Path, pictures: PictureFolder) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;",
        )?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self {
            conn: Mutex::new(conn),
            pictures,
        })
    }

    #[cfg(test)]
    fn in_memory() -> Self {
        let dir = std::env::temp_dir().join(format!(
            "scriptura-slide-pictures-{}-{}",
            std::process::id(),
            now_millis()
        ));
        Self::in_memory_with(PictureFolder::new(dir))
    }

    #[cfg(test)]
    fn in_memory_with(pictures: PictureFolder) -> Self {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        Self {
            conn: Mutex::new(conn),
            pictures,
        }
    }

    /// Recover from a poisoned lock rather than bricking the library for the rest of the session.
    pub(crate) fn conn(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// Write every inline picture in `doc` to a file and put the file's name in
    /// its place. A type that is not kept as a file (SVG) stays inline.
    /// Returns how many pictures were moved.
    fn move_pictures_to_files(&self, doc: &mut SlideDoc) -> Result<usize> {
        let mut moved = 0;
        for element in doc.pages.iter_mut().flat_map(|p| p.elements.iter_mut()) {
            if let Some(image) = element.image.as_mut() {
                if image.starts_with("data:") {
                    if let Some(name) = self.pictures.save_data_url(image)? {
                        *image = name;
                        moved += 1;
                    }
                }
            }
        }
        Ok(moved)
    }

    /// Delete picture files no slide refers to. Skipped (nothing deleted) if
    /// the slides cannot be read, because then we cannot tell what is in use.
    fn remove_unused_pictures(&self, conn: &Connection) {
        let Ok(mut stmt) = conn.prepare("SELECT elements FROM slides") else {
            return;
        };
        let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) else {
            return;
        };
        let Ok(contents) = rows.collect::<rusqlite::Result<Vec<String>>>() else {
            return;
        };
        self.pictures
            .remove_unused(|name| contents.iter().any(|c| c.contains(name)));
    }

    /// Move pictures that older versions stored inside the slide to files.
    /// A slide whose pictures cannot all be converted is left as it was.
    fn move_inline_pictures(&self, conn: &Connection) -> Result<()> {
        let rows: Vec<(i64, String, String)> = {
            let mut stmt = conn.prepare(
                "SELECT id, elements, background FROM slides WHERE elements LIKE '%data:image/%'",
            )?;
            let it = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
            it.collect::<rusqlite::Result<_>>()?
        };
        for (id, elements, background) in rows {
            let mut doc = SlideDoc {
                pages: pages_from_row(&elements, &background),
                ..Default::default()
            };
            // Only rewrite a row when a picture really moved: a row that could
            // not be read parses as a blank page and must never be overwritten.
            match self.move_pictures_to_files(&mut doc) {
                Ok(moved) if moved > 0 => {}
                _ => continue,
            }
            let json = serde_json::to_string(&StoredPages { pages: &doc.pages })
                .map_err(|e| AppError::Other(e.to_string()))?;
            conn.execute(
                "UPDATE slides SET elements=?2 WHERE id=?1",
                params![id, json],
            )?;
        }
        Ok(())
    }

    /// Bring the picture files and the slides back into step: inline pictures
    /// become files, and files nothing refers to are deleted. Safe to run at any time.
    pub fn tidy_pictures(&self) -> Result<()> {
        let conn = self.conn();
        self.move_inline_pictures(&conn)?;
        self.remove_unused_pictures(&conn);
        Ok(())
    }

    /// The id of the slide with exactly this title (ignoring case); the oldest if
    /// several share it. Used to re-link a plan that came from another device.
    pub fn find_id_by_title(&self, title: &str) -> Result<Option<i64>> {
        Ok(self
            .conn()
            .query_row(
                "SELECT id FROM slides WHERE title = ?1 COLLATE NOCASE ORDER BY id LIMIT 1",
                [title.trim()],
                |r| r.get(0),
            )
            .optional()?)
    }

    pub fn list(&self, query: Option<&str>) -> Result<Vec<SlideSummary>> {
        let conn = self.conn();
        let map = |r: &rusqlite::Row| {
            Ok(SlideSummary {
                id: r.get(0)?,
                title: r.get(1)?,
                kind: r.get(2)?,
                updated_at: r.get(3)?,
            })
        };
        let needle = query.map(str::trim).filter(|q| !q.is_empty());
        let rows = match needle {
            Some(q) => {
                let like = format!(
                    "%{}%",
                    q.replace('\\', "\\\\")
                        .replace('%', "\\%")
                        .replace('_', "\\_")
                );
                let mut stmt = conn.prepare(
                    "SELECT id, title, kind, updated_at FROM slides
                     WHERE title LIKE ?1 ESCAPE '\\' ORDER BY title COLLATE NOCASE LIMIT 2000",
                )?;
                let it = stmt.query_map([like], map)?;
                it.collect::<rusqlite::Result<Vec<_>>>()?
            }
            None => {
                let mut stmt = conn.prepare(
                    "SELECT id, title, kind, updated_at FROM slides ORDER BY title COLLATE NOCASE LIMIT 2000",
                )?;
                let it = stmt.query_map([], map)?;
                it.collect::<rusqlite::Result<Vec<_>>>()?
            }
        };
        Ok(rows)
    }

    pub fn get(&self, id: i64) -> Result<SlideDoc> {
        let conn = self.conn();
        let (title, kind, background, elements, updated_at): (String, String, String, String, i64) =
            conn.query_row(
                "SELECT title, kind, background, elements, updated_at FROM slides WHERE id=?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => {
                    AppError::Other("That slide no longer exists.".into())
                }
                other => other.into(),
            })?;
        Ok(SlideDoc {
            id: Some(id),
            title,
            kind,
            pages: pages_from_row(&elements, &background),
            updated_at,
        })
    }

    pub fn save(&self, doc: &SlideDoc) -> Result<SlideDoc> {
        let mut doc = clean(doc)?;
        let now = now_millis();
        let id = {
            // The lock is held from writing the picture files to cleaning up
            // after the save, so a cleanup running for another save can never
            // delete a file this save has written but not yet recorded.
            let conn = self.conn();
            self.move_pictures_to_files(&mut doc)?;
            let elements = serde_json::to_string(&StoredPages { pages: &doc.pages })
                .map_err(|e| AppError::Other(e.to_string()))?;
            if elements.len() > MAX_DOC_BYTES {
                return Err(AppError::Other("This slide is too large to save.".into()));
            }
            // The `background` column predates pages; it mirrors the first page.
            let background = doc.pages[0].background.clone();
            let id = match doc.id {
                Some(id) => {
                    let changed = conn.execute(
                        "UPDATE slides SET title=?2, kind=?3, background=?4, elements=?5, updated_at=?6 WHERE id=?1",
                        params![id, doc.title, doc.kind, background, elements, now],
                    )?;
                    if changed == 0 {
                        return Err(AppError::Other("That slide no longer exists.".into()));
                    }
                    id
                }
                None => {
                    conn.execute(
                        "INSERT INTO slides (title, kind, background, elements, created_at, updated_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
                        params![doc.title, doc.kind, background, elements, now],
                    )?;
                    conn.last_insert_rowid()
                }
            };
            self.remove_unused_pictures(&conn);
            id
        };
        self.get(id)
    }

    pub fn delete(&self, id: i64) -> Result<()> {
        let conn = self.conn();
        conn.execute("DELETE FROM slides WHERE id=?1", [id])?;
        self.remove_unused_pictures(&conn);
        Ok(())
    }

    /// The schedule: slides in running order. Rows vanish with their slide.
    pub fn schedule(&self) -> Result<Vec<SlideSummary>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT s.id, s.title, s.kind, s.updated_at
             FROM slide_schedule q JOIN slides s ON s.id = q.slide_id ORDER BY q.position",
        )?;
        let it = stmt.query_map([], |r| {
            Ok(SlideSummary {
                id: r.get(0)?,
                title: r.get(1)?,
                kind: r.get(2)?,
                updated_at: r.get(3)?,
            })
        })?;
        Ok(it.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn set_schedule(&self, ids: &[i64]) -> Result<()> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM slide_schedule", [])?;
        for (position, id) in ids.iter().enumerate() {
            // Unknown ids and duplicates are skipped rather than failing the whole save.
            tx.execute(
                "INSERT OR IGNORE INTO slide_schedule (slide_id, position)
                 SELECT id, ?2 FROM slides WHERE id=?1",
                params![id, position as i64],
            )?;
        }
        tx.commit()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text_box(text: &str) -> SlideElement {
        SlideElement {
            id: "t".into(),
            text: text.into(),
            ..Default::default()
        }
    }

    fn page(id: &str, text: &str) -> SlidePage {
        SlidePage {
            id: id.into(),
            background: "theme".into(),
            elements: vec![text_box(text)],
        }
    }

    fn doc(title: &str) -> SlideDoc {
        SlideDoc {
            title: title.into(),
            kind: "announcement".into(),
            pages: vec![page("p0", "Welcome")],
            ..Default::default()
        }
    }

    fn freeform(title: &str, pages: Vec<SlidePage>) -> SlideDoc {
        SlideDoc {
            title: title.into(),
            kind: "freeform".into(),
            pages,
            ..Default::default()
        }
    }

    #[test]
    fn save_get_list_delete_round_trip() {
        let db = SlideDb::in_memory();
        let saved = db.save(&doc("Welcome")).unwrap();
        let id = saved.id.unwrap();
        assert_eq!(db.get(id).unwrap().pages[0].elements[0].text, "Welcome");

        let mut edited = saved.clone();
        edited.title = "Welcome back".into();
        db.save(&edited).unwrap();
        assert_eq!(db.list(None).unwrap().len(), 1);
        assert_eq!(db.list(Some("back")).unwrap().len(), 1);
        assert_eq!(db.list(Some("zzz")).unwrap().len(), 0);
        assert_eq!(
            db.list(Some("%")).unwrap().len(),
            0,
            "wildcards are literal"
        );

        db.delete(id).unwrap();
        assert!(db.get(id).is_err());
    }

    #[test]
    fn save_clamps_and_rejects_bad_input() {
        let db = SlideDb::in_memory();
        let mut d = doc("  ");
        d.pages[0].background = "url(javascript:alert(1))".into();
        d.pages[0].elements[0].color = "red; background:url(x)".into();
        d.pages[0].elements[0].x = 500.0;
        d.pages[0].elements[0].font_size = 9999.0;
        let saved = db.save(&d).unwrap();
        assert_eq!(saved.title, "Untitled slide");
        assert_eq!(saved.pages[0].background, "theme");
        assert_eq!(saved.pages[0].elements[0].color, "#ffffff");
        assert_eq!(saved.pages[0].elements[0].x, 100.0);
        assert_eq!(saved.pages[0].elements[0].font_size, 400.0);

        let mut bad = doc("Bad picture");
        bad.pages[0].elements.push(SlideElement {
            kind: "image".into(),
            image: Some("https://example.com/a.png".into()),
            ..Default::default()
        });
        assert!(db.save(&bad).is_err());

        let mut many = doc("Many");
        many.pages[0].elements = (0..=MAX_ELEMENTS).map(|_| text_box("x")).collect();
        assert!(db.save(&many).is_err());

        let mut ghost = doc("Ghost");
        ghost.id = Some(999);
        assert!(db.save(&ghost).is_err());
    }

    #[test]
    fn freeform_pages_round_trip_in_order_with_their_own_backgrounds() {
        let db = SlideDb::in_memory();
        let mut second = page("p1", "Two");
        second.background = "#112233".into();
        let saved = db
            .save(&freeform(
                "Deck",
                vec![page("p0", "One"), second, page("p2", "Three")],
            ))
            .unwrap();
        let got = db.get(saved.id.unwrap()).unwrap();
        let texts: Vec<_> = got
            .pages
            .iter()
            .map(|p| p.elements[0].text.as_str())
            .collect();
        assert_eq!(texts, ["One", "Two", "Three"]);
        assert_eq!(got.pages[1].background, "#112233");
        assert_eq!(got.pages[0].background, "theme");
    }

    #[test]
    fn pages_are_cleaned_capped_and_never_empty() {
        let db = SlideDb::in_memory();

        // Page 2's backdrop is sanitised just like page 1's.
        let mut bad = page("p1", "Two");
        bad.background = "url(x)".into();
        let saved = db
            .save(&freeform("Deck", vec![page("p0", "One"), bad]))
            .unwrap();
        assert_eq!(saved.pages[1].background, "theme");

        // Duplicate or missing page ids are made unique.
        let ids: Vec<_> = db
            .save(&freeform(
                "Ids",
                vec![page("same", "a"), page("same", "b"), page("", "c")],
            ))
            .unwrap()
            .pages
            .into_iter()
            .map(|p| p.id)
            .collect();
        assert_eq!(ids.len(), 3);
        assert_eq!(ids.iter().collect::<HashSet<_>>().len(), 3);

        // A per-page element cap, a page cap, and an empty slide still gets a page.
        let mut crowded = page("p0", "x");
        crowded.elements = (0..=MAX_ELEMENTS).map(|_| text_box("x")).collect();
        assert!(db.save(&freeform("Crowded", vec![crowded])).is_err());
        let too_many = (0..=MAX_PAGES)
            .map(|i| page(&format!("p{i}"), "x"))
            .collect();
        assert!(db.save(&freeform("Long", too_many)).is_err());
        let empty = db.save(&freeform("Empty", vec![])).unwrap();
        assert_eq!(empty.pages.len(), 1);
        assert!(empty.pages[0].elements.is_empty());
    }

    #[test]
    fn announcements_keep_only_their_first_page() {
        let db = SlideDb::in_memory();
        let mut d = doc("Notice");
        d.pages.push(page("p1", "Extra"));
        assert_eq!(db.save(&d).unwrap().pages.len(), 1);
    }

    #[test]
    fn slides_saved_before_pages_existed_open_as_one_page() {
        let db = SlideDb::in_memory();
        let legacy = serde_json::to_string(&vec![text_box("Old slide")]).unwrap();
        db.conn()
            .execute(
                "INSERT INTO slides (title, kind, background, elements, created_at, updated_at)
                 VALUES ('Old', 'freeform', '#abcdef', ?1, 1, 1)",
                [legacy],
            )
            .unwrap();
        // Take the id first: `get` locks the connection, so the guard must be gone by then.
        let id = db.conn().last_insert_rowid();
        let got = db.get(id).unwrap();
        assert_eq!(got.pages.len(), 1);
        assert_eq!(got.pages[0].background, "#abcdef");
        assert_eq!(got.pages[0].elements[0].text, "Old slide");
    }

    #[test]
    fn schedule_orders_dedupes_and_follows_deletes() {
        let db = SlideDb::in_memory();
        let a = db.save(&doc("A")).unwrap().id.unwrap();
        let b = db.save(&doc("B")).unwrap().id.unwrap();
        db.set_schedule(&[b, a, a, 12345]).unwrap();
        let titles: Vec<_> = db
            .schedule()
            .unwrap()
            .into_iter()
            .map(|s| s.title)
            .collect();
        assert_eq!(titles, ["B", "A"]);
        db.delete(b).unwrap();
        assert_eq!(db.schedule().unwrap().len(), 1);
    }

    // ---- pictures as files ----

    use base64::{engine::general_purpose::STANDARD, Engine};

    fn picture_url(extra: u8) -> String {
        format!(
            "data:image/jpeg;base64,{}",
            STANDARD.encode([0xFF, 0xD8, 0xFF, 0xE0, extra])
        )
    }

    fn picture_box(image: &str) -> SlideElement {
        SlideElement {
            id: "pic".into(),
            kind: "image".into(),
            image: Some(image.into()),
            ..Default::default()
        }
    }

    fn with_picture(title: &str, image: &str) -> SlideDoc {
        let mut d = freeform(title, vec![page("p0", "Hi")]);
        d.pages[0].elements.push(picture_box(image));
        d
    }

    fn stored_json(db: &SlideDb, id: i64) -> String {
        db.conn()
            .query_row("SELECT elements FROM slides WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .unwrap()
    }

    fn fresh_db(tag: &str) -> (SlideDb, PictureFolder) {
        let dir = std::env::temp_dir().join(format!(
            "scriptura-slide-test-{tag}-{}-{}",
            std::process::id(),
            now_millis()
        ));
        let folder = PictureFolder::new(dir);
        (SlideDb::in_memory_with(folder.clone()), folder)
    }

    #[test]
    fn a_saved_picture_is_a_file_and_the_row_keeps_only_its_name() {
        let (db, folder) = fresh_db("save");
        let saved = db.save(&with_picture("Deck", &picture_url(1))).unwrap();
        let name = saved.pages[0].elements[1].image.clone().unwrap();
        assert!(is_picture_name(&name), "got {name}");
        assert_eq!(folder.names(), vec![name.clone()]);
        let json = stored_json(&db, saved.id.unwrap());
        assert!(json.contains(&name));
        assert!(
            !json.contains("base64"),
            "the picture is not in the database"
        );

        // Saving the slide again with the name keeps the same file.
        let again = db.save(&saved).unwrap();
        assert_eq!(
            again.pages[0].elements[1].image.as_deref(),
            Some(name.as_str())
        );
        assert_eq!(folder.names().len(), 1);
        let _ = std::fs::remove_dir_all(folder.dir());
    }

    #[test]
    fn a_file_is_kept_while_any_slide_uses_it_and_removed_after() {
        let (db, folder) = fresh_db("share");
        let first = db.save(&with_picture("A", &picture_url(1))).unwrap();
        // A copy of the slide (saved with no id) shares the file.
        let mut copy = first.clone();
        copy.id = None;
        copy.title = "B".into();
        let second = db.save(&copy).unwrap();
        assert_eq!(folder.names().len(), 1);

        db.delete(first.id.unwrap()).unwrap();
        assert_eq!(folder.names().len(), 1, "the copy still uses it");
        db.delete(second.id.unwrap()).unwrap();
        assert!(folder.names().is_empty(), "nothing uses it any more");
        let _ = std::fs::remove_dir_all(folder.dir());
    }

    #[test]
    fn removing_the_picture_from_a_slide_removes_its_file() {
        let (db, folder) = fresh_db("remove");
        let mut saved = db.save(&with_picture("A", &picture_url(1))).unwrap();
        saved.pages[0].elements.pop();
        db.save(&saved).unwrap();
        assert!(folder.names().is_empty());
        let _ = std::fs::remove_dir_all(folder.dir());
    }

    #[test]
    fn a_bad_picture_is_refused_and_leaves_no_file() {
        let (db, folder) = fresh_db("bad");
        let not_an_image = format!("data:image/png;base64,{}", STANDARD.encode("<html>"));
        assert!(db.save(&with_picture("A", &not_an_image)).is_err());
        // A made-up name is not accepted as a picture either.
        assert!(db.save(&with_picture("A", "../../etc/passwd")).is_err());
        assert!(db.list(None).unwrap().is_empty());
        assert!(folder.names().is_empty());
        let _ = std::fs::remove_dir_all(folder.dir());
    }

    #[test]
    fn tidy_moves_old_inline_pictures_out_and_leaves_unreadable_rows_alone() {
        let (db, folder) = fresh_db("migrate");
        // A row the way an older version wrote it: the picture inside the JSON.
        let old = serde_json::to_string(&StoredPages {
            pages: &[SlidePage {
                id: "p0".into(),
                background: "theme".into(),
                elements: vec![picture_box(&picture_url(7))],
            }],
        })
        .unwrap();
        // A row that cannot be read, which happens to mention an inline picture.
        let broken = "{ not json data:image/png;base64,AAAA".to_string();
        for (title, json) in [("Old", &old), ("Broken", &broken)] {
            db.conn()
                .execute(
                    "INSERT INTO slides (title, kind, background, elements, created_at, updated_at)
                     VALUES (?1, 'freeform', 'theme', ?2, 1, 1)",
                    params![title, json],
                )
                .unwrap();
        }

        db.tidy_pictures().unwrap();

        assert_eq!(folder.names().len(), 1);
        let rows: Vec<(String, String)> = {
            let conn = db.conn();
            let mut stmt = conn
                .prepare("SELECT title, elements FROM slides ORDER BY title")
                .unwrap();
            let it = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
            it.collect::<rusqlite::Result<_>>().unwrap()
        };
        assert_eq!(rows[0].0, "Broken");
        assert_eq!(rows[0].1, broken, "an unreadable row is never rewritten");
        assert!(!rows[1].1.contains("base64"), "the old picture moved out");
        // And the slide still opens with its picture.
        let id = db.list(Some("Old")).unwrap()[0].id;
        let name = db.get(id).unwrap().pages[0].elements[0]
            .image
            .clone()
            .unwrap();
        assert!(is_picture_name(&name));

        // Running it again changes nothing.
        db.tidy_pictures().unwrap();
        assert_eq!(folder.names().len(), 1);
        let _ = std::fs::remove_dir_all(folder.dir());
    }

    #[test]
    fn a_slide_is_found_by_exact_title_ignoring_case() {
        let (db, folder) = fresh_db("title");
        let a = db.save(&doc("Welcome")).unwrap().id.unwrap();
        db.save(&doc("Welcome")).unwrap();
        assert_eq!(db.find_id_by_title("WELCOME").unwrap(), Some(a));
        assert_eq!(db.find_id_by_title("Welcom").unwrap(), None);
        let _ = std::fs::remove_dir_all(folder.dir());
    }

    #[test]
    fn auto_fit_is_saved_for_text_only_and_old_rows_read_as_off() {
        let (db, folder) = fresh_db("autofit");
        let mut d = doc("Fit");
        d.pages[0].elements[0].auto_fit = true;
        // A picture can never be "auto-fit", whatever the client sent.
        d.pages[0].elements.push(SlideElement {
            kind: "image".into(),
            image: Some("pic-1-1.jpg".into()),
            auto_fit: true,
            ..Default::default()
        });
        let saved = db.save(&d).unwrap();
        let got = db.get(saved.id.unwrap()).unwrap();
        assert!(got.pages[0].elements[0].auto_fit);
        assert!(!got.pages[0].elements[1].auto_fit);

        // A row written before the setting existed has no such key.
        let old =
            r#"{"pages":[{"id":"p0","background":"theme","elements":[{"id":"a","text":"Old"}]}]}"#;
        db.conn()
            .execute(
                "INSERT INTO slides (title, kind, background, elements, created_at, updated_at)
                 VALUES ('Old', 'freeform', 'theme', ?1, 1, 1)",
                [old],
            )
            .unwrap();
        let id = db.list(Some("Old")).unwrap()[0].id;
        assert!(!db.get(id).unwrap().pages[0].elements[0].auto_fit);
        let _ = std::fs::remove_dir_all(folder.dir());
    }

    #[test]
    fn an_svg_picture_is_kept_inline_as_before() {
        let (db, folder) = fresh_db("svg");
        let svg = "data:image/svg+xml;base64,PHN2Zy8+";
        let saved = db.save(&with_picture("A", svg)).unwrap();
        assert_eq!(saved.pages[0].elements[1].image.as_deref(), Some(svg));
        assert!(folder.names().is_empty());
        let _ = std::fs::remove_dir_all(folder.dir());
    }
}
