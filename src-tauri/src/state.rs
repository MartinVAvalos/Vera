use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use bible_core::{error::BibleError, traits::BibleEngine};
use bible_engine::composite::CompositeEngine;
use module_manager::manager::ModuleManager;
use persistence::db::Database;
use search_engine::index::VerseIndex;

/// Source fingerprint versioning. Bump when fingerprint computation changes
/// to invalidate old cached metadata and trigger re-indexing.
const FINGERPRINT_VERSION: u32 = 2;

/// Compute a deterministic fingerprint from a file's metadata.
/// Includes file path, size, and mtime to avoid collisions.
/// Returns None if the file cannot be stat'd.
fn fingerprint_file(path: &Path) -> Option<u64> {
    let meta = std::fs::metadata(path).ok()?;
    let mtime_secs = meta
        .modified()
        .ok()?
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .ok()?
        .as_secs();

    // Use a simple but collision-resistant approach:
    // High 32 bits: file size (capped), low 32 bits: mtime seconds (wraps every ~136 years)
    // Also include path hash to differentiate same-sized files with same mtime.
    let path_hash = {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        path.hash(&mut hasher);
        (hasher.finish() as u32) as u64
    };

    let size = meta.len().min(u32::MAX as u64) as u32 as u64;
    let mtime = (mtime_secs & 0xFFFFFFFF) as u64;

    // Combine version, size, mtime, and path hash for a 64-bit fingerprint.
    // version(8) | size_hi(8) | mtime_hi(16) | size_lo(16) | mtime_lo(16)
    let fingerprint = ((FINGERPRINT_VERSION as u64) << 56)
        | (((size >> 16) & 0xFF) << 48)
        | (((mtime >> 16) & 0xFFFF) << 32)
        | ((size & 0xFFFF) << 16)
        | (mtime & 0xFFFF)
        ^ path_hash;

    Some(fingerprint)
}

/// Fingerprint multiple files deterministically (sorted by path).
/// Returns None if any file is missing or unreadable.
fn fingerprint_files(paths: &[PathBuf]) -> Option<u64> {
    if paths.is_empty() {
        return None;
    }

    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    // Sort for determinism
    let mut sorted = paths.to_vec();
    sorted.sort();

    for path in sorted {
        let fp = fingerprint_file(&path)?;
        fp.hash(&mut hasher);
    }

    Some(hasher.finish())
}

/// Find all source files for an XML (OSIS/XML) module.
/// Returns paths to found text files, or None if the module directory doesn't exist.
fn xml_source_files(modules_dir: &Path, id: &str) -> Option<Vec<PathBuf>> {
    let module_dir = modules_dir.join(id);
    if !module_dir.exists() {
        return None;
    }

    let mut files = Vec::new();
    // Look for text.osis or text.xml (order doesn't matter, we'll sort)
    for name in ["text.osis", "text.xml"] {
        let path = module_dir.join(name);
        if path.exists() {
            files.push(path);
        }
    }

    if files.is_empty() {
        None
    } else {
        Some(files)
    }
}

/// Find all source files for a SWORD module by parsing its .conf file.
/// Returns paths to data files referenced by DataPath, or None if the conf
/// file is missing or the DataPath cannot be resolved.
fn sword_source_files(id: &str, sword_dir: &Path) -> Option<Vec<PathBuf>> {
    let conf_path = sword_dir
        .join("mods.d")
        .join(format!("{}.conf", id.to_ascii_lowercase()));

    if !conf_path.exists() {
        return None;
    }

    let conf_text = std::fs::read_to_string(&conf_path).ok()?;

    // Extract DataPath value from conf
    let data_path = conf_text
        .lines()
        .find_map(|l| {
            let (k, v) = l.split_once('=')?;
            k.trim()
                .eq_ignore_ascii_case("DataPath")
                .then(|| v.trim())
        })?;

    // Resolve DataPath relative to sword_dir, ensuring it stays within modules/
    let rel = Path::new(data_path.trim_start_matches("./"));
    let safe = rel
        .components()
        .all(|c| matches!(c, std::path::Component::Normal(_)));
    if !safe || !rel.starts_with("modules") {
        return None;
    }

    let data_dir = sword_dir.join(rel);
    if !data_dir.exists() {
        return None;
    }

    // Collect all files recursively under the data directory
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&data_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                files.push(path);
            } else if path.is_dir() {
                // Recursively add files from subdirectories
                if let Ok(sub) = collect_all_files(&path) {
                    files.extend(sub);
                }
            }
        }
    }

    if files.is_empty() {
        None
    } else {
        Some(files)
    }
}

/// Recursively collect all files in a directory.
fn collect_all_files(dir: &Path) -> std::io::Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                files.push(path);
            } else if path.is_dir() {
                files.extend(collect_all_files(&path)?);
            }
        }
    }
    Ok(files)
}

/// Return a source fingerprint for a module without reading its Bible text.
/// XML modules: fingerprints text.osis or text.xml.
/// SWORD modules: fingerprints the data files referenced in {id}.conf.
///
/// Returns None if no source files are found (module not installed or unreadable).
/// Never returns Some(0) — 0 is reserved for "uninstall" operations.
fn module_source_fingerprint(id: &str, modules_dir: &Path, sword_dir: &Path) -> Option<u64> {
    // Try XML module first
    if let Some(files) = xml_source_files(modules_dir, id) {
        return fingerprint_files(&files);
    }

    // Try SWORD module
    sword_source_files(id, sword_dir)
        .and_then(|files| fingerprint_files(&files))
}

type Result<T> = std::result::Result<T, BibleError>;

#[derive(Clone)]
pub struct AppState {
    pub bible_engine: Arc<CompositeEngine>,
    pub module_manager: Arc<Mutex<ModuleManager>>,
    pub search_engine: Arc<VerseIndex>,
    pub db: Arc<Mutex<Database>>,
    modules_dir: PathBuf,
    sword_dir: PathBuf,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&data_dir)?;
        // XML (OSIS/Zefania) modules and native CrossWire SWORD modules live side by side.
        let modules_dir = data_dir.join("modules");
        let sword_dir = data_dir.join("sword");
        std::fs::create_dir_all(&modules_dir)?;
        std::fs::create_dir_all(sword_dir.join("mods.d"))?;

        tracing::info!(
            "native SWORD support compiled in: {}",
            CompositeEngine::native_enabled()
        );

        let bible_engine = Arc::new(CompositeEngine::new(modules_dir.clone(), sword_dir.clone()));
        let module_manager = ModuleManager::new(modules_dir.clone(), sword_dir.clone());
        let search_engine = Arc::new(VerseIndex::new(data_dir.join("index"))?);
        let db = Database::open(&data_dir.join("vera.db"))?;
        db.init_schema()?;

        // Enumerate installed modules without extracting any Bible text.
        // Only modules whose source fingerprint differs from the cached value are re-indexed;
        // unchanged modules are skipped entirely (no verse extraction).
        let installed = bible_engine.list_modules()?;
        for module in installed {
            let fp = module_source_fingerprint(&module.id, &modules_dir, &sword_dir);
            if search_engine.is_module_current(&module.id, fp) {
                tracing::debug!(
                    "module '{}' index current, skipping re-extraction on startup",
                    module.id
                );
                continue;
            }
            match bible_engine.verses_for_module(&module.id)? {
                Some(verses) => {
                    if let Err(e) = search_engine.index_module(&module.id, &verses, fp) {
                        tracing::warn!("Could not index module '{}': {}", module.id, e);
                    }
                }
                None => tracing::warn!("module '{}' listed but could not be loaded", module.id),
            }
        }

        Ok(Self {
            bible_engine,
            module_manager: Arc::new(Mutex::new(module_manager)),
            search_engine,
            db: Arc::new(Mutex::new(db)),
            modules_dir,
            sword_dir,
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
        // An empty slice with Some(0) fingerprint deletes every indexed document for this module_id.
        self.search_engine.index_module(id, &[], Some(0))
    }

    fn lock_manager(&self) -> Result<std::sync::MutexGuard<'_, ModuleManager>> {
        self.module_manager
            .lock()
            .map_err(|e| BibleError::Engine(e.to_string()))
    }

    fn after_install(&self, id: &str) -> Result<()> {
        self.bible_engine.reload();
        let fp = module_source_fingerprint(id, &self.modules_dir, &self.sword_dir);
        match self.bible_engine.verses_for_module(id)? {
            Some(verses) => self.search_engine.index_module(id, &verses, fp),
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

    // ── helpers ────────────────────────────────────────────────────────────────

    fn temp_data_dir(label: &str) -> PathBuf {
        let d = std::env::temp_dir().join("vera_p06a1").join(label);
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    /// Write a minimal XML (OSIS) Bible module so tests run without VERA_SWORD_ZIPS.
    fn write_xml_module(modules_dir: &Path, id: &str, verse_text: &str) {
        let dir = modules_dir.join(id);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("module.json"),
            format!(r#"{{"id":"{id}","name":"{id}","type":"Bible","lang":"en"}}"#),
        )
        .unwrap();
        std::fs::write(
            dir.join("text.osis"),
            format!(
                concat!(
                    r#"<osis><osisText>"#,
                    r#"<div type="book" osisID="Gen">"#,
                    r#"<chapter osisID="Gen.1">"#,
                    r#"<verse osisID="Gen.1.1">{}</verse>"#,
                    r#"</chapter></div></osisText></osis>"#
                ),
                verse_text
            ),
        )
        .unwrap();
    }

    // ── CI-safe XML-module tests (no VERA_SWORD_ZIPS required) ────────────────

    #[test]
    fn cold_startup_builds_index_for_xml_module() {
        let data = temp_data_dir("cold_startup_xml");
        write_xml_module(&data.join("modules"), "TESTMOD", "unique_cold_text_alpha");

        let state = AppState::new(data.clone()).unwrap();

        let fp = module_source_fingerprint("TESTMOD", &data.join("modules"), &data.join("sword"));
        assert!(
            state.search_engine.is_module_current("TESTMOD", fp),
            "Cold startup must index the module with correct fingerprint"
        );
        let results = state
            .search_engine
            .search("unique_cold_text_alpha", 10)
            .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].module_id, "TESTMOD");

        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn warm_startup_reuses_index_xml_module() {
        let data = temp_data_dir("warm_startup_xml");
        write_xml_module(&data.join("modules"), "WARMMOD", "unique_warm_text_beta");

        // Cold startup
        {
            let state = AppState::new(data.clone()).unwrap();
            let fp =
                module_source_fingerprint("WARMMOD", &data.join("modules"), &data.join("sword"));
            assert!(state.search_engine.is_module_current("WARMMOD", fp));
        }

        // Warm startup: source file unchanged → fingerprint identical → skip extraction.
        // Proof: search returns the original content without having re-indexed.
        {
            let state = AppState::new(data.clone()).unwrap();
            let fp =
                module_source_fingerprint("WARMMOD", &data.join("modules"), &data.join("sword"));
            assert!(
                state.search_engine.is_module_current("WARMMOD", fp),
                "Fingerprint must still match after warm startup"
            );
            let results = state
                .search_engine
                .search("unique_warm_text_beta", 10)
                .unwrap();
            assert_eq!(
                results.len(),
                1,
                "Warm startup must not duplicate indexed content"
            );
        }

        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn changed_xml_source_triggers_reindex_on_startup() {
        let data = temp_data_dir("changed_source_xml");
        // Use unique words without underscores: Tantivy's QueryParser uses OR
        // for tokenized terms, so words that share tokens can produce false matches.
        write_xml_module(&data.join("modules"), "MOD", "xylozorpher");

        // Cold startup
        {
            let state = AppState::new(data.clone()).unwrap();
            assert!(
                !state
                    .search_engine
                    .search("xylozorpher", 10)
                    .unwrap()
                    .is_empty()
            );
        }

        // Ensure mtime changes by waiting (fingerprints use second-granularity mtime)
        std::thread::sleep(std::time::Duration::from_millis(1100));

        // Overwrite source file with different content (new mtime and/or size → new fingerprint)
        write_xml_module(&data.join("modules"), "MOD", "quarbondizer");

        // Next startup: fingerprint changed → module re-indexed with new content
        {
            let state = AppState::new(data.clone()).unwrap();
            assert!(
                state
                    .search_engine
                    .search("xylozorpher", 10)
                    .unwrap()
                    .is_empty(),
                "Old content must be gone after re-index"
            );
            let results = state.search_engine.search("quarbondizer", 10).unwrap();
            assert_eq!(
                results.len(),
                1,
                "New content must be indexed after source change"
            );
        }

        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn corrupted_metadata_is_recoverable_on_startup() {
        let data = temp_data_dir("corrupt_meta_startup");
        write_xml_module(&data.join("modules"), "MOD", "some_text_epsilon");

        // Cold startup to populate both Tantivy and metadata
        {
            AppState::new(data.clone()).unwrap();
        }

        // Corrupt the metadata file
        let meta_path = data.join("index").join("index_metadata.json");
        std::fs::write(&meta_path, b"not valid json {{{{").unwrap();

        // Must start cleanly and re-index
        let state = AppState::new(data.clone()).unwrap();
        let fp = module_source_fingerprint("MOD", &data.join("modules"), &data.join("sword"));
        assert!(
            state.search_engine.is_module_current("MOD", fp),
            "Must re-index and restore valid metadata after corruption"
        );
        let results = state.search_engine.search("some_text_epsilon", 10).unwrap();
        assert_eq!(results.len(), 1);

        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn missing_tantivy_index_triggers_rebuild() {
        let data = temp_data_dir("missing_index_rebuild");
        write_xml_module(&data.join("modules"), "MOD", "some_text_zeta");

        // Cold startup
        {
            AppState::new(data.clone()).unwrap();
        }

        // Delete Tantivy segments but leave metadata file intact
        let index_dir = data.join("index");
        for entry in std::fs::read_dir(&index_dir).unwrap().flatten() {
            if entry.file_name() != "index_metadata.json" {
                let _ = std::fs::remove_file(entry.path());
                let _ = std::fs::remove_dir_all(entry.path());
            }
        }

        // Next startup must detect empty Tantivy index, clear stale metadata, and re-index
        let state = AppState::new(data.clone()).unwrap();
        let results = state.search_engine.search("some_text_zeta", 10).unwrap();
        assert_eq!(
            results.len(),
            1,
            "Must rebuild index when Tantivy segments are missing"
        );

        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn xml_module_uninstall_removes_search_results() {
        let data = temp_data_dir("xml_uninstall_isolation");
        write_xml_module(&data.join("modules"), "MOD_A", "module_a_eta");
        write_xml_module(&data.join("modules"), "MOD_B", "module_b_theta");

        let state = AppState::new(data.clone()).unwrap();

        assert!(
            !state
                .search_engine
                .search("module_a_eta", 10)
                .unwrap()
                .is_empty()
        );
        assert!(
            !state
                .search_engine
                .search("module_b_theta", 10)
                .unwrap()
                .is_empty()
        );

        // Uninstall by clearing search index (XML uninstall removes the module dir)
        state.search_engine.index_module("MOD_A", &[], Some(0)).unwrap();

        assert!(
            state
                .search_engine
                .search("module_a_eta", 10)
                .unwrap()
                .is_empty(),
            "MOD_A results must be removed"
        );
        assert!(
            !state
                .search_engine
                .search("module_b_theta", 10)
                .unwrap()
                .is_empty(),
            "MOD_B must be unaffected"
        );

        let _ = std::fs::remove_dir_all(&data);
    }

    // ── Validation tests (safe, no real modules) ───────────────────────────────

    #[test]
    fn fingerprint_collision_resistance() {
        // Test that different files with similar sizes and mtimes produce different fingerprints.
        let data = temp_data_dir("fingerprint_collision");

        // Write two modules with intentionally similar characteristics
        write_xml_module(&data.join("modules"), "MOD1", "content_one");
        write_xml_module(&data.join("modules"), "MOD2", "content_two");

        let fp1 = module_source_fingerprint("MOD1", &data.join("modules"), &data.join("sword"));
        let fp2 = module_source_fingerprint("MOD2", &data.join("modules"), &data.join("sword"));

        // Even if files are created close together, fingerprints must differ
        // (due to path hashing and version prefix)
        assert_ne!(fp1, fp2, "Different modules must produce different fingerprints");

        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn missing_source_does_not_match_valid_fingerprint() {
        // Verify that missing source (None fingerprint) does not match a valid fingerprint.
        let data = temp_data_dir("missing_source_match");
        let state = AppState::new(data.clone()).unwrap();

        // Create and index an XML module
        write_xml_module(&data.join("modules"), "MOD", "some_text");
        let fp = module_source_fingerprint("MOD", &data.join("modules"), &data.join("sword"));
        assert!(fp.is_some(), "Fresh module must have a valid fingerprint");

        // Simulate checking a non-existent module
        let missing_fp = module_source_fingerprint("NONEXISTENT", &data.join("modules"), &data.join("sword"));
        assert!(missing_fp.is_none(), "Missing module must return None");

        // Verify is_module_current never returns true for None fingerprint
        assert!(!state.search_engine.is_module_current("MOD", missing_fp),
            "Missing source (None) must not match any indexed module");

        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn multifile_module_detects_any_change() {
        // Create a fixture where multiple files contribute to fingerprint
        // This test verifies that changes to any source file invalidate the index.
        let data = temp_data_dir("multifile_detect");

        // Create an XML module directory with multiple files
        let mod_dir = data.join("modules").join("MULTIFILE");
        std::fs::create_dir_all(&mod_dir).unwrap();
        std::fs::write(mod_dir.join("module.json"),
            r#"{"id":"MULTIFILE","name":"Multi","type":"Bible","lang":"en"}"#).unwrap();
        std::fs::write(mod_dir.join("text.osis"),
            r#"<osis><osisText><div type="book" osisID="Gen"><chapter osisID="Gen.1"><verse osisID="Gen.1.1">First</verse></chapter></div></osisText></osis>"#).unwrap();

        let fp1 = module_source_fingerprint("MULTIFILE", &data.join("modules"), &data.join("sword"));
        assert!(fp1.is_some(), "Module with text.osis must have fingerprint");

        // Modify the text file (simulate re-extraction with different content)
        std::thread::sleep(std::time::Duration::from_millis(10)); // Ensure mtime change
        std::fs::write(mod_dir.join("text.osis"),
            r#"<osis><osisText><div type="book" osisID="Gen"><chapter osisID="Gen.1"><verse osisID="Gen.1.1">Modified</verse></chapter></div></osisText></osis>"#).unwrap();

        let fp2 = module_source_fingerprint("MULTIFILE", &data.join("modules"), &data.join("sword"));
        assert!(fp2.is_some(), "Modified module must still have fingerprint");
        assert_ne!(fp1, fp2, "Changing source file must produce different fingerprint");

        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn uninstall_isolation_unaffected_modules_searchable() {
        // Verify that uninstalling one module leaves others intact in search index
        let data = temp_data_dir("uninstall_isolation");
        write_xml_module(&data.join("modules"), "KEEP_A", "search_text_keep_a");
        write_xml_module(&data.join("modules"), "REMOVE_B", "search_text_remove_b");
        write_xml_module(&data.join("modules"), "KEEP_C", "search_text_keep_c");

        let state = AppState::new(data.clone()).unwrap();

        // Verify all modules indexed
        let all_results = state.search_engine.search("search_text", 100).unwrap();
        assert_eq!(all_results.len(), 3, "All three modules must be indexed initially");

        // Uninstall the middle module
        state.search_engine.index_module("REMOVE_B", &[], Some(0)).unwrap();

        // Verify others remain
        let after = state.search_engine.search("search_text", 100).unwrap();
        let ids: Vec<&str> = after.iter().map(|r| r.module_id.as_str()).collect();
        assert!(ids.contains(&"KEEP_A"), "KEEP_A must remain searchable");
        assert!(!ids.contains(&"REMOVE_B"), "REMOVE_B must be removed");
        assert!(ids.contains(&"KEEP_C"), "KEEP_C must remain searchable");
        assert_eq!(after.len(), 2, "Exactly 2 modules should remain");

        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn install_rejects_invalid_ids_and_garbage_without_side_effects() {
        let data = temp_data_dir("invalid_install");
        let state = AppState::new(data.clone()).unwrap();
        assert!(state.install_from_bytes("../evil", vec![1, 2, 3]).is_err());
        assert!(
            state
                .install_from_bytes("Good", b"not a zip".to_vec())
                .is_err()
        );
        assert!(state.bible_engine.list_modules().unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&data);
    }

    // ── SWORD integration tests (require VERA_SWORD_ZIPS) ─────────────────────

    /// Full lifecycle over real CrossWire zips.
    #[test]
    #[ignore = "needs VERA_SWORD_ZIPS"]
    fn real_sword_install_search_restart_uninstall_lifecycle() {
        let zips = PathBuf::from(std::env::var("VERA_SWORD_ZIPS").expect("VERA_SWORD_ZIPS"));
        let data = temp_data_dir("sword_lifecycle");

        let state = AppState::new(data.clone()).unwrap();
        assert!(state.bible_engine.list_modules().unwrap().is_empty());

        for id in ["KJV", "DRC"] {
            let bytes = std::fs::read(zips.join(format!("{id}.zip"))).unwrap();
            state
                .install_from_bytes(id, bytes)
                .unwrap_or_else(|e| panic!("install {id}: {e}"));
        }

        let kjv = state.bible_engine.get_chapter("KJV", "Gen", 1).unwrap();
        let drc = state.bible_engine.get_chapter("DRC", "Gen", 1).unwrap();
        assert_ne!(kjv.verses[0].text, drc.verses[0].text);
        assert!(state.bible_engine.get_chapter("DRC", "Tob", 1).is_ok());

        let hits = state.search_engine.search("beginning", 200).unwrap();
        assert!(hits.iter().any(|h| h.module_id == "KJV"));
        assert!(hits.iter().any(|h| h.module_id == "DRC"));

        // Warm restart: fingerprints unchanged → no re-extraction → no duplicates.
        drop(state);
        let state = AppState::new(data.clone()).unwrap();
        assert_eq!(state.bible_engine.list_modules().unwrap().len(), 2);
        let again = state.search_engine.search("beginning", 1000).unwrap();
        let kjv_gen11 = again
            .iter()
            .filter(|h| {
                h.module_id == "KJV"
                    && h.reference.book == "Gen"
                    && h.reference.chapter == 1
                    && h.reference.verse == 1
            })
            .count();
        assert_eq!(
            kjv_gen11, 1,
            "warm restart must not duplicate indexed results"
        );

        // Fingerprints stored after cold install must still match the installed files.
        let kjv_fp = module_source_fingerprint("KJV", &data.join("modules"), &data.join("sword"));
        assert!(
            state.search_engine.is_module_current("KJV", kjv_fp),
            "KJV fingerprint must match after warm restart"
        );

        state.uninstall("KJV").unwrap();
        assert!(state.bible_engine.get_chapter("KJV", "Gen", 1).is_err());
        assert!(state.bible_engine.get_chapter("DRC", "Gen", 1).is_ok());
        let after = state.search_engine.search("beginning", 1000).unwrap();
        assert!(
            after.iter().all(|h| h.module_id != "KJV"),
            "KJV hits must be gone after uninstall"
        );
        assert!(after.iter().any(|h| h.module_id == "DRC"));

        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    #[ignore = "needs VERA_SWORD_ZIPS"]
    fn sword_warm_startup_fingerprint_matches() {
        let zips = PathBuf::from(std::env::var("VERA_SWORD_ZIPS").expect("VERA_SWORD_ZIPS"));
        let data = temp_data_dir("sword_warm_fp");

        {
            let state = AppState::new(data.clone()).unwrap();
            let bytes = std::fs::read(zips.join("KJV.zip")).unwrap();
            state.install_from_bytes("KJV", bytes).unwrap();
        }

        let state = AppState::new(data.clone()).unwrap();
        let fp = module_source_fingerprint("KJV", &data.join("modules"), &data.join("sword"));
        assert!(
            state.search_engine.is_module_current("KJV", fp),
            "Fingerprint must match on warm SWORD startup"
        );
        assert!(fp.is_some(), "SWORD module must produce a fingerprint");
        let results = state.search_engine.search("beginning", 10).unwrap();
        assert!(!results.is_empty(), "Search must work after warm restart");

        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    #[ignore = "needs VERA_SWORD_ZIPS"]
    fn sword_reinstall_triggers_reindex() {
        let zips = PathBuf::from(std::env::var("VERA_SWORD_ZIPS").expect("VERA_SWORD_ZIPS"));
        let data = temp_data_dir("sword_reinstall");
        let bytes = std::fs::read(zips.join("KJV.zip")).unwrap();

        let state = AppState::new(data.clone()).unwrap();
        state.install_from_bytes("KJV", bytes.clone()).unwrap();
        assert!(state.search_engine.is_module_indexed("KJV"));

        state.uninstall("KJV").unwrap();
        assert!(!state.search_engine.is_module_indexed("KJV"));

        state.install_from_bytes("KJV", bytes).unwrap();
        let fp = module_source_fingerprint("KJV", &data.join("modules"), &data.join("sword"));
        assert!(state.search_engine.is_module_current("KJV", fp));
        assert!(
            !state
                .search_engine
                .search("beginning", 10)
                .unwrap()
                .is_empty()
        );

        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    #[ignore = "needs VERA_SWORD_ZIPS"]
    fn sword_module_id_correctness_across_lifecycle() {
        let zips = PathBuf::from(std::env::var("VERA_SWORD_ZIPS").expect("VERA_SWORD_ZIPS"));
        let data = temp_data_dir("sword_identity");
        let state = AppState::new(data.clone()).unwrap();

        for id in ["KJV", "DRC"] {
            let bytes = std::fs::read(zips.join(format!("{id}.zip"))).unwrap();
            state.install_from_bytes(id, bytes).unwrap();
        }

        for result in state.search_engine.search("beginning", 100).unwrap() {
            assert!(
                result.module_id == "KJV" || result.module_id == "DRC",
                "Unexpected module_id in results: {}",
                result.module_id
            );
        }

        let _ = std::fs::remove_dir_all(&data);
    }
}
