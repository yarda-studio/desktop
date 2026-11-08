//! Switching NDI output on and off, and saying how it is doing.

use crate::ndi::{self, capture, Output};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, State};

const DEFAULT_NAME: &str = "Yarda";
const MAX_NAME_CHARS: usize = 64;

/// The running output, with the name it announced. Nothing is kept when it is off.
#[derive(Default)]
pub struct NdiState(Mutex<Option<(String, Output)>>);

#[derive(Serialize)]
pub struct NdiStatus {
    /// This build can capture the output window on this operating system.
    pub supported: bool,
    /// NDI Tools is installed, so the runtime could be loaded.
    pub available: bool,
    pub running: bool,
    pub name: String,
    pub connections: i32,
    pub frames: u64,
    pub error: Option<String>,
}

/// A source name people can see on the network: trimmed, no control
/// characters, not too long, and never empty.
fn clean_name(name: Option<&str>) -> String {
    let cleaned: String = name
        .unwrap_or("")
        .chars()
        .filter(|c| !c.is_control())
        .take(MAX_NAME_CHARS)
        .collect();
    let cleaned = cleaned.trim();
    if cleaned.is_empty() {
        DEFAULT_NAME.into()
    } else {
        cleaned.into()
    }
}

fn status_of(state: &NdiState) -> NdiStatus {
    let supported = capture::SUPPORTED;
    let available = supported && ndi::runtime().is_ok();
    let slot = state.0.lock().unwrap_or_else(|p| p.into_inner());
    match slot.as_ref() {
        Some((name, output)) => {
            let s = output.status();
            NdiStatus {
                supported,
                available,
                running: true,
                name: name.clone(),
                connections: s.connections,
                frames: s.frames,
                error: s.error,
            }
        }
        None => NdiStatus {
            supported,
            available,
            running: false,
            name: String::new(),
            connections: 0,
            frames: 0,
            error: None,
        },
    }
}

#[tauri::command]
pub async fn ndi_status(state: State<'_, NdiState>) -> Result<NdiStatus, String> {
    Ok(status_of(&state))
}

/// The presentation window's number, which is what the capture is asked for.
/// AppKit wants the window touched on the main thread, so it is read there.
#[cfg(target_os = "macos")]
fn presentation_window_number(app: &AppHandle) -> Result<u32, crate::types::AppError> {
    use crate::types::AppError;
    use tauri::Manager;

    let window = app.get_webview_window("presentation").ok_or_else(|| {
        AppError::Other(
            "The presentation window isn't open. Open it from the top bar first.".into(),
        )
    })?;
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let number = window.ns_window().ok().map(|ptr| {
            // SAFETY: Tauri hands out the window's own NSWindow, valid while the window is open.
            let ns_window = unsafe { &*(ptr as *const objc2_app_kit::NSWindow) };
            ns_window.windowNumber()
        });
        let _ = tx.send(number);
    })
    .map_err(|e| AppError::Other(e.to_string()))?;
    match rx.recv_timeout(std::time::Duration::from_secs(2)) {
        Ok(Some(n)) if n > 0 => Ok(n as u32),
        _ => Err(AppError::Other(
            "The presentation window isn't ready to be captured.".into(),
        )),
    }
}

/// What the output thread calls for each frame. The window's number is looked
/// up again whenever a capture fails, so closing and reopening the window is survived.
#[cfg(target_os = "macos")]
fn grabber(app: AppHandle) -> ndi::output::Grab {
    let mut number: Option<u32> = None;
    Box::new(move || {
        let id = match number {
            Some(id) => id,
            None => {
                let id = presentation_window_number(&app)?;
                number = Some(id);
                id
            }
        };
        capture::capture_window(id).inspect_err(|_| number = None)
    })
}

#[cfg(not(target_os = "macos"))]
fn grabber(_app: AppHandle) -> ndi::output::Grab {
    Box::new(|| capture::capture_window(0))
}

/// Start sending the presentation window as an NDI source called `name`
/// (default "Yarda"). Already running under another name: it restarts under the new one.
#[tauri::command]
pub async fn ndi_start(
    name: Option<String>,
    app: AppHandle,
    state: State<'_, NdiState>,
) -> Result<NdiStatus, String> {
    if !capture::SUPPORTED {
        return Err("NDI output isn't available on this operating system yet.".into());
    }
    let name = clean_name(name.as_deref());
    // Stop the old one first: two sources with one name would confuse the receivers.
    let old = state.0.lock().unwrap_or_else(|p| p.into_inner()).take();
    drop(old);
    let output = Output::start(&name, grabber(app)).map_err(|e| e.to_string())?;
    *state.0.lock().unwrap_or_else(|p| p.into_inner()) = Some((name, output));
    Ok(status_of(&state))
}

#[tauri::command]
pub async fn ndi_stop(state: State<'_, NdiState>) -> Result<NdiStatus, String> {
    let old = state.0.lock().unwrap_or_else(|p| p.into_inner()).take();
    // Dropping waits for the frame in hand, outside the lock.
    drop(old);
    Ok(status_of(&state))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_tidied_and_never_empty() {
        assert_eq!(clean_name(None), "Yarda");
        assert_eq!(clean_name(Some("   ")), "Yarda");
        assert_eq!(clean_name(Some("  Sanctuary  ")), "Sanctuary");
        assert_eq!(clean_name(Some("A\nB\0C")), "ABC");
        assert_eq!(
            clean_name(Some(&"x".repeat(200))).chars().count(),
            MAX_NAME_CHARS
        );
    }

    #[test]
    fn nothing_running_reports_so() {
        let state = NdiState::default();
        let s = status_of(&state);
        assert!(!s.running);
        assert_eq!((s.frames, s.connections), (0, 0));
        assert_eq!(s.supported, cfg!(target_os = "macos"));
    }
}
