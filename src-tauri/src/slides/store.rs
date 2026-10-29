use super::model::{SlideDoc, SlideElement, SlideSummary};
use crate::types::{AppError, Result};
use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

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
pub struct SlideStore(std::result::Result<SlideDb, String>);

impl SlideStore {
    pub fn open(path: &Path) -> Self {
        Self(SlideDb::open(path).map_err(|e| e.to_string()))
    }

    pub fn db(&self) -> Result<&SlideDb> {
        self.0
            .as_ref()
            .map_err(|e| AppError::Other(format!("Slide library unavailable: {e}")))
    }
}

pub struct SlideDb(Mutex<Connection>);

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
        image,
    })
}

fn clean(doc: &SlideDoc) -> Result<SlideDoc> {
    if doc.elements.len() > MAX_ELEMENTS {
        return Err(AppError::Other(format!(
            "A slide can hold at most {MAX_ELEMENTS} items."
        )));
    }
    let elements = doc
        .elements
        .iter()
        .enumerate()
        .map(|(i, e)| clean_element(e, i))
        .collect::<Result<Vec<_>>>()?;
    let kind = if doc.kind == "freeform" {
        "freeform"
    } else {
        "announcement"
    };
    let background = match doc.background.as_str() {
        "black" => "black".to_string(),
        b if is_hex_colour(b) => b.to_string(),
        _ => "theme".to_string(),
    };
    let title = doc.title.trim();
    Ok(SlideDoc {
        id: doc.id,
        title: if title.is_empty() {
            "Untitled slide".into()
        } else {
            title.chars().take(200).collect()
        },
        kind: kind.into(),
        background,
        elements,
        updated_at: doc.updated_at,
    })
}

impl SlideDb {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;",
        )?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self(Mutex::new(conn)))
    }

    #[cfg(test)]
    fn in_memory() -> Self {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        Self(Mutex::new(conn))
    }

    /// Recover from a poisoned lock rather than bricking the library for the rest of the session.
    pub(crate) fn conn(&self) -> MutexGuard<'_, Connection> {
        self.0.lock().unwrap_or_else(|p| p.into_inner())
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
            background,
            elements: serde_json::from_str(&elements).unwrap_or_default(),
            updated_at,
        })
    }

    pub fn save(&self, doc: &SlideDoc) -> Result<SlideDoc> {
        let doc = clean(doc)?;
        let elements =
            serde_json::to_string(&doc.elements).map_err(|e| AppError::Other(e.to_string()))?;
        if elements.len() > MAX_DOC_BYTES {
            return Err(AppError::Other("This slide is too large to save.".into()));
        }
        let now = now_millis();
        let id = {
            let conn = self.conn();
            match doc.id {
                Some(id) => {
                    let changed = conn.execute(
                        "UPDATE slides SET title=?2, kind=?3, background=?4, elements=?5, updated_at=?6 WHERE id=?1",
                        params![id, doc.title, doc.kind, doc.background, elements, now],
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
                        params![doc.title, doc.kind, doc.background, elements, now],
                    )?;
                    conn.last_insert_rowid()
                }
            }
        };
        self.get(id)
    }

    pub fn delete(&self, id: i64) -> Result<()> {
        self.conn()
            .execute("DELETE FROM slides WHERE id=?1", [id])?;
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

    fn doc(title: &str) -> SlideDoc {
        SlideDoc {
            title: title.into(),
            kind: "announcement".into(),
            background: "theme".into(),
            elements: vec![text_box("Welcome")],
            ..Default::default()
        }
    }

    #[test]
    fn save_get_list_delete_round_trip() {
        let db = SlideDb::in_memory();
        let saved = db.save(&doc("Welcome")).unwrap();
        let id = saved.id.unwrap();
        assert_eq!(db.get(id).unwrap().elements[0].text, "Welcome");

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
        d.background = "url(javascript:alert(1))".into();
        d.elements[0].color = "red; background:url(x)".into();
        d.elements[0].x = 500.0;
        d.elements[0].font_size = 9999.0;
        let saved = db.save(&d).unwrap();
        assert_eq!(saved.title, "Untitled slide");
        assert_eq!(saved.background, "theme");
        assert_eq!(saved.elements[0].color, "#ffffff");
        assert_eq!(saved.elements[0].x, 100.0);
        assert_eq!(saved.elements[0].font_size, 400.0);

        let mut bad = doc("Bad picture");
        bad.elements.push(SlideElement {
            kind: "image".into(),
            image: Some("https://example.com/a.png".into()),
            ..Default::default()
        });
        assert!(db.save(&bad).is_err());

        let mut many = doc("Many");
        many.elements = (0..=MAX_ELEMENTS).map(|_| text_box("x")).collect();
        assert!(db.save(&many).is_err());

        let mut ghost = doc("Ghost");
        ghost.id = Some(999);
        assert!(db.save(&ghost).is_err());
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
}
