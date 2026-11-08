//! Moving everything from one computer to another through a backup file the user
//! saves and opens themselves. No account is needed: it is the same backup the
//! cloud button makes, written to (and read from) a file the user picks.

use crate::backup_extras::{Folders, Options};
use crate::db::Database;
use crate::modules::ModuleRegistry;
use crate::plan::PlanStore;
use crate::slides::SlideStore;
use crate::songs::SongStore;
use crate::types::AppError;
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

type Result<T> = std::result::Result<T, AppError>;

/// Where this computer keeps the optional parts of a backup.
pub(crate) fn data_folders(app: &AppHandle) -> Result<Folders> {
    let data = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Other(e.to_string()))?;
    Ok(Folders {
        modules: data.join("modules"),
        stepbible: data.join("stepbible"),
        media: data.join("media"),
    })
}

/// Save a backup to `path`. It is written beside the destination and moved into
/// place when complete, so a failure never leaves a broken file where a backup
/// was expected. Returns the file's size in bytes.
#[tauri::command]
pub async fn export_backup_to_file(
    path: String,
    options: Options,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    songs: State<'_, SongStore>,
    slides: State<'_, SlideStore>,
    plan: State<'_, PlanStore>,
) -> Result<u64> {
    let folders = data_folders(&app)?;
    let partial = format!("{path}.partial");
    let written = (|| -> Result<u64> {
        let file = std::fs::File::create(&partial)?;
        db.write_backup(
            std::io::BufWriter::new(file),
            &songs,
            &slides,
            &plan,
            Some((&folders, options)),
        )?;
        let size = std::fs::metadata(&partial)?.len();
        // Renaming onto an existing file fails on Windows; the dialog has already asked about replacing it.
        let _ = std::fs::remove_file(&path);
        std::fs::rename(&partial, &path)?;
        Ok(size)
    })();
    if written.is_err() {
        let _ = std::fs::remove_file(&partial);
    }
    written
}

#[derive(Serialize)]
pub struct ImportSummary {
    pub modules: usize,
    pub videos: usize,
}

/// True if the zip has the files a Yarda backup has.
fn looks_like_backup(file: &std::fs::File) -> bool {
    let Ok(archive) = zip::ZipArchive::new(file) else {
        return false;
    };
    // A name that is not valid text is not one of ours.
    let found = archive
        .file_names()
        .any(|n| n.is_ok_and(|n| n == "manifest.json" || (n.ends_with(".db") && !n.contains('/'))));
    found
}

/// Replace everything on this computer with the contents of the backup file at
/// `path`. The caller has already made the user confirm that.
#[tauri::command]
pub async fn import_backup_from_file(
    path: String,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    songs: State<'_, SongStore>,
    slides: State<'_, SlideStore>,
    plan: State<'_, PlanStore>,
    registry: State<'_, Arc<ModuleRegistry>>,
) -> Result<ImportSummary> {
    let folders = data_folders(&app)?;
    let file = std::fs::File::open(&path)?;
    if !looks_like_backup(&file) {
        return Err(AppError::Other("That file isn't a Yarda backup.".into()));
    }
    let restored = db.restore_backup_from(
        std::io::BufReader::new(file),
        &songs,
        &slides,
        &plan,
        Some(&folders),
    )?;
    // Pick up modules that arrived, or were replaced, in the backup.
    registry.load_installed();
    Ok(ImportSummary {
        modules: restored.modules,
        videos: restored.videos,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn zip_with(names: &[&str]) -> std::fs::File {
        let path = std::env::temp_dir().join(format!("transfer-test-{}.zip", uuid::Uuid::new_v4()));
        let mut writer = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        for name in names {
            writer
                .start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            writer.write_all(b"x").unwrap();
        }
        writer.finish().unwrap();
        std::fs::File::open(path).unwrap()
    }

    #[test]
    fn only_a_yarda_backup_is_accepted() {
        assert!(looks_like_backup(&zip_with(&["manifest.json", "yarda.db"])));
        assert!(looks_like_backup(&zip_with(&["songs.db"])));
        assert!(!looks_like_backup(&zip_with(&[
            "photos/cat.jpg",
            "notes.txt"
        ])));
        assert!(
            !looks_like_backup(&zip_with(&["modules/KJV/x.db"])),
            "a database inside a folder is not a backup's own"
        );
        let not_a_zip =
            std::env::temp_dir().join(format!("transfer-test-{}.txt", uuid::Uuid::new_v4()));
        std::fs::write(&not_a_zip, b"hello").unwrap();
        assert!(!looks_like_backup(&std::fs::File::open(not_a_zip).unwrap()));
    }
}
