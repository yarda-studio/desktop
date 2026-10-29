use crate::remote::{OutputStatus, RemoteServer, RemoteStatus};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn remote_status(remote: State<RemoteServer>) -> RemoteStatus {
    remote.status()
}

#[tauri::command]
pub fn remote_set_enabled(
    enabled: bool,
    app: AppHandle,
    remote: State<RemoteServer>,
) -> Result<RemoteStatus, String> {
    remote.set_enabled(enabled, &app)?;
    Ok(remote.status())
}

/// Replace the pairing secret; phones using the old link stop working.
#[tauri::command]
pub fn remote_reset_access(remote: State<RemoteServer>) -> Result<RemoteStatus, String> {
    remote.reset_token()?;
    Ok(remote.status())
}

#[tauri::command]
pub fn output_status(remote: State<RemoteServer>) -> OutputStatus {
    remote.output_status()
}

/// Turn the web outputs (browser-source pages for video mixers) on or off.
#[tauri::command]
pub fn output_set_enabled(
    enabled: bool,
    app: AppHandle,
    remote: State<RemoteServer>,
) -> Result<OutputStatus, String> {
    remote.set_output_enabled(enabled, &app)?;
    Ok(remote.output_status())
}

/// Replace the outputs' secret; browser sources using the old link stop working.
#[tauri::command]
pub fn output_reset_access(remote: State<RemoteServer>) -> Result<OutputStatus, String> {
    remote.reset_output_token()?;
    Ok(remote.output_status())
}

/// The app's latest summary of what is live, for the phone to display.
#[tauri::command]
pub fn remote_publish_state(json: String, remote: State<RemoteServer>) -> Result<(), String> {
    remote.publish(json)
}
