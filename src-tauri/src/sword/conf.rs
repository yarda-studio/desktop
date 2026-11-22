use crate::types::{AppError, Result};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, PartialEq)]
pub enum ModuleType {
    Bible,
    Commentary,
    Lexicon,
    Dictionary,
    Devotional,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Encoding {
    Latin1,
    Utf8,
}

#[derive(Debug, Clone, PartialEq)]
pub enum MarkupType {
    Osis,
    Gbf,
    ThMl,
    Plain,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Versification {
    Kjv,
    Nrsv,
    German,
    Luther,
    Vulgate,
    Catholic,
    Other(String),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Compression {
    None,
    Zip, // zText / zLD
}

#[derive(Debug, Clone, PartialEq)]
pub enum BlockType {
    Book,
    Chapter,
    Verse,
}

/// Parsed representation of a SWORD .conf file
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ModuleConf {
    pub module_id: String,
    pub name: String,
    pub description: String,
    pub module_type: ModuleType,
    pub encoding: Encoding,
    pub markup: MarkupType,
    pub versification: Versification,
    pub compression: Compression,
    pub block_type: BlockType,
    pub cipher_key: Option<String>,
    pub feature: Vec<String>,
    pub data_path: String,
    pub language: String,
    pub version: String,
    pub strongs_zero_pad: bool,
    /// Bytes per idx entry: 6 for RawLD (u32 offset + u16 size), 8 for RawLD4 (u32 + u32)
    pub idx_entry_size: usize,
    pub raw: HashMap<String, String>,
}

impl ModuleConf {
    pub fn parse(module_id: &str, conf_path: &Path) -> Result<Self> {
        let content = fs::read_to_string(conf_path).map_err(|e| {
            AppError::Sword(format!("cannot read conf {}: {e}", conf_path.display()))
        })?;

        let mut raw: HashMap<String, String> = HashMap::new();
        let mut feature: Vec<String> = Vec::new();
        for line in content.lines() {
            let line = line.trim();
            if line.starts_with('[') && line.ends_with(']') {
                continue;
            }
            if let Some(eq) = line.find('=') {
                let key = line[..eq].trim().to_lowercase();
                let value = line[eq + 1..].trim().to_string();
                if key == "feature" {
                    for f in value.split(',') {
                        let f = f.trim().to_lowercase();
                        if !f.is_empty() && !feature.contains(&f) {
                            feature.push(f);
                        }
                    }
                }
                raw.insert(key, value);
            }
        }

        let get = |k: &str| raw.get(k).cloned().unwrap_or_default();

        let cat_str = get("category").to_lowercase();
        let drv_str = get("moddrv").to_lowercase();
        let mid_lower = module_id.to_lowercase();
        let name_lower = get("description").to_lowercase();

        let is_devotional =
            cat_str.contains("devotional") || feature.iter().any(|f| f.contains("dailydevotion"));

        let module_type = if is_devotional {
            ModuleType::Devotional
        } else if matches!(cat_str.as_str(), "commentaries" | "commentary")
            || matches!(
                drv_str.as_str(),
                "rawcom" | "rawcom4" | "zcom" | "zcom4" | "rawfiles" | "hrefcom" | "commentary"
            )
        {
            ModuleType::Commentary
        } else if matches!(
            cat_str.as_str(),
            "lexicons / dictionaries" | "lexicons" | "dictionaries" | "glossaries"
        ) || matches!(drv_str.as_str(), "rawld" | "rawld4" | "zld" | "lexdict")
        {
            let is_lex = feature.iter().any(|f| {
                matches!(
                    f.as_str(),
                    "greekdef" | "hebrewdef" | "greekparse" | "hebrewparse"
                )
            }) || cat_str == "lexicons"
                || mid_lower.contains("lexicon")
                || mid_lower.contains("strong")
                || mid_lower.contains("morph")
                || mid_lower.contains("parse")
                || mid_lower.contains("septuagint")
                || name_lower.contains("lexicon")
                || name_lower.contains("strong")
                || name_lower.contains("morpholog");
            if is_lex {
                ModuleType::Lexicon
            } else {
                ModuleType::Dictionary
            }
        } else {
            ModuleType::Bible
        };

        let compression = if matches!(
            drv_str.as_str(),
            "ztext" | "ztext4" | "zcom" | "zcom4" | "zld"
        ) {
            Compression::Zip
        } else {
            Compression::None
        };

        let block_type = match get("blocktype").to_lowercase().as_str() {
            "book" => BlockType::Book,
            "verse" => BlockType::Verse,
            _ => BlockType::Chapter,
        };

        let markup = match get("sourcetype").to_lowercase().as_str() {
            "osis" => MarkupType::Osis,
            "gbf" => MarkupType::Gbf,
            "thml" => MarkupType::ThMl,
            _ => MarkupType::Plain,
        };

        let versification = match get("versification").to_lowercase().as_str() {
            "" | "kjv" => Versification::Kjv,
            "nrsv" | "nrsva" => Versification::Nrsv,
            "german" => Versification::German,
            "luther" => Versification::Luther,
            "vulgate" => Versification::Vulgate,
            "catholic" => Versification::Catholic,
            other => Versification::Other(other.to_string()),
        };

        let strongs_zero_pad = feature.contains(&"strongsnumbers".to_string())
            && !raw.contains_key("strongsnozeropad");

        // RawLD uses 6-byte idx entries (u32 offset + u16 size)
        // RawLD4 / zLD use 8-byte idx entries (u32 + u32)
        let idx_entry_size = if get("moddrv").to_lowercase() == "rawld" {
            6
        } else {
            8
        };

        Ok(Self {
            module_id: module_id.to_string(),
            name: get("description"),
            description: get("about"),
            module_type,
            encoding: if get("encoding").to_lowercase().contains("utf") {
                Encoding::Utf8
            } else {
                Encoding::Latin1
            },
            markup,
            versification,
            compression,
            block_type,
            cipher_key: raw.get("cipherkey").filter(|s| !s.is_empty()).cloned(),
            feature,
            data_path: get("datapath"),
            language: get("lang"),
            version: get("version"),
            strongs_zero_pad,
            idx_entry_size,
            raw,
        })
    }

    pub fn requires_cipher(&self) -> bool {
        // If the conf has a CipherKey field at all (even empty), the module is locked
        self.raw.contains_key("cipherkey")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_conf(name: &str, content: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "scriptura-test-conf-{name}-{}.conf",
            std::process::id()
        ));
        fs::write(&path, content).unwrap();
        path
    }

    #[test]
    fn parses_ztext_bible_module() {
        let path = write_conf(
            "ztext",
            "[KJV]\n\
             Description=King James Version\n\
             ModDrv=zText\n\
             SourceType=OSIS\n\
             Encoding=UTF-8\n\
             Versification=KJV\n\
             Lang=en\n\
             Version=2.0\n",
        );
        let conf = ModuleConf::parse("KJV", &path).unwrap();

        assert_eq!(conf.module_id, "KJV");
        assert_eq!(conf.module_type, ModuleType::Bible);
        assert_eq!(conf.compression, Compression::Zip);
        assert_eq!(conf.markup, MarkupType::Osis);
        assert_eq!(conf.encoding, Encoding::Utf8);
        assert_eq!(conf.versification, Versification::Kjv);
        assert!(!conf.requires_cipher());

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn parses_rawld_lexicon_with_smaller_idx_entries() {
        let path = write_conf(
            "rawld",
            "[StrongsGreek]\nDescription=Strong's Greek\nModDrv=RawLD\n",
        );
        let conf = ModuleConf::parse("StrongsGreek", &path).unwrap();

        assert_eq!(conf.module_type, ModuleType::Lexicon);
        // RawLD uses 6-byte idx entries (u32 offset + u16 size); RawLD4/zLD use 8.
        assert_eq!(conf.idx_entry_size, 6);

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn parses_dictionary_and_devotional_and_zcom4() {
        let path = write_conf(
            "easton",
            "[Easton]\nDescription=Easton's Bible Dictionary\nModDrv=zLD\n",
        );
        let conf = ModuleConf::parse("Easton", &path).unwrap();
        assert_eq!(conf.module_type, ModuleType::Dictionary);
        let _ = fs::remove_file(&path);

        let path = write_conf(
            "mhc",
            "[MHC]\nDescription=Matthew Henry Complete\nModDrv=zCom4\n",
        );
        let conf = ModuleConf::parse("MHC", &path).unwrap();
        assert_eq!(conf.module_type, ModuleType::Commentary);
        assert_eq!(conf.compression, Compression::Zip);
        let _ = fs::remove_file(&path);

        let path = write_conf(
            "daily",
            "[Daily]\nDescription=Daily Light\nModDrv=RawLD\nCategory=Daily Devotional\n",
        );
        let conf = ModuleConf::parse("Daily", &path).unwrap();
        assert_eq!(conf.module_type, ModuleType::Devotional);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn detects_locked_module_even_with_empty_cipher_key() {
        // SWORD convention: a CipherKey line's mere presence (even blank, meaning
        // "locked, key not yet supplied by the user") marks the module as requiring
        // a cipher key — distinct from a module with no CipherKey line at all.
        let path = write_conf(
            "cipher",
            "[LOCKED]\nDescription=Locked module\nModDrv=zText\nCipherKey=\n",
        );
        let conf = ModuleConf::parse("LOCKED", &path).unwrap();
        assert!(conf.requires_cipher());

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn detects_strongs_numbers_feature_with_zero_pad() {
        let path = write_conf(
            "strongs-feature",
            "[KJV]\nDescription=King James Version\nModDrv=zText\nFeature=StrongsNumbers\n",
        );
        let conf = ModuleConf::parse("KJV", &path).unwrap();
        assert!(conf.feature.contains(&"strongsnumbers".to_string()));
        assert!(conf.strongs_zero_pad);

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn errors_on_missing_file() {
        let missing = std::env::temp_dir().join("scriptura-test-conf-does-not-exist.conf");
        assert!(ModuleConf::parse("X", &missing).is_err());
    }
}
