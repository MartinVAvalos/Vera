mod commands;
mod state;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            let app_state = AppState::new(data_dir).expect("failed to initialize AppState");
            app.manage(app_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Bible reading
            commands::bible::get_verse,
            commands::bible::get_chapter,
            commands::bible::list_books,
            // Search
            commands::search::search_text,
            // Notes
            commands::notes::get_notes,
            commands::notes::save_note,
            commands::notes::delete_note,
            // Bookmarks
            commands::notes::get_bookmarks,
            commands::notes::save_bookmark,
            commands::notes::delete_bookmark,
            // Highlights
            commands::notes::get_highlights,
            commands::notes::save_highlight,
            commands::notes::delete_highlight,
            // Modules
            commands::modules::list_modules,
            commands::modules::install_module,
            commands::modules::uninstall_module,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
