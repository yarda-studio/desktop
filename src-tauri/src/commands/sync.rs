use crate::db::Database;
use crate::modules::ModuleRegistry;
use crate::plan::PlanStore;
use crate::slides::SlideStore;
use crate::songs::SongStore;
use crate::types::*;
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_sync_cursor(db: State<Arc<Database>>) -> std::result::Result<i64, AppError> {
    db.get_sync_cursor()
}

#[tauri::command]
pub fn set_sync_cursor(cursor: i64, db: State<Arc<Database>>) -> std::result::Result<(), AppError> {
    db.set_sync_cursor(cursor)
}

#[tauri::command]
pub fn get_dirty_sync_records(
    limit: usize,
    db: State<Arc<Database>>,
) -> std::result::Result<Vec<DirtySyncRecord>, AppError> {
    db.get_dirty_sync_records(limit)
}

#[tauri::command]
pub fn mark_sync_records_clean(
    items: Vec<CleanRecordKey>,
    db: State<Arc<Database>>,
) -> std::result::Result<(), AppError> {
    db.mark_sync_records_clean(&items)
}

#[tauri::command]
pub fn apply_remote_sync_records(
    records: Vec<RemoteSyncRecord>,
    db: State<Arc<Database>>,
) -> std::result::Result<(), AppError> {
    db.apply_remote_sync_records(&records)
}

#[tauri::command]
pub fn reset_local_sync_state(
    replace_with_cloud: bool,
    db: State<Arc<Database>>,
) -> std::result::Result<(), AppError> {
    db.reset_local_sync_state(replace_with_cloud)
}

#[tauri::command]
pub fn create_backup_zip(
    db: State<Arc<Database>>,
    song_store: State<SongStore>,
    slide_store: State<SlideStore>,
    plan_store: State<PlanStore>,
) -> std::result::Result<Vec<u8>, AppError> {
    db.create_backup_zip(&song_store, &slide_store, &plan_store)
}

#[tauri::command]
pub fn restore_backup_zip(
    bytes: Vec<u8>,
    app: AppHandle,
    db: State<Arc<Database>>,
    song_store: State<SongStore>,
    slide_store: State<SlideStore>,
    plan_store: State<PlanStore>,
    registry: State<Arc<ModuleRegistry>>,
) -> std::result::Result<(), AppError> {
    // With the folders, the list of installed modules is made to match this computer afterwards.
    let folders = super::transfer::data_folders(&app)?;
    db.restore_backup_from(
        std::io::Cursor::new(bytes),
        &song_store,
        &slide_store,
        &plan_store,
        Some(&folders),
    )?;
    registry.load_installed();
    Ok(())
}
