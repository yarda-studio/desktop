use serde::{Deserialize, Serialize};

/// One step of the service plan: something to put on the screen, or a cue.
///
/// Items refer to songs and slides by id but keep a snapshot of their title, so
/// a renamed or deleted source never breaks the plan; the operator just sees it
/// is missing when they reach it.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default)]
pub struct PlanItem {
    /// Unique within the plan; chosen by the editor so selection survives reordering.
    pub id: String,
    /// "verse", "song", "slide", "countdown", "black" or "note".
    pub kind: String,
    /// What the operator sees in the list.
    pub title: String,
    pub subtitle: String,
    /// The song or slide id, for those kinds.
    pub ref_id: Option<i64>,
    /// The passage, for verse items.
    pub book: Option<String>,
    pub chapter: Option<i64>,
    pub verse: Option<i64>,
    pub module: Option<String>,
    /// How long this step is planned to take. For a countdown it is the countdown's length.
    pub duration_secs: Option<i64>,
    /// A private reminder for the operator. Never shown on the output.
    pub note: String,
}
