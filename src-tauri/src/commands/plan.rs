use crate::plan::{PlanItem, PlanStore, PlanSyncRecord};
use crate::slides::SlideStore;
use crate::songs::SongStore;
use crate::types::AppError;
use tauri::State;

type Result<T> = std::result::Result<T, AppError>;

#[tauri::command]
pub fn list_plan(store: State<PlanStore>) -> Result<Vec<PlanItem>> {
    store.db()?.list()
}

/// Replace the whole plan. Returns it as stored, with ids and text normalised.
#[tauri::command]
pub fn set_plan(items: Vec<PlanItem>, store: State<PlanStore>) -> Result<Vec<PlanItem>> {
    store.db()?.replace(&items)
}

// ── Cloud sync ───────────────────────────────────────────────────────────────
// The plan syncs on its own, apart from the rest of cloud sync (see plan/sync.rs).

/// The plan as it should be sent to the cloud, or nothing if it has not changed.
#[tauri::command]
pub fn plan_sync_pending(store: State<PlanStore>) -> Result<Option<PlanSyncRecord>> {
    store.db()?.sync_pending()
}

/// The cloud took the plan as edited at `client_updated_at`.
#[tauri::command]
pub fn plan_sync_mark_pushed(client_updated_at: String, store: State<PlanStore>) -> Result<()> {
    store.db()?.sync_mark_pushed(&client_updated_at)
}

/// Take the cloud's plan if it is newer than ours. Songs and slides are matched
/// to this device's libraries by title; if a library cannot be read, those steps
/// are simply left unlinked. Returns whether the plan changed.
#[tauri::command]
pub fn plan_sync_apply(
    data: serde_json::Value,
    client_updated_at: String,
    store: State<PlanStore>,
    songs: State<SongStore>,
    slides: State<SlideStore>,
) -> Result<bool> {
    let resolve = |kind: &str, title: &str| match kind {
        "song" => songs.db().ok()?.find_id_by_title(title).ok().flatten(),
        "slide" => slides.db().ok()?.find_id_by_title(title).ok().flatten(),
        _ => None,
    };
    store.db()?.sync_apply(&data, &client_updated_at, &resolve)
}
