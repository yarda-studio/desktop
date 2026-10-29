use crate::slides::{SlideDoc, SlideStore, SlideSummary};
use crate::types::AppError;
use tauri::State;

type Result<T> = std::result::Result<T, AppError>;

#[tauri::command]
pub fn list_slides(query: Option<String>, store: State<SlideStore>) -> Result<Vec<SlideSummary>> {
    store.db()?.list(query.as_deref())
}

#[tauri::command]
pub fn get_slide(id: i64, store: State<SlideStore>) -> Result<SlideDoc> {
    store.db()?.get(id)
}

#[tauri::command]
pub fn save_slide(slide: SlideDoc, store: State<SlideStore>) -> Result<SlideDoc> {
    store.db()?.save(&slide)
}

#[tauri::command]
pub fn delete_slide(id: i64, store: State<SlideStore>) -> Result<()> {
    store.db()?.delete(id)
}

#[tauri::command]
pub fn get_slide_schedule(store: State<SlideStore>) -> Result<Vec<SlideSummary>> {
    store.db()?.schedule()
}

#[tauri::command]
pub fn set_slide_schedule(ids: Vec<i64>, store: State<SlideStore>) -> Result<()> {
    store.db()?.set_schedule(&ids)
}
