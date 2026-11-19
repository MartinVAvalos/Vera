use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

use bible_core::error::BibleError;
use bible_engine::composite::CompositeEngine;
use module_manager::manager::ModuleManager;
use persistence::db::Database;
use search_engine::index::VerseIndex;

type Result<T> = std::result::Result<T, BibleError>;

#[derive(Clone)]
pub struct AppState {
    pub bible_engine:   Arc<CompositeEngine>,
    pub module_manager: Arc<Mutex<ModuleManager>>,
    pub search_engine:  Arc<VerseIndex>,
    pub db:             Arc<Mutex<Database>>,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&data_dir)?;
        // XML (OSIS/Zefania) modules and native CrossWire SWORD modules live side by side.
        let modules_dir = data_dir.join("modules");
        let sword_dir = data_dir.join("sword");
        std::fs::create_dir_all(&modules_dir)?;
        std::fs::create_dir_all(sword_dir.join("mods.d"))?;

        tracing::info!("native SWORD support compiled in: {}", CompositeEngine::native_enabled());

        let bible_engine   = Arc::new(CompositeEngine::new(modules_dir.clone(), sword_dir.clone()));
        let module_manager = ModuleManager::new(modules_dir, sword_dir);
        let search_engine  = Arc::new(VerseIndex::new(data_dir.join("index"))?);
        let db             = Database::open(&data_dir.join("vera.db"))?;
        db.init_schema()?;

        // Index all modules that were just loaded from disk.
        for (module_id, verses) in bible_engine.all_verses_by_module() {
            if let Err(e) = search_engine.index_module(&module_id, &verses) {
                tracing::warn!("Could not index module '{}': {}", module_id, e);
            }
        }

        Ok(Self {
            bible_engine,
            module_manager: Arc::new(Mutex::new(module_manager)),
            search_engine,
            db: Arc::new(Mutex::new(db)),
        })
    }

    /// Download and install a module, then make it readable and searchable.
    pub fn install_from_url(&self, id: &str, url: &str) -> Result<()> {
        self.lock_manager()?.install(id, url)?;
        self.after_install(id)
    }

    /// Install a module from an in-memory zip, then make it readable and searchable.
    #[cfg_attr(not(test), allow(dead_code))]
    pub fn install_from_bytes(&self, id: &str, bytes: Vec<u8>) -> Result<()> {
        self.lock_manager()?.install_from_bytes(id, bytes)?;
        self.after_install(id)
    }

    /// Remove a module's files and purge it from the engine and the search index.
    pub fn uninstall(&self, id: &str) -> Result<()> {
        self.lock_manager()?.uninstall(id)?;
        self.bible_engine.reload();
        // An empty slice deletes every indexed document for this module_id.
        self.search_engine.index_module(id, &[])
    }

    fn lock_manager(&self) -> Result<std::sync::MutexGuard<'_, ModuleManager>> {
        self.module_manager
            .lock()
            .map_err(|e| BibleError::Engine(e.to_string()))
    }

    fn after_install(&self, id: &str) -> Result<()> {
        self.bible_engine.reload();
        match self.bible_engine.verses_for_module(id)? {
            Some(verses) => self.search_engine.index_module(id, &verses),
            None => Err(BibleError::Engine(format!(
                "module '{id}' was installed but could not be loaded"
            ))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bible_core::traits::BibleEngine;

    /// Lifecycle over real CrossWire zips. Needs `VERA_SWORD_ZIPS` pointing at a
    /// directory holding KJV.zip and DRC.zip (see `make test-native`).
    #[test]
    #[ignore = "needs VERA_SWORD_ZIPS"]
    fn real_sword_install_search_restart_uninstall_lifecycle() {
        let zips = PathBuf::from(std::env::var("VERA_SWORD_ZIPS").expect("VERA_SWORD_ZIPS"));
        let data = std::env::temp_dir().join("vera_state_lifecycle");
        let _ = std::fs::remove_dir_all(&data);

        let state = AppState::new(data.clone()).unwrap();
        assert!(state.bible_engine.list_modules().unwrap().is_empty());

        for id in ["KJV", "DRC"] {
            let bytes = std::fs::read(zips.join(format!("{id}.zip"))).unwrap();
            state.install_from_bytes(id, bytes).unwrap_or_else(|e| panic!("install {id}: {e}"));
        }

        // Both modules readable without a restart, each returning its own text.
        let kjv = state.bible_engine.get_chapter("KJV", "Gen", 1).unwrap();
        let drc = state.bible_engine.get_chapter("DRC", "Gen", 1).unwrap();
        assert_ne!(kjv.verses[0].text, drc.verses[0].text);
        assert!(state.bible_engine.get_chapter("DRC", "Tob", 1).is_ok());

        // Search sees both, each hit tagged with its module.
        let hits = state.search_engine.search("beginning", 200).unwrap();
        assert!(hits.iter().any(|h| h.module_id == "KJV"));
        assert!(hits.iter().any(|h| h.module_id == "DRC"));

        // Restart: a fresh AppState on the same directory reads offline and
        // re-indexing does not duplicate hits.
        drop(state);
        let state = AppState::new(data.clone()).unwrap();
        assert_eq!(state.bible_engine.list_modules().unwrap().len(), 2);
        let again = state.search_engine.search("beginning", 1000).unwrap();
        let kjv_gen11 = again
            .iter()
            .filter(|h| h.module_id == "KJV" && h.reference.book == "Gen" && h.reference.chapter == 1 && h.reference.verse == 1)
            .count();
        assert_eq!(kjv_gen11, 1, "re-indexing on restart duplicated results");

        // Uninstall one module; the other is unaffected, in reads and in search.
        state.uninstall("KJV").unwrap();
        assert!(state.bible_engine.get_chapter("KJV", "Gen", 1).is_err());
        assert!(state.bible_engine.get_chapter("DRC", "Gen", 1).is_ok());
        let after = state.search_engine.search("beginning", 1000).unwrap();
        assert!(after.iter().all(|h| h.module_id != "KJV"), "KJV hits survived uninstall");
        assert!(after.iter().any(|h| h.module_id == "DRC"));
        assert!(!data.join("sword/mods.d/kjv.conf").exists());

        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn install_rejects_invalid_ids_and_garbage_without_side_effects() {
        let data = std::env::temp_dir().join("vera_state_invalid");
        let _ = std::fs::remove_dir_all(&data);
        let state = AppState::new(data.clone()).unwrap();
        assert!(state.install_from_bytes("../evil", vec![1, 2, 3]).is_err());
        assert!(state.install_from_bytes("Good", b"not a zip".to_vec()).is_err());
        assert!(state.bible_engine.list_modules().unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&data);
    }
}
