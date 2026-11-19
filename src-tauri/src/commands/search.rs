use tauri::State;

use bible_core::models::SearchResult;

use crate::state::AppState;

#[tauri::command]
pub fn search_text(
    state: State<'_, AppState>,
    query: String,
    limit: usize,
) -> Result<Vec<SearchResult>, String> {
    state
        .search_engine
        .search(&query, limit)
        .map_err(|e| e.to_string())
}
