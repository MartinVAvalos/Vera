use tauri::State;

use bible_core::{
    models::{BibleBook, BibleRef, Chapter, Verse},
    traits::BibleEngine,
};

use crate::state::AppState;

#[tauri::command]
pub fn get_verse(
    state: State<'_, AppState>,
    module_id: String,
    book: String,
    chapter: u32,
    verse: u32,
) -> Result<Verse, String> {
    state.bible_engine
        .get_verse(&module_id, &BibleRef { book, chapter, verse })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_chapter(
    state: State<'_, AppState>,
    module_id: String,
    book: String,
    chapter: u32,
) -> Result<Chapter, String> {
    state.bible_engine
        .get_chapter(&module_id, &book, chapter)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_books(
    state: State<'_, AppState>,
    module_id: String,
) -> Result<Vec<BibleBook>, String> {
    state.bible_engine
        .list_books(&module_id)
        .map_err(|e| e.to_string())
}
