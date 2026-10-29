//! Phone remote: a tiny web server on the local network that serves a control
//! page and relays button presses to the app.
//!
//! Deliberately a dumb relay. It holds the latest state snapshot the app
//! published and forwards a fixed set of command names to the main window as a
//! Tauri event; it never touches scripture, songs or slides itself, so a bug or
//! a hostile request here can at worst press the same buttons the operator can.
//!
//! The same server also hosts the web outputs (see output.rs).
//!
//! Off by default. When on, every request must carry the secret from the pairing
//! link (compared in constant time); the link is shown as a QR code in the app
//! and can be reset at any time.

mod output;
mod server;

pub use server::{OutputStatus, RemoteServer, RemoteStatus};
