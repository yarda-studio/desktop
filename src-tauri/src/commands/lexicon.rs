use crate::db::Database;
use crate::modules::ModuleRegistry;
use crate::sword::{builtin, stepbible, thayer, LexiconReader};
use crate::types::*;
use std::sync::Arc;
use tauri::State;

/// STEPBible-Data's lexicons (TBESG, TBESH, TFLSJ) aren't SWORD modules —
/// plain tab-separated files fetched straight from GitHub and cached
/// alongside the installed modules directory, not through it.
fn stepbible_cache_dir(
    registry: &ModuleRegistry,
) -> std::result::Result<std::path::PathBuf, AppError> {
    let dir = registry
        .modules_dir()
        .parent()
        .ok_or_else(|| AppError::Sword("cannot resolve data directory".into()))?
        .join("stepbible");
    Ok(dir)
}

/// Every built-in lexicon (Thayer, Abbott-Smith, BDB, full LSJ) as a module-list entry.
/// `installed` says whether its data is present: Thayer always is; the STEPBible ones are once
/// their file has been downloaded. `enabled` is the user's on/off choice (default on).
pub(crate) fn builtin_lexicon_entries(
    db: &Database,
    registry: &ModuleRegistry,
) -> Vec<InstalledModule> {
    let disabled = builtin::parse_disabled(
        db.get_meta(builtin::DISABLED_META_KEY)
            .ok()
            .flatten()
            .as_deref(),
    );
    let cache_dir = stepbible_cache_dir(registry).ok();
    builtin::BUILTIN_LEXICONS
        .iter()
        .map(|l| {
            let (size, path) = if l.embedded {
                (Some(thayer::embedded_size()), "built-in".to_string())
            } else {
                let cached = cache_dir
                    .as_ref()
                    .zip(stepbible::source_for_id(l.id))
                    .and_then(|(dir, source)| stepbible::cached_size(dir, source));
                (
                    cached,
                    cache_dir
                        .as_ref()
                        .map(|d| d.to_string_lossy().to_string())
                        .unwrap_or_default(),
                )
            };
            InstalledModule {
                id: l.id.to_string(),
                name: l.name.to_string(),
                description: l.description.to_string(),
                language: l.language.to_string(),
                version: l.version.to_string(),
                category: ModuleCategory::Lexicon,
                installed: l.embedded || size.is_some(),
                requires_key: false,
                has_strongs: false,
                size_bytes: size,
                install_path: path,
                index_built: true,
                built_in: true,
                enabled: !disabled.iter().any(|d| d.eq_ignore_ascii_case(l.id)),
                features: if l.language.eq_ignore_ascii_case("Hebrew") {
                    vec!["hebrewdef".to_string()]
                } else {
                    vec!["greekdef".to_string()]
                },
            }
        })
        .collect()
}

/// All built-in lexicons, present or not, so the module list can offer to download the ones that
/// are not on disk yet and show the on/off state of the rest.
#[tauri::command]
pub fn list_builtin_lexicons(
    db: State<'_, Arc<Database>>,
    registry: State<'_, Arc<ModuleRegistry>>,
) -> std::result::Result<Vec<InstalledModule>, AppError> {
    Ok(builtin_lexicon_entries(&db, &registry))
}

/// Switch a built-in or installed lexicon on or off. Off hides it from the Strong's panel and the default-source
/// choice; nothing is deleted, so turning it back on is instant.
#[tauri::command]
pub fn set_builtin_lexicon_enabled(
    id: String,
    enabled: bool,
    db: State<'_, Arc<Database>>,
    registry: State<'_, Arc<ModuleRegistry>>,
) -> std::result::Result<(), AppError> {
    if let Some(lexicon) = builtin::find(&id) {
        let current = builtin::parse_disabled(db.get_meta(builtin::DISABLED_META_KEY)?.as_deref());
        let next = builtin::with_enabled(current, lexicon.id, enabled);
        let json = serde_json::to_string(&next).unwrap_or_else(|_| "[]".to_string());
        db.set_meta(builtin::DISABLED_META_KEY, &json)?;
    } else if registry.conf_for(&id).is_some() {
        let raw = db
            .get_meta("disabled_installed_lexicons")?
            .unwrap_or_default();
        let mut current: Vec<String> = serde_json::from_str(&raw).unwrap_or_default();
        current.retain(|existing| !existing.eq_ignore_ascii_case(&id));
        if !enabled {
            current.push(id);
        }
        current.sort();
        current.dedup();
        let json = serde_json::to_string(&current).unwrap_or_else(|_| "[]".to_string());
        db.set_meta("disabled_installed_lexicons", &json)?;
    } else {
        return Err(AppError::Sword(format!("unknown lexicon: {id}")));
    }
    Ok(())
}

/// Every Strong's number that is a grammatical marker rather than a real word
/// (the Greek article G3588, the Hebrew direct-object marker H853, …), as
/// plain "G3588" / "H853" with no zero padding. The reading and Live Show
/// views use this to leave markers out of the clickable Strong's tags so a
/// phrase like "his hand" shows only its real word.
///
/// Computed once from the bundled Strong's lexicons and cached. An empty
/// result (lexicons not installed yet) isn't cached, so a later call retries.
#[tauri::command]
pub async fn list_marker_strongs(
    registry: State<'_, Arc<ModuleRegistry>>,
) -> std::result::Result<Vec<String>, AppError> {
    static CACHE: std::sync::OnceLock<Vec<String>> = std::sync::OnceLock::new();
    if let Some(cached) = CACHE.get() {
        return Ok(cached.clone());
    }

    let mut all = Vec::new();
    for (module_id, prefix) in [("StrongsGreek", 'G'), ("StrongsHebrew", 'H')] {
        let Some(conf) = registry.conf_for(module_id) else {
            continue;
        };
        let Ok(reader) = LexiconReader::open(&registry.module_path(module_id), &conf) else {
            continue;
        };
        if let Ok(numbers) = reader.marker_numbers() {
            all.extend(numbers.into_iter().map(|n| format!("{prefix}{n}")));
        }
    }
    if !all.is_empty() {
        let _ = CACHE.set(all.clone());
    }
    Ok(all)
}

/// The marker flag for `strongs_number` as judged from the bundled Strong's
/// lexicon (StrongsGreek / StrongsHebrew); None if that module isn't installed
/// or has no such entry.
fn bundled_marker_flag(registry: &ModuleRegistry, strongs_number: &str) -> Option<bool> {
    let module_id = if strongs_number.starts_with('G') {
        "StrongsGreek"
    } else {
        "StrongsHebrew"
    };
    let conf = registry.conf_for(module_id)?;
    let reader = LexiconReader::open(&registry.module_path(module_id), &conf).ok()?;
    reader
        .get_strongs_entry(strongs_number)
        .ok()
        .map(|e| e.is_untranslated_marker)
}

fn fill_fallback_transliteration(registry: &ModuleRegistry, entry: &mut StrongsEntry) {
    if !entry.transliteration.is_empty() {
        return;
    }
    let module_id = if entry.number.starts_with('G') {
        "StrongsGreek"
    } else {
        "StrongsHebrew"
    };
    if let Some(conf) = registry.conf_for(module_id) {
        if let Ok(reader) = LexiconReader::open(&registry.module_path(&conf.module_id), &conf) {
            if let Ok(bundled) = reader.get_strongs_entry(&entry.number) {
                if !bundled.transliteration.is_empty() {
                    entry.transliteration = bundled.transliteration;
                }
            }
        }
    }
}

#[tauri::command]
pub fn get_strongs_entry(
    module_id: String, // lexicon module, e.g. "StrongsGreek", or a STEPBible source id like "TBESG"
    strongs_number: String,
    bible_module_id: String, // active Bible module, used to query occurrence counts
    db: State<'_, Arc<Database>>,
    registry: State<Arc<ModuleRegistry>>,
) -> std::result::Result<StrongsEntry, AppError> {
    let mut entry = if module_id.eq_ignore_ascii_case("THAYER") {
        let mut entry = thayer::get_entry(&strongs_number)?;
        if bundled_marker_flag(&registry, &strongs_number).unwrap_or(false) {
            entry.is_untranslated_marker = true;
        }
        entry
    } else if let Some(source) = stepbible::source_for_id(&module_id) {
        let cache_dir = stepbible_cache_dir(&registry)?;
        stepbible::ensure_downloaded(&cache_dir, source)?;
        let mut entry = stepbible::get_entry(&cache_dir, source, &strongs_number)?;
        // Whether a number is a grammatical marker (the Greek article G3588,
        // the Hebrew direct-object marker H0853…) is a fact about the word,
        // not about which dictionary is on screen. Only Strong's own wording
        // is matched by the detector, so judge it from the bundled Strong's
        // entry — otherwise the article reads as a normal word under
        // Abbott-Smith/LSJ and wins over the real word in a phrase.
        if bundled_marker_flag(&registry, &strongs_number).unwrap_or(false) {
            entry.is_untranslated_marker = true;
        }
        entry
    } else {
        let conf = registry
            .conf_for(&module_id)
            .ok_or_else(|| AppError::ModuleNotFound(module_id.clone()))?;
        let module_path = registry.module_path(&conf.module_id);
        let reader = LexiconReader::open(&module_path, &conf)?;
        let mut entry = reader.get_strongs_entry(&strongs_number)?;
        if bundled_marker_flag(&registry, &strongs_number).unwrap_or(false) {
            entry.is_untranslated_marker = true;
        }
        fill_fallback_transliteration(&registry, &mut entry);
        entry
    };

    let (total, by_book) = db.get_strongs_counts(&bible_module_id, &strongs_number)?;
    entry.usage_count = total;
    entry.usage_by_book = by_book;

    Ok(entry)
}

/// Pre-fetches a STEPBible-Data lexicon so it's ready before the user's
/// first lookup — get_strongs_entry would download it lazily on demand
/// anyway, but calling this at launch avoids a multi-second wait on the
/// first pill click.
#[tauri::command]
pub fn ensure_stepbible_lexicon(
    source_id: String,
    registry: State<Arc<ModuleRegistry>>,
) -> std::result::Result<(), AppError> {
    let source = stepbible::source_for_id(&source_id)
        .ok_or_else(|| AppError::Sword(format!("unknown STEPBible source: {source_id}")))?;
    let cache_dir = stepbible_cache_dir(&registry)?;
    stepbible::ensure_downloaded(&cache_dir, source)
}
