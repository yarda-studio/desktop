//! The running NDI output: a thread that keeps grabbing a picture of the output
//! window and sending it, while the rest of the app carries on. A frame that
//! can't be grabbed (window closed, minimised) never stops it; the reason is
//! kept for the settings screen and it tries again.

use super::capture::Frame;
use super::sender::Sender;
use crate::types::Result;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

/// Produces the next picture to send.
pub type Grab = Box<dyn FnMut() -> Result<Frame> + Send>;

/// How long to wait before trying again after a frame could not be grabbed.
const RETRY: Duration = Duration::from_millis(250);
/// How often (in frames) to ask NDI how many programs are watching.
const CONNECTION_CHECK_EVERY: u64 = 30;

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct Status {
    /// Frames sent since it started.
    pub frames: u64,
    /// Programs (OBS, vMix, a monitor) receiving the source right now.
    pub connections: i32,
    /// Why the latest frame could not be sent, or `None` while it is going well.
    pub error: Option<String>,
}

pub struct Output {
    stop: Arc<AtomicBool>,
    status: Arc<Mutex<Status>>,
    thread: Option<JoinHandle<()>>,
}

impl Output {
    /// Announce a source called `name` and start feeding it. A missing NDI
    /// runtime or an unusable name fails here, so the caller can say so at once.
    pub fn start(name: &str, mut grab: Grab) -> Result<Self> {
        let sender = Sender::new(name)?;
        let stop = Arc::new(AtomicBool::new(false));
        let status = Arc::new(Mutex::new(Status::default()));
        let thread = {
            let stop = stop.clone();
            let status = status.clone();
            std::thread::Builder::new()
                .name("ndi-output".into())
                .spawn(move || {
                    let update = |f: &dyn Fn(&mut Status)| {
                        f(&mut status.lock().unwrap_or_else(|p| p.into_inner()));
                    };
                    let mut sent = 0u64;
                    while !stop.load(Ordering::Relaxed) {
                        match grab().and_then(|f| sender.send_bgra(f.width, f.height, &f.bgra)) {
                            Ok(()) => {
                                sent += 1;
                                let connections = (sent % CONNECTION_CHECK_EVERY == 1)
                                    .then(|| sender.connections());
                                update(&|s| {
                                    s.frames = sent;
                                    s.error = None;
                                    if let Some(c) = connections {
                                        s.connections = c;
                                    }
                                });
                            }
                            Err(e) => {
                                let message = e.to_string();
                                update(&|s| s.error = Some(message.clone()));
                                std::thread::sleep(RETRY);
                            }
                        }
                    }
                })
                .map_err(|e| crate::types::AppError::Other(e.to_string()))?
        };
        Ok(Self {
            stop,
            status,
            thread: Some(thread),
        })
    }

    pub fn status(&self) -> Status {
        self.status
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }
}

impl Drop for Output {
    /// Stopping waits for the frame in hand, then the source disappears from the network.
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::AppError;
    use std::sync::atomic::AtomicUsize;

    fn frame() -> Frame {
        Frame {
            width: 64,
            height: 36,
            bgra: vec![200; 64 * 36 * 4],
        }
    }

    fn wait_until(what: &str, mut done: impl FnMut() -> bool) {
        let end = std::time::Instant::now() + Duration::from_secs(10);
        while !done() {
            assert!(
                std::time::Instant::now() < end,
                "timed out waiting for {what}"
            );
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    #[test]
    fn frames_are_sent_and_counted_and_stopping_ends_the_thread() {
        let name = format!("Yarda output test {}", std::process::id());
        let grabbed = Arc::new(AtomicUsize::new(0));
        let counter = grabbed.clone();
        let Ok(output) = Output::start(
            &name,
            Box::new(move || {
                counter.fetch_add(1, Ordering::Relaxed);
                Ok(frame())
            }),
        ) else {
            eprintln!("NDI runtime not installed; skipping");
            return;
        };
        wait_until("frames to be sent", || output.status().frames >= 5);
        assert_eq!(output.status().error, None);
        drop(output);
        let after = grabbed.load(Ordering::Relaxed);
        std::thread::sleep(Duration::from_millis(300));
        assert_eq!(
            grabbed.load(Ordering::Relaxed),
            after,
            "nothing is grabbed after stopping"
        );
    }

    #[test]
    fn a_frame_that_cannot_be_grabbed_is_reported_and_then_recovers() {
        let name = format!("Yarda output retry {}", std::process::id());
        let calls = Arc::new(AtomicUsize::new(0));
        let counter = calls.clone();
        let Ok(output) = Output::start(
            &name,
            Box::new(move || {
                // The window is closed for the first two tries, then back.
                if counter.fetch_add(1, Ordering::Relaxed) < 2 {
                    Err(AppError::Other(
                        "The presentation window isn't open.".into(),
                    ))
                } else {
                    Ok(frame())
                }
            }),
        ) else {
            eprintln!("NDI runtime not installed; skipping");
            return;
        };
        wait_until("the first error to be reported", || {
            output.status().error.as_deref() == Some("The presentation window isn't open.")
        });
        wait_until("it to recover", || {
            output.status().frames >= 1 && output.status().error.is_none()
        });
    }

    #[test]
    fn a_stray_nul_in_the_name_is_dropped_not_fatal() {
        if super::super::runtime::runtime().is_err() {
            eprintln!("NDI runtime not installed; skipping");
            return;
        }
        assert!(
            Output::start("bad\0name", Box::new(|| Ok(frame()))).is_ok(),
            "a NUL is stripped, not fatal"
        );
    }
}
