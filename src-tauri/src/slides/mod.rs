//! Announcement and free-form slides: the data model and their own SQLite store.
//!
//! Deliberately self-contained, like the song library. Slides live in their own
//! `slides.db` with their own connection and lock, so a failure here (corrupt
//! file, poisoned lock, bad save) cannot touch scripture, songs, notes or
//! preferences.

pub mod model;
pub mod pictures;
pub mod store;

pub use model::{SlideDoc, SlideSummary};
pub use pictures::PictureFolder;
pub use store::SlideStore;
