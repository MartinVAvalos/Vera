use tauri::State;

use bible_core::models::{Bookmark, BibleRef, Highlight, Note};

use crate::state::AppState;

fn new_id() -> String { uuid::Uuid::new_v4().to_string() }
fn now_rfc3339() -> chrono::DateTime<chrono::Utc> { chrono::Utc::now() }

// ── Notes ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_notes(
    state: State<'_, AppState>,
    reference: Option<String>,
) -> Result<Vec<Note>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_notes(reference.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_note(state: State<'_, AppState>, note: Note) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.save_note(&note).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_note(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_note(&id).map_err(|e| e.to_string())
}

// ── Bookmarks ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_bookmarks(state: State<'_, AppState>) -> Result<Vec<Bookmark>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_bookmarks().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_bookmark(
    state: State<'_, AppState>,
    book: String,
    chapter: u32,
    verse: u32,
    label: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let bookmark = Bookmark {
        id: new_id(),
        reference: BibleRef { book, chapter, verse },
        label,
        created_at: now_rfc3339(),
    };
    db.save_bookmark(&bookmark).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_bookmark(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_bookmark(&id).map_err(|e| e.to_string())
}

// ── Highlights ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_highlights(state: State<'_, AppState>) -> Result<Vec<Highlight>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_highlights().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_highlight(
    state: State<'_, AppState>,
    book: String,
    chapter: u32,
    verse: u32,
    color: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let highlight = Highlight {
        id: new_id(),
        reference: BibleRef { book, chapter, verse },
        color,
        created_at: now_rfc3339(),
    };
    db.save_highlight(&highlight).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_highlight(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_highlight(&id).map_err(|e| e.to_string())
}
