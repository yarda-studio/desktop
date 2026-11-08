//! The optional, large parts of a backup file: Bible modules (with the Strong's
//! data) and theme background videos.
//!
//! The databases and slide pictures are always in a backup (see `db/mod.rs`).
//! These are left out unless asked for, because they are big and can be
//! downloaded again. They sit in the zip as `modules/<id>/<files>`,
//! `stepbible/<file>` and, flat, `bg-<n>.<video>`.
//!
//! Reading a backup is reading a file from outside, so it is strict: an entry is
//! used only if it is one of those three shapes, every part of its path is
//! checked, sizes and counts are capped, and nothing reaches a real folder until
//! the whole backup has been read. A name that does not qualify is skipped, not
//! an error, so one odd entry never spoils the rest.

use crate::commands::is_valid_media_name;
use crate::types::{AppError, Result};
use serde::Deserialize;
use std::collections::BTreeSet;
use std::fs;
use std::io::{Read, Seek, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

const MODULES_PREFIX: &str = "modules/";
const STEPBIBLE_PREFIX: &str = "stepbible/";
/// The same ceiling theme videos have when they are imported.
const MAX_FILE_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 8 * 1024 * 1024 * 1024;
const MAX_FILES: usize = 50_000;
const MAX_DEPTH: usize = 12;
/// Where staged files wait. Not `.tmp-`: the module registry sweeps that name away whenever it reloads.
const STAGING_PREFIX: &str = ".restore-";

/// Where each kind of file lives on this computer.
#[derive(Clone, Debug)]
pub struct Folders {
    pub modules: PathBuf,
    pub stepbible: PathBuf,
    pub media: PathBuf,
}

/// What to put in a backup beyond the always-included data. Both off by default.
#[derive(Clone, Copy, Debug, Default, Deserialize)]
pub struct Options {
    #[serde(default)]
    pub include_modules: bool,
    #[serde(default)]
    pub include_videos: bool,
}

/// What a restore brought back.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Restored {
    pub modules: usize,
    pub videos: usize,
}

// ── Writing ──────────────────────────────────────────────────────────────────

fn file_options(len: u64, compress: bool) -> SimpleFileOptions {
    SimpleFileOptions::default()
        .compression_method(if compress {
            zip::CompressionMethod::Deflated
        } else {
            zip::CompressionMethod::Stored
        })
        .large_file(len > 0xFFFF_FFFF)
}

fn add_file<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    path: &Path,
    entry: &str,
    compress: bool,
) -> Result<()> {
    let len = fs::metadata(path)?.len();
    zip.start_file(entry, file_options(len, compress))?;
    std::io::copy(&mut fs::File::open(path)?, zip)?;
    Ok(())
}

/// Add every file under `root` as `<prefix><relative path>`. Links are not
/// followed, and a half-installed module (`.tmp-`, `.old-`, our own staging) is skipped.
fn add_tree<W: Write + Seek>(zip: &mut ZipWriter<W>, root: &Path, prefix: &str) -> Result<()> {
    let mut stack = vec![(root.to_path_buf(), String::new())];
    while let Some((dir, rel)) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(name) = entry.file_name().into_string() else {
                continue;
            };
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            let at_top = rel.is_empty();
            if at_top
                && (name.starts_with(".tmp-")
                    || name.starts_with(".old-")
                    || name.starts_with(STAGING_PREFIX))
            {
                continue;
            }
            let child = format!("{rel}{name}");
            if kind.is_dir() {
                stack.push((entry.path(), format!("{child}/")));
            } else if kind.is_file() {
                add_file(zip, &entry.path(), &format!("{prefix}{child}"), true)?;
            }
        }
    }
    Ok(())
}

/// Add the optional parts the caller asked for.
pub fn write_into<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    folders: &Folders,
    options: Options,
) -> Result<()> {
    if options.include_modules {
        add_tree(zip, &folders.modules, MODULES_PREFIX)?;
        add_tree(zip, &folders.stepbible, STEPBIBLE_PREFIX)?;
    }
    if options.include_videos {
        if let Ok(entries) = fs::read_dir(&folders.media) {
            for entry in entries.flatten() {
                let Ok(name) = entry.file_name().into_string() else {
                    continue;
                };
                if is_valid_media_name(&name) && entry.file_type().is_ok_and(|t| t.is_file()) {
                    // Video is already compressed.
                    add_file(zip, &entry.path(), &name, false)?;
                }
            }
        }
    }
    Ok(())
}

// ── Reading ──────────────────────────────────────────────────────────────────

/// The parts of `rest` (a path inside the zip, after its prefix), or `None` if
/// any part could step outside the folder or is not an ordinary name.
fn components(rest: &str) -> Option<Vec<&str>> {
    let parts: Vec<&str> = rest.split('/').collect();
    if parts.len() > MAX_DEPTH {
        return None;
    }
    let ok = parts.iter().all(|p| {
        !p.is_empty() && *p != "." && *p != ".." && p.len() <= 255 && !p.contains(['\\', ':', '\0'])
    });
    ok.then_some(parts)
}

/// A module's folder name: letters, digits, `_`, `-`, `.`; never starting with a dot.
fn is_module_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && !id.starts_with('.')
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.'))
}

/// Collects the optional files of one backup into a staging area, then moves
/// them into place with `finish`. Dropping it without finishing removes the staging area.
pub struct Extractor {
    folders: Folders,
    id: String,
    modules: BTreeSet<String>,
    stepbible: Vec<String>,
    videos: Vec<String>,
    bytes: u64,
    files: usize,
}

impl Extractor {
    pub fn new(folders: Folders) -> Self {
        // A staging area left by a restore that was cut off.
        for dir in [&folders.modules, &folders.stepbible] {
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    if entry
                        .file_name()
                        .to_string_lossy()
                        .starts_with(STAGING_PREFIX)
                    {
                        let _ = fs::remove_dir_all(entry.path());
                    }
                }
            }
        }
        Self {
            folders,
            id: uuid::Uuid::new_v4().to_string(),
            modules: BTreeSet::new(),
            stepbible: Vec::new(),
            videos: Vec::new(),
            bytes: 0,
            files: 0,
        }
    }

    fn module_stage(&self) -> PathBuf {
        self.folders
            .modules
            .join(format!("{STAGING_PREFIX}{}", self.id))
    }

    fn stepbible_stage(&self) -> PathBuf {
        self.folders
            .stepbible
            .join(format!("{STAGING_PREFIX}{}", self.id))
    }

    fn video_stage(&self, name: &str) -> PathBuf {
        self.folders
            .media
            .join(format!("{STAGING_PREFIX}{}-{name}", self.id))
    }

    /// Stage the entry called `name` if it is one of ours. `Ok(true)` means it
    /// was one of ours (stored, or skipped as not valid), so the caller is done
    /// with it; `Ok(false)` means it is something else.
    pub fn take<R: Read>(&mut self, name: &str, reader: &mut R) -> Result<bool> {
        if let Some(rest) = name.strip_prefix(MODULES_PREFIX) {
            if let Some(parts) = components(rest) {
                if parts.len() >= 2 && is_module_id(parts[0]) {
                    let mut dest = self.module_stage();
                    dest.extend(&parts);
                    self.stage(reader, &dest)?;
                    self.modules.insert(parts[0].to_string());
                }
            }
            return Ok(true);
        }
        if let Some(rest) = name.strip_prefix(STEPBIBLE_PREFIX) {
            if let Some(parts) = components(rest) {
                if parts.len() == 1 && !parts[0].starts_with('.') {
                    let dest = self.stepbible_stage().join(parts[0]);
                    self.stage(reader, &dest)?;
                    self.stepbible.push(parts[0].to_string());
                }
            }
            return Ok(true);
        }
        if is_valid_media_name(name) {
            let dest = self.video_stage(name);
            self.stage(reader, &dest)?;
            self.videos.push(name.to_string());
            return Ok(true);
        }
        Ok(false)
    }

    /// Write `reader` to `dest`, refusing a file or a backup that is too big.
    fn stage<R: Read>(&mut self, reader: &mut R, dest: &Path) -> Result<()> {
        if self.files >= MAX_FILES {
            return Err(AppError::Other("This backup has too many files.".into()));
        }
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut out = fs::File::create(dest)?;
        let copied = std::io::copy(&mut reader.take(MAX_FILE_BYTES + 1), &mut out)?;
        drop(out);
        self.bytes += copied;
        self.files += 1;
        if copied > MAX_FILE_BYTES || self.bytes > MAX_TOTAL_BYTES {
            let _ = fs::remove_file(dest);
            return Err(AppError::Other(
                "This backup is too large to restore.".into(),
            ));
        }
        Ok(())
    }

    /// Move what was staged into the real folders. A module already installed
    /// is replaced whole; if that fails the old copy is put back.
    pub fn finish(mut self) -> Result<Restored> {
        let mut restored = Restored::default();

        let stage = self.module_stage();
        for id in std::mem::take(&mut self.modules) {
            let target = self.folders.modules.join(&id);
            let staged = stage.join(&id);
            if target.exists() {
                let old = self
                    .folders
                    .modules
                    .join(format!("{STAGING_PREFIX}old-{}-{id}", self.id));
                fs::rename(&target, &old)?;
                if let Err(e) = fs::rename(&staged, &target) {
                    let _ = fs::rename(&old, &target);
                    return Err(e.into());
                }
                let _ = fs::remove_dir_all(&old);
            } else {
                fs::rename(&staged, &target)?;
            }
            restored.modules += 1;
        }

        let stage = self.stepbible_stage();
        for name in std::mem::take(&mut self.stepbible) {
            let target = self.folders.stepbible.join(&name);
            // Renaming onto an existing file fails on Windows.
            let _ = fs::remove_file(&target);
            fs::rename(stage.join(&name), target)?;
        }

        for name in std::mem::take(&mut self.videos) {
            let staged = self.video_stage(&name);
            let target = self.folders.media.join(&name);
            if target.exists() {
                // Same generated name: already here.
                let _ = fs::remove_file(&staged);
            } else {
                fs::rename(&staged, &target)?;
                restored.videos += 1;
            }
        }
        Ok(restored)
    }
}

impl Drop for Extractor {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(self.module_stage());
        let _ = fs::remove_dir_all(self.stepbible_stage());
        for name in &self.videos {
            let _ = fs::remove_file(self.video_stage(name));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use zip::ZipArchive;

    fn temp_folders(tag: &str) -> Folders {
        let root = std::env::temp_dir().join(format!(
            "scriptura-extras-{tag}-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        Folders {
            modules: root.join("modules"),
            stepbible: root.join("stepbible"),
            media: root.join("media"),
        }
    }

    fn root_of(f: &Folders) -> PathBuf {
        f.modules.parent().unwrap().to_path_buf()
    }

    fn put(path: &Path, bytes: &[u8]) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, bytes).unwrap();
    }

    fn source(tag: &str) -> Folders {
        let f = temp_folders(tag);
        put(&f.modules.join("KJV/mods.d/kjv.conf"), b"[KJV]");
        put(&f.modules.join("KJV/modules/texts/ot.bzs"), b"text");
        put(&f.modules.join(".tmp-halfway/x"), b"junk");
        put(&f.stepbible.join("TBESG.txt"), b"greek");
        put(&f.media.join("bg-1.mp4"), b"video");
        put(&f.media.join("pic-1-1.jpg"), b"not a video");
        f
    }

    fn pack(f: &Folders, options: Options) -> Vec<u8> {
        let mut buf = Cursor::new(Vec::new());
        let mut zip = ZipWriter::new(&mut buf);
        write_into(&mut zip, f, options).unwrap();
        zip.finish().unwrap();
        buf.into_inner()
    }

    fn names(bytes: &[u8]) -> Vec<String> {
        let mut a = ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut v: Vec<String> = (0..a.len())
            .map(|i| a.by_index(i).unwrap().name().unwrap().into_owned())
            .collect();
        v.sort();
        v
    }

    /// Feed every entry to an extractor, as the restore does.
    fn unpack(bytes: &[u8], target: &Folders) -> Restored {
        let mut ex = Extractor::new(target.clone());
        let mut a = ZipArchive::new(Cursor::new(bytes)).unwrap();
        for i in 0..a.len() {
            let mut file = a.by_index(i).unwrap();
            let name = file.name().unwrap().into_owned();
            ex.take(&name, &mut file).unwrap();
        }
        ex.finish().unwrap()
    }

    #[test]
    fn nothing_optional_is_written_by_default() {
        let f = source("default");
        assert!(names(&pack(&f, Options::default())).is_empty());
        let _ = fs::remove_dir_all(root_of(&f));
    }

    #[test]
    fn modules_and_videos_are_written_only_when_asked_for() {
        let f = source("asked");
        let modules = names(&pack(
            &f,
            Options {
                include_modules: true,
                include_videos: false,
            },
        ));
        assert_eq!(
            modules,
            [
                "modules/KJV/mods.d/kjv.conf",
                "modules/KJV/modules/texts/ot.bzs",
                "stepbible/TBESG.txt"
            ],
            "half-installed folders are left out"
        );
        let videos = names(&pack(
            &f,
            Options {
                include_modules: false,
                include_videos: true,
            },
        ));
        assert_eq!(videos, ["bg-1.mp4"], "slide pictures are not videos");
        let _ = fs::remove_dir_all(root_of(&f));
    }

    #[test]
    fn a_backup_with_everything_restores_to_another_computer() {
        let f = source("from");
        let zip = pack(
            &f,
            Options {
                include_modules: true,
                include_videos: true,
            },
        );
        let there = temp_folders("to");
        let restored = unpack(&zip, &there);
        assert_eq!(
            restored,
            Restored {
                modules: 1,
                videos: 1
            }
        );
        assert_eq!(
            fs::read(there.modules.join("KJV/modules/texts/ot.bzs")).unwrap(),
            b"text"
        );
        assert_eq!(
            fs::read(there.stepbible.join("TBESG.txt")).unwrap(),
            b"greek"
        );
        assert_eq!(fs::read(there.media.join("bg-1.mp4")).unwrap(), b"video");
        // No staging left behind.
        for dir in [&there.modules, &there.stepbible, &there.media] {
            assert!(fs::read_dir(dir)
                .unwrap()
                .flatten()
                .all(|e| !e.file_name().to_string_lossy().starts_with(STAGING_PREFIX)));
        }
        let _ = fs::remove_dir_all(root_of(&f));
        let _ = fs::remove_dir_all(root_of(&there));
    }

    #[test]
    fn an_installed_module_is_replaced_whole() {
        let f = source("replace-from");
        let zip = pack(
            &f,
            Options {
                include_modules: true,
                include_videos: false,
            },
        );
        let there = temp_folders("replace-to");
        put(&there.modules.join("KJV/stale-file"), b"old");
        put(&there.modules.join("ESV/keep"), b"other module");
        unpack(&zip, &there);
        assert!(
            !there.modules.join("KJV/stale-file").exists(),
            "the old copy is gone"
        );
        assert!(there.modules.join("KJV/mods.d/kjv.conf").exists());
        assert!(
            there.modules.join("ESV/keep").exists(),
            "modules not in the backup are untouched"
        );
        let _ = fs::remove_dir_all(root_of(&f));
        let _ = fs::remove_dir_all(root_of(&there));
    }

    #[test]
    fn names_that_could_leave_the_folder_or_are_not_ours_are_skipped() {
        let there = temp_folders("evil");
        let mut buf = Cursor::new(Vec::new());
        {
            let mut zip = ZipWriter::new(&mut buf);
            let o = SimpleFileOptions::default();
            for name in [
                "modules/../evil.txt",
                "modules/KJV/../../evil.txt",
                "modules/KJV//x",
                "modules/KJV/a\\b",
                "modules/C:/x",
                "modules/.hidden/x",
                "modules/KJV",
                "modules/",
                "modules/bad id/x",
                "stepbible/sub/file.txt",
                "stepbible/.dot",
                "stepbible/../evil.txt",
                "bg-1.exe",
                "bg-../x.mp4",
            ] {
                zip.start_file(name, o).unwrap();
                zip.write_all(b"x").unwrap();
            }
            zip.start_file("modules/OK/mods.d/ok.conf", o).unwrap();
            zip.write_all(b"[OK]").unwrap();
            zip.finish().unwrap();
        }
        let bytes = buf.into_inner();
        let mut ex = Extractor::new(there.clone());
        let mut a = ZipArchive::new(Cursor::new(&bytes)).unwrap();
        let mut ours = 0;
        for i in 0..a.len() {
            let mut file = a.by_index(i).unwrap();
            let name = file.name().unwrap().into_owned();
            if ex.take(&name, &mut file).unwrap() {
                ours += 1;
            }
        }
        // "bg-1.exe" and "bg-../x.mp4" are not ours, and are left for the caller.
        assert_eq!(ours, a.len() - 2);
        let restored = ex.finish().unwrap();
        assert_eq!(
            restored,
            Restored {
                modules: 1,
                videos: 0
            }
        );
        let outside = root_of(&there).join("evil.txt");
        assert!(!outside.exists() && !there.modules.join("evil.txt").exists());
        assert!(there.modules.join("OK/mods.d/ok.conf").exists());
        assert!(fs::read_dir(&there.modules).unwrap().flatten().count() == 1);
        assert!(!there.stepbible.exists() || fs::read_dir(&there.stepbible).unwrap().count() == 0);
        let _ = fs::remove_dir_all(root_of(&there));
    }

    #[test]
    fn dropping_an_extractor_without_finishing_leaves_nothing() {
        let f = source("drop-from");
        let zip = pack(
            &f,
            Options {
                include_modules: true,
                include_videos: true,
            },
        );
        let there = temp_folders("drop-to");
        {
            let mut ex = Extractor::new(there.clone());
            let mut a = ZipArchive::new(Cursor::new(&zip)).unwrap();
            for i in 0..a.len() {
                let mut file = a.by_index(i).unwrap();
                let name = file.name().unwrap().into_owned();
                ex.take(&name, &mut file).unwrap();
            }
            // Dropped here: the restore of the databases failed.
        }
        assert!(!there.modules.join("KJV").exists());
        assert!(fs::read_dir(&there.modules).unwrap().count() == 0);
        assert!(fs::read_dir(&there.media).unwrap().count() == 0);
        let _ = fs::remove_dir_all(root_of(&f));
        let _ = fs::remove_dir_all(root_of(&there));
    }
}
