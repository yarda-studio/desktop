//! The lexicons that come with Yarda instead of from a module repository.
//!
//! SWORD modules are installed by the module manager and recorded in the database, which is what
//! the "Installed" list reads. These lexicons never go through that path: Thayer is compiled into
//! the app, and the STEPBible ones (Abbott-Smith, BDB, full LSJ) are plain text files fetched
//! straight from GitHub and cached on disk. So none of them had a record, and none showed up as
//! installed even though the Strong's panel was using them.
//!
//! This catalog describes them so the module list can show them like any other lexicon. They can't
//! be uninstalled the way a repository module can (Thayer is part of the app, and the others are
//! re-fetched on demand), so the user controls them with an on/off switch instead. Off means the
//! lexicon is hidden from the Strong's panel and from the default-source choice; its data is kept.

/// One built-in lexicon.
pub struct BuiltinLexicon {
    /// The same id the Strong's panel already uses for this source ("THAYER", "TBESG", ...).
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub language: &'static str,
    pub version: &'static str,
    /// True when the data is compiled into the app (always present). False when it is a STEPBible
    /// file that is downloaded on first use and cached.
    pub embedded: bool,
}

pub const BUILTIN_LEXICONS: &[BuiltinLexicon] = &[
    BuiltinLexicon {
        id: "THAYER",
        name: "Thayer's Greek-English Lexicon",
        description: "Joseph Thayer's classic lexicon of New Testament Greek, built into Yarda. It appears as a source in the Strong's panel.",
        language: "Greek",
        version: "1889",
        embedded: true,
    },
    BuiltinLexicon {
        id: "TBESG",
        name: "Abbott-Smith Greek Lexicon",
        description: "Abbott-Smith's Manual Greek Lexicon of the New Testament, corrected and extended by Tyndale House (STEPBible, CC BY 4.0). Downloaded automatically.",
        language: "Greek",
        version: "STEPBible",
        embedded: false,
    },
    BuiltinLexicon {
        id: "TBESH",
        name: "Brown-Driver-Briggs Hebrew Lexicon",
        description: "The Brown-Driver-Briggs Hebrew lexicon with its full numbered senses, from Tyndale House (STEPBible, CC BY 4.0). Downloaded automatically.",
        language: "Hebrew",
        version: "STEPBible",
        embedded: false,
    },
    BuiltinLexicon {
        id: "TFLSJ",
        name: "Liddell-Scott-Jones Greek Lexicon (full)",
        description: "The complete Liddell-Scott-Jones lexicon, covering all of Greek literature and not only the New Testament (STEPBible, CC BY 4.0). A large download, fetched when you install it.",
        language: "Greek",
        version: "STEPBible",
        embedded: false,
    },
];

/// `app_meta` key holding the ids that are switched off, as a JSON array of strings.
pub const DISABLED_META_KEY: &str = "disabled_builtin_lexicons";

pub fn find(id: &str) -> Option<&'static BuiltinLexicon> {
    BUILTIN_LEXICONS
        .iter()
        .find(|l| l.id.eq_ignore_ascii_case(id))
}

/// The stored list of switched-off ids. A missing or unreadable value means nothing is off, so a
/// damaged setting can never hide every lexicon.
pub fn parse_disabled(raw: Option<&str>) -> Vec<String> {
    raw.and_then(|s| serde_json::from_str::<Vec<String>>(s).ok())
        .unwrap_or_default()
        .into_iter()
        .filter(|id| find(id).is_some())
        .collect()
}

/// `current` with `id` switched on or off. Sorted and de-duplicated so the stored value is stable.
pub fn with_enabled(mut current: Vec<String>, id: &str, enabled: bool) -> Vec<String> {
    current.retain(|existing| !existing.eq_ignore_ascii_case(id));
    if !enabled {
        current.push(id.to_ascii_uppercase());
    }
    current.sort();
    current.dedup();
    current
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_ids_are_unique_and_known_to_their_readers() {
        let mut seen = std::collections::HashSet::new();
        for l in BUILTIN_LEXICONS {
            assert!(seen.insert(l.id), "duplicate id {}", l.id);
            if l.embedded {
                assert_eq!(l.id, "THAYER");
            } else {
                assert!(
                    crate::sword::stepbible::source_for_id(l.id).is_some(),
                    "{} has no STEPBible source",
                    l.id
                );
            }
        }
    }

    #[test]
    fn find_is_case_insensitive() {
        assert!(find("thayer").is_some());
        assert!(find("TBESG").is_some());
        assert!(find("StrongsGreek").is_none());
    }

    #[test]
    fn missing_or_corrupt_setting_means_everything_is_on() {
        assert!(parse_disabled(None).is_empty());
        assert!(parse_disabled(Some("not json")).is_empty());
        assert!(parse_disabled(Some("{\"a\":1}")).is_empty());
    }

    #[test]
    fn unknown_ids_in_the_stored_list_are_dropped() {
        assert_eq!(
            parse_disabled(Some("[\"THAYER\",\"NOPE\"]")),
            vec!["THAYER".to_string()]
        );
    }

    #[test]
    fn toggling_round_trips_and_stays_sorted() {
        let off = with_enabled(vec![], "tbesg", false);
        assert_eq!(off, vec!["TBESG".to_string()]);
        let off2 = with_enabled(off, "THAYER", false);
        assert_eq!(off2, vec!["TBESG".to_string(), "THAYER".to_string()]);
        let off3 = with_enabled(off2.clone(), "THAYER", false);
        assert_eq!(off3, off2, "switching off twice changes nothing");
        assert_eq!(
            with_enabled(off3, "tbesg", true),
            vec!["THAYER".to_string()]
        );
    }
}
