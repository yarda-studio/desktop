mod commands;
mod db;
mod markup;
mod modules;
mod remote;
mod slides;
mod songs;
mod sword;
mod types;
mod versification;

use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("could not resolve app data dir");
            std::fs::create_dir_all(&data_dir)?;

            install_panic_hook(data_dir.join("crash.log"));

            let old_db = data_dir.join("scriptura.db");
            let yarda_db = data_dir.join("yarda.db");
            let db_path = if !yarda_db.exists() && old_db.exists() {
                let _ = std::fs::rename(&old_db, &yarda_db);
                yarda_db
            } else if yarda_db.exists() {
                yarda_db
            } else {
                yarda_db
            };
            let db = db::Database::open(&db_path).expect("failed to open database");
            // Managed as Arc so command handlers can clone an owned, 'static handle
            // to move into tokio::task::spawn_blocking — see commands/mod.rs — instead
            // of the raw-pointer-cast pattern that used to bypass the borrow checker.
            app.manage(Arc::new(db));

            // Separate file + connection: a song-library failure stays inside the Songs view.
            app.manage(songs::SongStore::open(&data_dir.join("songs.db")));

            // Same isolation for slides: a broken slides.db only disables the Slides view.
            app.manage(slides::SlideStore::open(&data_dir.join("slides.db")));

            // Phone remote: off unless the operator turned it on last time.
            let remote = remote::RemoteServer::load(&data_dir);
            remote.start_if_enabled(app.handle());
            app.manage(remote);

            let modules_dir = data_dir.join("modules");
            std::fs::create_dir_all(&modules_dir)?;
            app.manage(Arc::new(modules::ModuleRegistry::new(modules_dir)));
            app.manage(commands::ChapterCache::new());
            app.manage(sword::file_cache::FileCache::new());
            app.manage(commands::PresentationState(std::sync::Mutex::new(None)));
            app.manage(commands::CountdownState(std::sync::Mutex::new(None)));
            app.manage(commands::OutputVersion(std::sync::atomic::AtomicU64::new(
                0,
            )));
            let clock_ticks = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
            commands::spawn_clock_ticker(app.handle().clone(), clock_ticks.clone());
            app.manage(commands::ClockTicks(clock_ticks));

            // Background startup thread: rebuild stale FTS indexes, then pre-warm
            // the chapter cache with the saved reading position so first render is instant.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let db = handle.state::<Arc<db::Database>>();
                let registry = handle.state::<Arc<modules::ModuleRegistry>>();
                let chapter_cache = handle.state::<commands::ChapterCache>();
                let file_cache = handle.state::<sword::file_cache::FileCache>();

                registry.load_installed();

                let records = match db.list_installed_module_records() {
                    Ok(r) => r,
                    Err(e) => {
                        log::error!("[startup] list modules: {e}");
                        return;
                    }
                };

                // 1. Rebuild any module whose FTS index is missing or stale.
                for (id, _name, _path, _version, _cat, index_built) in &records {
                    if !index_built {
                        log::info!("[startup] rebuilding FTS for {id}");
                        if let Err(e) = commands::build_fts_index(id, &registry, &db, 0, |_, _| {})
                        {
                            log::error!("[startup] FTS rebuild {id}: {e}");
                        }
                    }
                }

                // 2. Pre-warm the chapter cache from the saved reading position.
                //    This loads the current chapter + the two adjacent ones so forward/back
                //    navigation after launch is instant.
                let pos = db.get_reading_position().ok().flatten();
                if let Some(pos) = pos {
                    let bible_id = records
                        .iter()
                        .find(|(_, _, _, _, cat, _)| cat == "Bible")
                        .map(|(id, _, _, _, _, _)| id.clone())
                        .or_else(|| records.first().map(|(id, _, _, _, _, _)| id.clone()));

                    if let Some(module_id) = bible_id {
                        let conf = registry.conf_for(&module_id);
                        if let Some(conf) = conf {
                            let module_path = registry.module_path(&module_id);
                            let max_chapter = versification::CHAPTER_COUNTS
                                .get(
                                    versification::BOOK_NAMES
                                        .iter()
                                        .position(|&b| b == pos.book.as_str())
                                        .unwrap_or(0),
                                )
                                .copied()
                                .unwrap_or(1);

                            // current, prev, next
                            let chapters_to_warm = [
                                pos.chapter,
                                pos.chapter.saturating_sub(1).max(1),
                                (pos.chapter + 1).min(max_chapter),
                            ];

                            for ch in chapters_to_warm {
                                if chapter_cache.get(&module_id, &pos.book, ch).is_some() {
                                    continue;
                                }
                                if let Ok(reader) =
                                    sword::BibleReader::open(&module_path, &conf, &file_cache)
                                {
                                    if let Ok(chapter_text) = reader.get_chapter(&pos.book, ch) {
                                        chapter_cache.insert(
                                            &module_id,
                                            &pos.book,
                                            ch,
                                            chapter_text,
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_chapter,
            commands::get_verse,
            commands::get_strongs_entry,
            commands::ensure_stepbible_lexicon,
            commands::search,
            commands::get_commentary,
            commands::get_cross_references,
            commands::list_installed_modules,
            commands::list_available_modules,
            commands::install_module,
            commands::install_module_with_key,
            commands::add_bookmark,
            commands::remove_bookmark,
            commands::list_bookmarks,
            commands::list_songs,
            commands::get_song,
            commands::save_song,
            commands::delete_song,
            commands::parse_song_import,
            commands::import_songs,
            commands::get_song_schedule,
            commands::set_song_schedule,
            commands::add_note,
            commands::update_note,
            commands::delete_note,
            commands::list_notes,
            commands::get_reading_position,
            commands::set_reading_position,
            commands::get_preferences,
            commands::set_preferences,
            commands::rebuild_search_index,
            commands::relay_presentation,
            commands::get_presentation_state,
            commands::list_presentation_themes,
            commands::create_presentation_theme,
            commands::update_presentation_theme,
            commands::delete_presentation_theme,
            commands::set_default_presentation_theme,
            commands::parse_song_import_paths,
            commands::remote_status,
            commands::remote_set_enabled,
            commands::remote_reset_access,
            commands::remote_publish_state,
            commands::output_status,
            commands::output_set_enabled,
            commands::output_reset_access,
            commands::list_slides,
            commands::get_slide,
            commands::save_slide,
            commands::delete_slide,
            commands::get_slide_schedule,
            commands::set_slide_schedule,
            commands::get_media_dir,
            commands::import_background_video,
            commands::list_monitors,
            commands::get_presentation_window_size,
            commands::list_marker_strongs,
            commands::open_presentation_window,
            commands::close_presentation_window,
            commands::relay_countdown,
            commands::get_countdown_state,
            commands::set_clock_ticks,
            commands::open_stage_window,
            commands::close_stage_window,
            commands::list_search_history,
            commands::add_search_history_entry,
            commands::set_last_search_history_ref,
            commands::clear_search_history,
            commands::list_service_order,
            commands::set_service_order,
            commands::legacy_import_done,
            commands::import_legacy_local_storage,
            commands::get_sync_cursor,
            commands::set_sync_cursor,
            commands::get_dirty_sync_records,
            commands::mark_sync_records_clean,
            commands::apply_remote_sync_records,
            commands::reset_local_sync_state,
            commands::create_backup_zip,
            commands::restore_backup_zip,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Replaces the default panic hook so a panic leaves a diagnosable trail instead
/// of vanishing with the process. With `panic = "unwind"` (see Cargo.toml), Tokio
/// already catches a panic inside any spawned task — including every
/// `spawn_blocking` call in commands/mod.rs — and turns it into an `Err` the
/// caller already handles; this hook is what makes that panic visible afterward,
/// since the default hook only prints to stderr, which a packaged GUI app has
/// nowhere to show.
fn install_panic_hook(log_path: std::path::PathBuf) {
    use std::io::Write;

    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        default_hook(info);

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".into());
        let message = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "(no message)".into());

        log::error!("[panic] {message} at {location}");

        let entry = format!("[{timestamp}] panic at {location}: {message}\n");
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
        {
            let _ = file.write_all(entry.as_bytes());
        }
    }));
}
