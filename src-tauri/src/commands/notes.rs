use tauri::State;

use bible_core::models::{BibleRef, Bookmark, Highlight, Note};

use crate::state::AppState;

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn now_rfc3339() -> chrono::DateTime<chrono::Utc> {
    chrono::Utc::now()
}

// ── Notes ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_notes(
    state: State<'_, AppState>,
    reference: Option<String>,
) -> Result<Vec<Note>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_notes(reference.as_deref())
        .map_err(|e| e.to_string())
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
    id: String,
    book: String,
    chapter: u32,
    verse: u32,
    label: String,
) -> Result<Bookmark, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let created_at = match db.get_bookmark(&id).map_err(|e| e.to_string())? {
        Some(existing) => existing.created_at,
        None => now_rfc3339(),
    };

    let bookmark = Bookmark {
        id,
        reference: BibleRef {
            book,
            chapter,
            verse,
        },
        label,
        created_at,
    };
    db.save_bookmark(&bookmark).map_err(|e| e.to_string())?;
    Ok(bookmark)
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
        reference: BibleRef {
            book,
            chapter,
            verse,
        },
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

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};
    use tauri::{
        WebviewWindow, WebviewWindowBuilder,
        ipc::{CallbackFn, InvokeBody},
        test::{
            INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
        },
        webview::InvokeRequest,
    };

    use crate::state::AppState;

    /// Sends `cmd` through Tauri's real IPC dispatch, as the Angular `invoke()` would.
    fn call(webview: &WebviewWindow<MockRuntime>, cmd: &str, args: Value) -> Result<Value, Value> {
        get_ipc_response(
            webview,
            InvokeRequest {
                cmd: cmd.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: if cfg!(windows) || cfg!(target_os = "android") {
                    "http://tauri.localhost"
                } else {
                    "tauri://localhost"
                }
                .parse()
                .unwrap(),
                body: InvokeBody::Json(args),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .map(|body| body.deserialize::<Value>().unwrap())
    }

    /// Mirrors the bookmark flow in the Angular panel against an isolated data directory:
    /// save John 3:16 with a client id, retry, delete immediately, then refresh.
    #[test]
    fn bookmark_commands_round_trip_through_the_ipc_layer() {
        let data = std::env::temp_dir().join("vera_ipc_bookmarks");
        let _ = std::fs::remove_dir_all(&data);
        let state = AppState::new(data.clone()).unwrap();

        let app = mock_builder()
            .manage(state)
            .invoke_handler(tauri::generate_handler![
                super::get_bookmarks,
                super::save_bookmark,
                super::delete_bookmark,
            ])
            .build(mock_context(noop_assets()))
            .unwrap();
        let webview = WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();

        // Argument names exactly as NotesService.saveBookmark sends them.
        let id = "5f1d2c7e-0000-4000-8000-000000003016";
        let payload =
            json!({ "id": id, "book": "John", "chapter": 3, "verse": 16, "label": "John 3:16" });

        let saved = call(&webview, "save_bookmark", payload.clone()).unwrap();
        assert_eq!(
            saved["id"], id,
            "the backend must return the id it persisted"
        );
        assert_eq!(
            saved["reference"],
            json!({ "book": "John", "chapter": 3, "verse": 16 })
        );
        assert_eq!(saved["label"], "John 3:16");
        let created_at = saved["created_at"]
            .as_str()
            .expect("created_at must be a string");
        assert!(
            chrono::DateTime::parse_from_rfc3339(created_at).is_ok(),
            "not RFC 3339: {created_at}"
        );
        let original_created_at = created_at.to_string();

        // A retry with the same id replaces the record instead of duplicating it
        // and must preserve the original created_at timestamp.
        std::thread::sleep(std::time::Duration::from_millis(100)); // ensure time passes
        let retried = call(&webview, "save_bookmark", payload).unwrap();
        assert_eq!(retried["id"], id);
        let retried_created_at = retried["created_at"]
            .as_str()
            .expect("created_at must be a string");
        assert_eq!(
            retried_created_at, original_created_at,
            "retry must preserve original created_at"
        );

        let listed = call(&webview, "get_bookmarks", json!({})).unwrap();
        assert_eq!(listed.as_array().unwrap().len(), 1);
        assert_eq!(listed[0]["id"], id);
        assert_eq!(listed[0]["created_at"], original_created_at);

        // Delete by the returned id, then refresh: it must not reappear.
        assert_eq!(
            call(&webview, "delete_bookmark", json!({ "id": id })).unwrap(),
            Value::Null
        );
        assert_eq!(
            call(&webview, "get_bookmarks", json!({})).unwrap(),
            json!([])
        );

        // A second delete is a plain-string error, which is what invoke() rejects with.
        let err = call(&webview, "delete_bookmark", json!({ "id": id })).unwrap_err();
        assert_eq!(
            err,
            json!(format!("Database error: bookmark {id} not found"))
        );

        drop(webview);
        drop(app);
        let _ = std::fs::remove_dir_all(&data);
    }
}
