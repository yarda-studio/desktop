//! Media files used by presentation themes (looping background videos).
//!
//! Videos are far too big for the SQLite row, so they are copied into
//! `<app data>/media/` and the theme stores only the generated file name. The
//! name is validated on every use so a theme row can never point outside the
//! media folder.

use crate::db::Database;
use crate::types::AppError;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Manager};

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "m4v", "mov", "webm"];
/// Backgrounds are meant to be short loops; this stops a feature film being
/// copied into the app data folder by accident.
const MAX_VIDEO_BYTES: u64 = 1024 * 1024 * 1024;
static NEXT_VIDEO_SEQ: AtomicU64 = AtomicU64::new(0);

fn is_digits(s: &str, max_len: usize) -> bool {
    !s.is_empty() && s.len() <= max_len && s.bytes().all(|b| b.is_ascii_digit())
}

/// True for a name this module generated: `bg-<digits>.<video ext>` or
/// `bg-<digits>-<seq>.<video ext>`.
pub fn is_valid_media_name(name: &str) -> bool {
    let Some((stem, ext)) = name.rsplit_once('.') else {
        return false;
    };
    if !VIDEO_EXTENSIONS.contains(&ext) {
        return false;
    }
    let Some(rest) = stem.strip_prefix("bg-") else {
        return false;
    };
    match rest.split_once('-') {
        Some((millis, seq)) => is_digits(millis, 20) && is_digits(seq, 20),
        None => is_digits(rest, 20),
    }
}

fn media_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Other(e.to_string()))?
        .join("media");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Delete a previously saved background video file when no theme row still references it.
pub(crate) fn prune_unreferenced_background_video(app: &AppHandle, db: &Database, candidate: &str) {
    if !is_valid_media_name(candidate) {
        return;
    }
    if db.is_background_video_referenced(candidate).unwrap_or(true) {
        return;
    }
    if let Ok(dir) = media_dir(app) {
        let _ = std::fs::remove_file(dir.join(candidate));
    }
}

/// Absolute path of the media folder, so the frontend can turn a stored file
/// name into an asset URL.
#[tauri::command]
pub fn get_media_dir(app: AppHandle) -> Result<String, AppError> {
    Ok(media_dir(&app)?.to_string_lossy().into_owned())
}

/// Copy a picked video into the media folder and return its generated name.
#[tauri::command]
pub async fn import_background_video(
    app: AppHandle,
    source_path: String,
) -> Result<String, AppError> {
    let dir = media_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || copy_video(Path::new(&source_path), &dir))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

fn copy_video(source: &Path, dir: &Path) -> Result<String, AppError> {
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| VIDEO_EXTENSIONS.contains(&e.as_str()))
        .ok_or_else(|| AppError::Other("Choose an MP4, M4V, MOV or WebM video.".into()))?;
    let size = std::fs::metadata(source)?.len();
    if size > MAX_VIDEO_BYTES {
        return Err(AppError::Other(
            "That video is over 1 GB. Use a shorter or more compressed loop.".into(),
        ));
    }
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let seq = NEXT_VIDEO_SEQ.fetch_add(1, Ordering::Relaxed);
    let name = format!("bg-{millis}-{seq}.{ext}");
    std::fs::copy(source, dir.join(&name))?;
    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_generated_names_only() {
        assert!(is_valid_media_name("bg-1730000000000.mp4"));
        assert!(is_valid_media_name("bg-1730000000000-0.mp4"));
        assert!(is_valid_media_name("bg-1.webm"));
        assert!(!is_valid_media_name("../bg-1.mp4"));
        assert!(!is_valid_media_name("bg-1/../x.mp4"));
        assert!(!is_valid_media_name("bg-.mp4"));
        assert!(!is_valid_media_name("bg-1-.mp4"));
        assert!(!is_valid_media_name("bg-12.exe"));
        assert!(!is_valid_media_name("movie.mp4"));
    }

    #[test]
    fn rejects_non_video_sources() {
        let dir = std::env::temp_dir();
        assert!(copy_video(Path::new("/tmp/notes.txt"), &dir).is_err());
    }

    #[test]
    fn generates_unique_names_for_rapid_imports() {
        let dir = std::env::temp_dir().join(format!(
            "yarda-media-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("loop.mp4");
        std::fs::write(&src, b"fake-mp4-data").unwrap();
        let first = copy_video(&src, &dir).unwrap();
        let second = copy_video(&src, &dir).unwrap();
        assert_ne!(first, second);
        assert!(is_valid_media_name(&first));
        assert!(is_valid_media_name(&second));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
