use tauri::State;
use bible_core::{models::Module, traits::BibleEngine};
use crate::state::AppState;

#[tauri::command]
pub fn list_modules(state: State<'_, AppState>) -> Result<Vec<Module>, String> {
    state.bible_engine.list_modules().map_err(|e| e.to_string())
}

/// Download and install a module archive (XML or CrossWire SWORD layout), then
/// reload the engine and re-index that module. Runs off the UI thread.
#[tauri::command]
pub async fn install_module(
    state: State<'_, AppState>,
    id: String,
    url: String,
) -> Result<(), String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state.install_from_url(&id, &url).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Remove a module's files and purge it from the engine and search index.
#[tauri::command]
pub async fn uninstall_module(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state.uninstall(&id).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
