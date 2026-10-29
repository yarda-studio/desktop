use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

/// Persisted presentation state so the presentation window can fetch it immediately on load.
pub struct PresentationState(pub Mutex<Option<Value>>);

/// The countdown timer's latest state, kept separately from the content state so
/// a timer can run without touching what scripture, songs or slides are sending.
pub struct CountdownState(pub Mutex<Option<Value>>);

/// Bumped whenever the content or countdown state changes, so a browser output
/// can poll cheaply and only download the state when it has actually changed.
pub struct OutputVersion(pub std::sync::atomic::AtomicU64);

impl OutputVersion {
    pub fn get(&self) -> u64 {
        self.0.load(Ordering::Relaxed)
    }

    fn bump(&self) {
        self.0.fetch_add(1, Ordering::Relaxed);
    }
}

/// Whether the background clock should tick into the output windows.
pub struct ClockTicks(pub Arc<AtomicBool>);

/// Windows that mirror the live output: the congregation screen and the worship team's stage display.
const OUTPUT_WINDOWS: [&str; 2] = ["presentation", "stage"];

/// Run `script` in every open output window. eval() is used rather than events
/// because macOS throttles JS delivery in unfocused WKWebViews (see relay_presentation).
fn eval_in_output_windows(app: &AppHandle, script: &str) -> std::result::Result<(), String> {
    for label in OUTPUT_WINDOWS {
        if let Some(window) = app.get_webview_window(label) {
            window.eval(script).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Start the thread that tells the output windows the time while a countdown
/// runs or the stage display is open. A page's own timers are throttled by macOS
/// when its window isn't focused, which would freeze a clock on the second
/// monitor; an externally driven eval() is not throttled.
pub fn spawn_clock_ticker(app: AppHandle, enabled: Arc<AtomicBool>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(250));
        if !enabled.load(Ordering::Relaxed) {
            continue;
        }
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let script = format!("window.__scripturaTick && window.__scripturaTick({now});");
        let _ = eval_in_output_windows(&app, &script);
    });
}

/// Relay presentation state from the main window to the presentation window.
/// Stores the latest state and pushes it via WebviewWindow::eval, which injects
/// JS directly into the target webview from the host process. This is used instead
/// of listen/emit or the window's own timers because macOS throttles JS execution
/// (including setTimeout and the event loop that would deliver a `listen` callback)
/// in WKWebViews that are not the key/focused window — eval() is driven externally
/// and isn't subject to that throttling.
#[tauri::command]
pub async fn relay_presentation(
    app: AppHandle,
    state: State<'_, PresentationState>,
    version: State<'_, OutputVersion>,
    payload: Value,
) -> std::result::Result<(), String> {
    // Persist so the window can pull it immediately on mount
    *state.0.lock().unwrap() = Some(payload.clone());
    version.bump();

    let json = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    let script = format!(
        "window.__scripturaApplyPresentation && window.__scripturaApplyPresentation({json});"
    );
    eval_in_output_windows(&app, &script)
}

/// Relay the countdown timer's state to the output windows.
#[tauri::command]
pub async fn relay_countdown(
    app: AppHandle,
    state: State<'_, CountdownState>,
    version: State<'_, OutputVersion>,
    payload: Value,
) -> std::result::Result<(), String> {
    *state.0.lock().unwrap() = Some(payload.clone());
    version.bump();
    let json = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    let script =
        format!("window.__scripturaApplyCountdown && window.__scripturaApplyCountdown({json});");
    eval_in_output_windows(&app, &script)
}

/// Called by an output window on mount to pick up a countdown that is already running.
#[tauri::command]
pub async fn get_countdown_state(
    state: State<'_, CountdownState>,
) -> std::result::Result<Option<Value>, String> {
    Ok(state.0.lock().unwrap().clone())
}

/// Turn the background clock on or off. The frontend enables it only while it is needed.
#[tauri::command]
pub fn set_clock_ticks(enabled: bool, ticks: State<'_, ClockTicks>) {
    ticks.0.store(enabled, Ordering::Relaxed);
}

/// Called by the presentation window on mount to get the current state without
/// waiting for the next emit (avoids race between window load and first relay call).
#[tauri::command]
pub async fn get_presentation_state(
    state: State<'_, PresentationState>,
) -> std::result::Result<Option<Value>, String> {
    Ok(state.0.lock().unwrap().clone())
}

#[derive(serde::Serialize)]
pub struct MonitorInfo {
    pub index: usize,
    pub name: Option<String>,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    /// Physical px per CSS px — `width`/`height` are physical, the page lays out in CSS px.
    pub scale_factor: f64,
    pub is_primary: bool,
}

#[tauri::command]
pub async fn list_monitors(app: AppHandle) -> std::result::Result<Vec<MonitorInfo>, String> {
    let window = app.get_webview_window("main").ok_or("no main window")?;
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let primary_pos = window
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .map(|m| *m.position());

    Ok(monitors
        .into_iter()
        .enumerate()
        .map(|(index, m)| {
            let pos = *m.position();
            let size = *m.size();
            MonitorInfo {
                index,
                name: m.name().cloned(),
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
                scale_factor: m.scale_factor(),
                is_primary: primary_pos == Some(pos),
            }
        })
        .collect())
}

/// The output window's real content size in CSS px (None when it isn't open),
/// so the console can size its split measurements and Main Output preview to
/// exactly what the output screen lays out against.
#[tauri::command]
pub async fn get_presentation_window_size(
    app: AppHandle,
) -> std::result::Result<Option<(f64, f64)>, String> {
    let Some(window) = app.get_webview_window("presentation") else {
        return Ok(None);
    };
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    Ok(Some((
        size.width as f64 / scale,
        size.height as f64 / scale,
    )))
}

#[tauri::command]
pub async fn open_presentation_window(
    app: AppHandle,
    monitor_index: Option<usize>,
) -> std::result::Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    // If already open, just focus it
    if let Some(w) = app.get_webview_window("presentation") {
        let _ = w.set_focus();
        return Ok(());
    }

    let target_monitor = monitor_index.and_then(|idx| {
        app.get_webview_window("main")
            .and_then(|w| w.available_monitors().ok())
            .and_then(|monitors| monitors.into_iter().nth(idx))
    });

    // A normal, decorated, resizable window rather than OS fullscreen — a
    // borderless fullscreen window is the standard reason capture tools like
    // OBS's Window Capture fail to enumerate or correctly bind to a window on
    // Windows. Decorated + maximized behaves like any ordinary app window
    // (title bar, restore/maximize button, movable, resizable) that an
    // operator can drag onto a second display and maximize themselves, while
    // still landing there automatically by default.
    let window =
        WebviewWindowBuilder::new(&app, "presentation", WebviewUrl::App("index.html".into()))
            .title("Yarda Live")
            .inner_size(1024.0, 640.0)
            .initialization_script("window.__SCRIPTURA_PRESENTATION__ = true;")
            .build()
            .map_err(|e| e.to_string())?;

    if let Some(monitor) = target_monitor {
        let _ = window.set_position(tauri::Position::Physical(*monitor.position()));
        // A short delay before maximizing gives the window manager time to
        // actually finish moving the window first — without it, the OS can
        // maximize onto whichever screen the window appeared to be on *before*
        // the move finished (the same race we previously hit with fullscreen).
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    let _ = window.maximize();

    // Now that the window has a real title bar (see above), the operator can
    // close it with the native close button, not just Scriptura's own "Stop
    // presentation" toggle. Either path ends up here, so the main window's
    // "LIVE" state doesn't go stale regardless of which one was used.
    let app_for_close = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
            let _ = app_for_close.emit("presentation-closed", ());
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn close_presentation_window(app: AppHandle) -> std::result::Result<(), String> {
    if let Some(w) = app.get_webview_window("presentation") {
        w.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Open the stage display (what the worship team sees) on a chosen monitor.
#[tauri::command]
pub async fn open_stage_window(
    app: AppHandle,
    monitor_index: Option<usize>,
) -> std::result::Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    if let Some(w) = app.get_webview_window("stage") {
        let _ = w.set_focus();
        return Ok(());
    }

    let target_monitor = monitor_index.and_then(|idx| {
        app.get_webview_window("main")
            .and_then(|w| w.available_monitors().ok())
            .and_then(|monitors| monitors.into_iter().nth(idx))
    });

    let window = WebviewWindowBuilder::new(&app, "stage", WebviewUrl::App("index.html".into()))
        .title("Yarda Stage")
        .inner_size(1024.0, 640.0)
        .initialization_script("window.__SCRIPTURA_STAGE__ = true;")
        .build()
        .map_err(|e| e.to_string())?;

    if let Some(monitor) = target_monitor {
        let _ = window.set_position(tauri::Position::Physical(*monitor.position()));
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    let _ = window.maximize();

    // The native close button ends up here too, so the main window's idea of
    // whether the stage display is open never goes stale.
    let app_for_close = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
            let _ = app_for_close.emit("stage-closed", ());
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn close_stage_window(app: AppHandle) -> std::result::Result<(), String> {
    if let Some(w) = app.get_webview_window("stage") {
        w.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
