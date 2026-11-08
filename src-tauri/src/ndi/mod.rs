//! Sending the live output over the network as an NDI source, so vMix, OBS,
//! Wirecast and NDI Monitor can pick it up directly.
//!
//! Deliberately self-contained and optional, like the song and slide libraries:
//! the NDI runtime comes from the user's own NDI Tools install and is loaded
//! only when NDI is switched on. If it is missing or fails, only NDI is
//! affected, and nothing here touches any database or setting.
//!
//! NDI is a trademark of Vizrt NDI AB. See https://ndi.video.

pub mod capture;
pub mod ffi;
pub mod output;
pub mod runtime;
pub mod sender;

#[cfg(test)]
mod tests;

pub use output::Output;
pub use runtime::runtime;
