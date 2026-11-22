use crate::modules::ModuleRegistry;
use crate::sword::{file_cache::FileCache, BibleReader};
use crate::types::*;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::State;

// ── Chapter cache ─────────────────────────────────────────────────────────────

/// In-process LRU-ish chapter cache.  Keyed by (module_id, book, chapter).
/// Capped at MAX_ENTRIES; when full we evict a random entry (simple, allocation-free).
pub struct ChapterCache {
    map: Mutex<HashMap<(String, String, u32), ChapterText>>,
}

const MAX_CACHE_ENTRIES: usize = 60;

impl ChapterCache {
    pub fn new() -> Self {
        Self {
            map: Mutex::new(HashMap::new()),
        }
    }

    pub fn get(&self, module_id: &str, book: &str, chapter: u32) -> Option<ChapterText> {
        let map = crate::lock_unpoisoned(&self.map);
        map.get(&(module_id.to_string(), book.to_string(), chapter))
            .cloned()
    }

    pub fn insert(&self, module_id: &str, book: &str, chapter: u32, value: ChapterText) {
        let mut map = crate::lock_unpoisoned(&self.map);
        if map.len() >= MAX_CACHE_ENTRIES {
            // Evict one arbitrary entry to keep memory bounded
            if let Some(key) = map.keys().next().cloned() {
                map.remove(&key);
            }
        }
        map.insert((module_id.to_string(), book.to_string(), chapter), value);
    }
}

// ── Bible reading ─────────────────────────────────────────────────────────────

/// Read a chapter, through the cache. Shared by the Tauri command and the web outputs.
pub fn load_chapter(
    registry: &ModuleRegistry,
    chapter_cache: &ChapterCache,
    file_cache: &FileCache,
    module_id: &str,
    book: &str,
    chapter: u32,
) -> std::result::Result<ChapterText, AppError> {
    if let Some(cached) = chapter_cache.get(module_id, book, chapter) {
        return Ok(cached);
    }
    let conf = registry
        .conf_for(module_id)
        .ok_or_else(|| AppError::ModuleNotFound(module_id.to_string()))?;
    let module_path = registry.module_path(module_id);
    let reader = BibleReader::open(&module_path, &conf, file_cache)?;
    let result = reader.get_chapter(book, chapter)?;
    chapter_cache.insert(module_id, book, chapter, result.clone());
    Ok(result)
}

#[tauri::command]
pub async fn get_chapter(
    module_id: String,
    book: String,
    chapter: u32,
    registry: State<'_, Arc<ModuleRegistry>>,
    chapter_cache: State<'_, Arc<ChapterCache>>,
    file_cache: State<'_, Arc<FileCache>>,
) -> std::result::Result<ChapterText, AppError> {
    let registry = Arc::clone(&registry);
    let chapter_cache = Arc::clone(&chapter_cache);
    let file_cache = Arc::clone(&file_cache);
    tokio::task::spawn_blocking(move || {
        load_chapter(
            &registry,
            &chapter_cache,
            &file_cache,
            &module_id,
            &book,
            chapter,
        )
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_verse(
    module_id: String,
    book: String,
    chapter: u32,
    verse: u32,
    registry: State<'_, Arc<ModuleRegistry>>,
    file_cache: State<'_, Arc<FileCache>>,
) -> std::result::Result<VerseText, AppError> {
    let registry = Arc::clone(&registry);
    let file_cache = Arc::clone(&file_cache);
    tokio::task::spawn_blocking(move || {
        let conf = registry
            .conf_for(&module_id)
            .ok_or_else(|| AppError::ModuleNotFound(module_id.clone()))?;
        let module_path = registry.module_path(&module_id);
        let reader = BibleReader::open(&module_path, &conf, &file_cache)?;
        reader.get_verse(&book, chapter, verse)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

// ── Commentary ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_commentary(
    module_id: String,
    book: String,
    chapter: u32,
    verse: u32,
    registry: State<'_, Arc<ModuleRegistry>>,
    file_cache: State<'_, Arc<FileCache>>,
) -> std::result::Result<String, AppError> {
    let registry = Arc::clone(&registry);
    let file_cache = Arc::clone(&file_cache);
    tokio::task::spawn_blocking(move || {
        let conf = registry
            .conf_for(&module_id)
            .ok_or_else(|| AppError::ModuleNotFound(module_id.clone()))?;
        let module_path = registry.module_path(&module_id);
        let reader = BibleReader::open(&module_path, &conf, &file_cache)?;
        let verse_text = reader.get_verse(&book, chapter, verse)?;
        Ok(verse_text
            .spans
            .iter()
            .map(|s| s.text.as_str())
            .collect::<Vec<_>>()
            .join(""))
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

// ── Cross references ──────────────────────────────────────────────────────────

/// Returns cross-references for the given verse by reading the TSK SWORD module.
/// Returns an empty list (not an error) if TSK isn't installed.
#[tauri::command]
pub async fn get_cross_references(
    book: String,
    chapter: u32,
    verse: u32,
    registry: State<'_, Arc<ModuleRegistry>>,
    file_cache: State<'_, Arc<FileCache>>,
) -> std::result::Result<Vec<CrossReference>, AppError> {
    let registry = Arc::clone(&registry);
    let file_cache = Arc::clone(&file_cache);
    tokio::task::spawn_blocking(move || {
        let Some(conf) = registry.conf_for("TSK") else {
            return Ok(vec![]);
        };
        let module_path = registry.module_path("TSK");
        let reader = BibleReader::open(&module_path, &conf, &file_cache)?;

        // TSK stores its actual references within ThML <scripRef> elements. The
        // normal display parser suppresses those elements, so read the raw module
        // data before passing it to the TSK-specific parser.
        let Ok(raw) = reader.get_raw_verse(&book, chapter, verse) else {
            return Ok(vec![]);
        };
        Ok(crate::sword::crossref::parse_tsk_text(&raw, 120))
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}
