//! Slide pictures kept as files, not as text inside `slides.db`.
//!
//! A picture a user adds arrives as a downscaled image data URL. Stored inline,
//! every picture is copied into each save, each backup and each read of the
//! slide. Here it is written once to `<app data>/media/pic-<millis>-<n>.<ext>`
//! and the slide keeps only that name. The folder is the same one theme videos
//! use, so the asset protocol scope and the phone/OBS output route already
//! cover it.
//!
//! Everything about those files lives in this module: how they are named, what
//! counts as an acceptable picture, and which of them are still in use. A name
//! is checked on every use, so a slide row can never point outside the folder.

use crate::types::{AppError, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

/// Largest picture, after decoding. The slide editor downscales to well under this.
pub const MAX_PICTURE_BYTES: usize = 6 * 1024 * 1024;

const EXTENSIONS: &[&str] = &["jpg", "png", "webp", "gif"];

/// Distinguishes two pictures stored in the same millisecond.
static COUNTER: AtomicU64 = AtomicU64::new(0);

/// True for a name this module generated: `pic-<digits>-<digits>.<image ext>`.
pub fn is_picture_name(name: &str) -> bool {
    let Some((stem, ext)) = name.rsplit_once('.') else {
        return false;
    };
    let Some(rest) = stem.strip_prefix("pic-") else {
        return false;
    };
    let Some((millis, n)) = rest.split_once('-') else {
        return false;
    };
    let digits = |s: &str| !s.is_empty() && s.len() <= 20 && s.bytes().all(|b| b.is_ascii_digit());
    digits(millis) && digits(n) && EXTENSIONS.contains(&ext)
}

/// The file extension for a picture type we store as a file. SVG is left out on
/// purpose: it can carry script.
fn extension_for_mime(mime: &str) -> Option<&'static str> {
    match mime {
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/webp" => Some("webp"),
        "image/gif" => Some("gif"),
        _ => None,
    }
}

/// True when the first bytes are those of the format the extension claims.
fn looks_like(ext: &str, bytes: &[u8]) -> bool {
    match ext {
        "jpg" => bytes.starts_with(&[0xFF, 0xD8, 0xFF]),
        "png" => bytes.starts_with(&[0x89, b'P', b'N', b'G']),
        "gif" => bytes.starts_with(b"GIF8"),
        "webp" => bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
        _ => false,
    }
}

fn now_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[derive(Clone, Debug)]
pub struct PictureFolder {
    dir: PathBuf,
}

impl PictureFolder {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    /// Write a data URL to a new file and return its name. `Ok(None)` means
    /// this is not a type we keep as a file (it stays inline, as before).
    pub fn save_data_url(&self, data_url: &str) -> Result<Option<String>> {
        let Some(rest) = data_url.strip_prefix("data:") else {
            return Ok(None);
        };
        let Some((meta, payload)) = rest.split_once(',') else {
            return Ok(None);
        };
        let Some((mime, encoding)) = meta.split_once(';') else {
            return Ok(None);
        };
        let Some(ext) = extension_for_mime(&mime.to_ascii_lowercase()) else {
            return Ok(None);
        };
        if encoding != "base64" {
            return Ok(None);
        }
        let bytes = STANDARD
            .decode(payload.trim())
            .map_err(|_| AppError::Other("A picture on the slide isn't a valid image.".into()))?;
        if bytes.len() > MAX_PICTURE_BYTES {
            return Err(AppError::Other(
                "A picture on the slide is too large.".into(),
            ));
        }
        if !looks_like(ext, &bytes) {
            return Err(AppError::Other(
                "A picture on the slide isn't a valid image.".into(),
            ));
        }
        std::fs::create_dir_all(&self.dir)?;
        let name = format!(
            "pic-{}-{}.{ext}",
            now_millis(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        );
        self.write_new(&name, &bytes)?;
        Ok(Some(name))
    }

    /// Write a file only if it is not there yet; a partial file is removed.
    fn write_new(&self, name: &str, bytes: &[u8]) -> Result<()> {
        use std::io::Write;
        let path = self.dir.join(name);
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)?;
        if let Err(e) = file.write_all(bytes) {
            drop(file);
            let _ = std::fs::remove_file(&path);
            return Err(e.into());
        }
        Ok(())
    }

    /// Every picture file in the folder, by name.
    pub fn names(&self) -> Vec<String> {
        let Ok(entries) = std::fs::read_dir(&self.dir) else {
            return Vec::new();
        };
        let mut names: Vec<String> = entries
            .flatten()
            .filter_map(|e| e.file_name().into_string().ok())
            .filter(|n| is_picture_name(n))
            .collect();
        names.sort();
        names
    }

    /// The bytes of one picture, or `None` for an invalid or missing name.
    pub fn read(&self, name: &str) -> Option<Vec<u8>> {
        if !is_picture_name(name) {
            return None;
        }
        std::fs::read(self.dir.join(name)).ok()
    }

    /// Put a picture back under its original name (restoring a backup). The
    /// name, size and first bytes are checked; a file already there is kept.
    /// Returns whether the picture is now in the folder.
    pub fn restore(&self, name: &str, bytes: &[u8]) -> bool {
        if !is_picture_name(name) || bytes.len() > MAX_PICTURE_BYTES {
            return false;
        }
        let ext = name.rsplit('.').next().unwrap_or("");
        if !looks_like(ext, bytes) {
            return false;
        }
        if std::fs::create_dir_all(&self.dir).is_err() {
            return false;
        }
        if self.dir.join(name).exists() {
            return true;
        }
        self.write_new(name, bytes).is_ok()
    }

    /// Delete every picture file for which `in_use` says no. Returns how many
    /// were removed. Only names this module generated are ever touched.
    pub fn remove_unused(&self, in_use: impl Fn(&str) -> bool) -> usize {
        let mut removed = 0;
        for name in self.names() {
            if !in_use(&name) && std::fs::remove_file(self.dir.join(&name)).is_ok() {
                removed += 1;
            }
        }
        removed
    }

    #[cfg(test)]
    pub fn dir(&self) -> &std::path::Path {
        &self.dir
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder(tag: &str) -> PictureFolder {
        let dir = std::env::temp_dir().join(format!(
            "scriptura-pictures-{tag}-{}-{}",
            std::process::id(),
            now_millis()
        ));
        PictureFolder::new(dir)
    }

    fn jpeg_url() -> String {
        // The first bytes of a JPEG are all this module looks at.
        format!(
            "data:image/jpeg;base64,{}",
            STANDARD.encode([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3])
        )
    }

    #[test]
    fn accepts_generated_names_only() {
        assert!(is_picture_name("pic-1730000000000-0.jpg"));
        assert!(is_picture_name("pic-1-22.webp"));
        assert!(!is_picture_name("../pic-1-1.jpg"));
        assert!(!is_picture_name("pic-1-1/../x.jpg"));
        assert!(!is_picture_name("pic-1.jpg"));
        assert!(!is_picture_name("pic--1.jpg"));
        assert!(!is_picture_name("pic-1-1.svg"));
        assert!(!is_picture_name("pic-1-1.exe"));
        assert!(!is_picture_name("bg-1.mp4"));
        assert!(!is_picture_name("photo.jpg"));
    }

    #[test]
    fn a_data_url_becomes_a_file_with_a_valid_name() {
        let f = folder("save");
        let name = f.save_data_url(&jpeg_url()).unwrap().unwrap();
        assert!(is_picture_name(&name));
        assert_eq!(
            f.read(&name).unwrap(),
            vec![0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3]
        );
        // Two saves of the same picture never collide.
        let other = f.save_data_url(&jpeg_url()).unwrap().unwrap();
        assert_ne!(name, other);
        let _ = std::fs::remove_dir_all(f.dir());
    }

    #[test]
    fn unsupported_types_stay_inline_and_bad_data_is_refused() {
        let f = folder("reject");
        // Not stored as a file: left for the caller to keep inline.
        assert_eq!(
            f.save_data_url("data:image/svg+xml;base64,PHN2Zy8+")
                .unwrap(),
            None
        );
        assert_eq!(f.save_data_url("https://example.com/a.png").unwrap(), None);
        assert_eq!(f.save_data_url("data:image/png,not-base64").unwrap(), None);
        // A supported type with bad content is an error.
        assert!(f.save_data_url("data:image/png;base64,!!!").is_err());
        let html = format!("data:image/png;base64,{}", STANDARD.encode("<html>"));
        assert!(f.save_data_url(&html).is_err(), "bytes must match the type");
        let too_big = format!(
            "data:image/jpeg;base64,{}",
            STANDARD.encode(vec![0xFFu8; MAX_PICTURE_BYTES + 1])
        );
        assert!(f.save_data_url(&too_big).is_err());
        assert!(f.names().is_empty(), "nothing was written");
        let _ = std::fs::remove_dir_all(f.dir());
    }

    #[test]
    fn restore_checks_name_and_content_and_keeps_an_existing_file() {
        let f = folder("restore");
        let jpeg = [0xFF, 0xD8, 0xFF, 1];
        assert!(f.restore("pic-5-1.jpg", &jpeg));
        assert!(!f.restore("../pic-5-2.jpg", &jpeg));
        assert!(!f.restore("pic-5-3.png", &jpeg), "content must match");
        assert!(!f.restore("notes.txt", b"hi"));
        // A second restore of the same name does not overwrite.
        assert!(f.restore("pic-5-1.jpg", &[0xFF, 0xD8, 0xFF, 9]));
        assert_eq!(f.read("pic-5-1.jpg").unwrap(), jpeg.to_vec());
        let _ = std::fs::remove_dir_all(f.dir());
    }

    #[test]
    fn remove_unused_touches_only_picture_files() {
        let f = folder("gc");
        std::fs::create_dir_all(f.dir()).unwrap();
        assert!(f.restore("pic-1-1.jpg", &[0xFF, 0xD8, 0xFF]));
        assert!(f.restore("pic-1-2.jpg", &[0xFF, 0xD8, 0xFF]));
        std::fs::write(f.dir().join("bg-1.mp4"), b"video").unwrap();
        let removed = f.remove_unused(|name| name == "pic-1-1.jpg");
        assert_eq!(removed, 1);
        assert_eq!(f.names(), vec!["pic-1-1.jpg".to_string()]);
        assert!(
            f.dir().join("bg-1.mp4").exists(),
            "theme videos are not ours"
        );
        let _ = std::fs::remove_dir_all(f.dir());
    }
}
