//! The service plan: one running order across verses, songs and slides.
//!
//! Deliberately self-contained, like the song and slide libraries. The plan lives
//! in its own `plan.db` with its own connection and lock and only *refers* to
//! songs and slides by id, so a failure here (corrupt file, poisoned lock, bad
//! save) cannot touch scripture, songs, slides, notes or preferences, and
//! nothing in those can corrupt the plan.

pub mod model;
pub mod store;
pub mod sync;

pub use model::PlanItem;
pub use store::PlanStore;
pub use sync::PlanSyncRecord;
