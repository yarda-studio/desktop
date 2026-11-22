use crate::commands::media::prune_unreferenced_background_video;
use crate::db::Database;
use crate::types::{AppError, PresentationTheme, PresentationThemeInput};
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_presentation_themes(
    db: State<Arc<Database>>,
) -> std::result::Result<Vec<PresentationTheme>, AppError> {
    db.list_presentation_themes()
}

#[tauri::command]
pub fn create_presentation_theme(
    theme: PresentationThemeInput,
    db: State<Arc<Database>>,
) -> std::result::Result<PresentationTheme, AppError> {
    db.create_presentation_theme(&theme)
}

#[tauri::command]
pub fn update_presentation_theme(
    app: AppHandle,
    id: String,
    theme: PresentationThemeInput,
    db: State<Arc<Database>>,
) -> std::result::Result<PresentationTheme, AppError> {
    let previous_video = db.presentation_theme_background_video(&id)?;
    let updated = db.update_presentation_theme(&id, &theme)?;
    if let Some(old) = previous_video {
        if updated.background_video.as_deref() != Some(old.as_str()) {
            prune_unreferenced_background_video(&app, &db, &old);
        }
    }
    Ok(updated)
}

#[tauri::command]
pub fn delete_presentation_theme(
    app: AppHandle,
    id: String,
    db: State<Arc<Database>>,
) -> std::result::Result<(), AppError> {
    let previous_video = db.presentation_theme_background_video(&id)?;
    db.delete_presentation_theme(&id)?;
    if let Some(old) = previous_video {
        prune_unreferenced_background_video(&app, &db, &old);
    }
    Ok(())
}

#[tauri::command]
pub fn set_default_presentation_theme(
    id: String,
    db: State<Arc<Database>>,
) -> std::result::Result<PresentationTheme, AppError> {
    db.set_default_presentation_theme(&id)
}
