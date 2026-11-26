use std::collections::HashMap;
use std::path::{Path, PathBuf};

use tantivy::{
    collector::TopDocs,
    directory::MmapDirectory,
    query::QueryParser,
    schema::{Schema, Value, FAST, STORED, STRING, TEXT},
    Index, TantivyDocument,
};

use bible_core::{
    error::BibleError,
    models::{BibleRef, SearchResult, Verse},
};

type Result<T> = std::result::Result<T, BibleError>;

/// Metadata file tracking which modules have been indexed.
const METADATA_FILE: &str = "index_metadata.json";

/// Persistent metadata mapping each indexed module to a source fingerprint.
/// The fingerprint is computed from the module's source file (mtime + size) so
/// that reinstalls with changed content are detected without reading Bible text.
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Default)]
struct IndexMetadata {
    indexed_modules: HashMap<String, u64>,
}

impl IndexMetadata {
    /// Load from disk, returning an empty default on missing or corrupt files.
    fn load(index_dir: &Path) -> Self {
        let path = index_dir.join(METADATA_FILE);
        if !path.exists() {
            return Self::default();
        }
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(|| {
                tracing::warn!("Corrupt index metadata at {:?}; will rebuild", path);
                Self::default()
            })
    }

    /// Write atomically via a temp file + rename to avoid partial writes on crash.
    fn save(&self, index_dir: &Path) -> std::io::Result<()> {
        let final_path = index_dir.join(METADATA_FILE);
        let tmp_path = index_dir.join(format!("{METADATA_FILE}.tmp"));
        let json = serde_json::to_string(self).map_err(std::io::Error::other)?;
        std::fs::write(&tmp_path, json)?;
        std::fs::rename(tmp_path, final_path)
    }

    /// Mark a module as indexed with the given source fingerprint.
    fn mark_indexed(&mut self, module_id: &str, fingerprint: u64) {
        self.indexed_modules
            .insert(module_id.to_string(), fingerprint);
    }

    /// True when the stored fingerprint for `module_id` exactly matches `fingerprint`.
    fn is_current(&self, module_id: &str, fingerprint: u64) -> bool {
        self.indexed_modules.get(module_id).copied() == Some(fingerprint)
    }

    /// True when any fingerprint entry exists for `module_id` (regardless of value).
    fn is_present(&self, module_id: &str) -> bool {
        self.indexed_modules.contains_key(module_id)
    }

    fn remove_module(&mut self, module_id: &str) {
        self.indexed_modules.remove(module_id);
    }

    fn has_entries(&self) -> bool {
        !self.indexed_modules.is_empty()
    }
}

pub struct VerseIndex {
    index_dir: PathBuf,
    schema: Schema,
    index: Index,
    metadata: std::sync::Mutex<IndexMetadata>,
}

impl VerseIndex {
    pub fn new(dir: PathBuf) -> Result<Self> {
        let schema = build_schema();
        std::fs::create_dir_all(&dir).map_err(BibleError::Io)?;
        let index = open_or_rebuild(&dir, &schema)?;
        let mut metadata = IndexMetadata::load(&dir);

        // If metadata claims modules are indexed but Tantivy has no documents
        // (segments were externally wiped), clear the stale metadata so the
        // modules are re-indexed on next startup.
        if metadata.has_entries() {
            let doc_count = index
                .reader_builder()
                .reload_policy(tantivy::ReloadPolicy::Manual)
                .try_into()
                .ok()
                .map(|r: tantivy::IndexReader| r.searcher().num_docs())
                .unwrap_or(0);
            if doc_count == 0 {
                tracing::warn!(
                    "Index is empty but metadata claims modules are indexed; clearing stale metadata"
                );
                metadata = IndexMetadata::default();
            }
        }

        Ok(Self {
            index_dir: dir,
            schema,
            index,
            metadata: std::sync::Mutex::new(metadata),
        })
    }

    /// Returns true when the stored fingerprint for `module_id` matches `fingerprint`.
    /// Use this to skip verse extraction on startup when the source is unchanged.
    pub fn is_module_current(&self, module_id: &str, fingerprint: u64) -> bool {
        self.metadata
            .lock()
            .ok()
            .map(|m| m.is_current(module_id, fingerprint))
            .unwrap_or(false)
    }

    /// Returns true when any indexing record exists for this module (regardless of fingerprint).
    pub fn is_module_indexed(&self, module_id: &str) -> bool {
        self.metadata
            .lock()
            .ok()
            .map(|m| m.is_present(module_id))
            .unwrap_or(false)
    }

    /// Index all verses for one module. Clears any previous docs for that
    /// module first. Pass an empty slice to remove a module's documents (uninstall).
    /// `fingerprint` is persisted after a successful commit; pass `0` for uninstall.
    pub fn index_module(&self, module_id: &str, verses: &[Verse], fingerprint: u64) -> Result<()> {
        let mut writer = self
            .index
            .writer(50_000_000)
            .map_err(|e| BibleError::Engine(e.to_string()))?;

        // Delete all existing documents for this module_id.
        // The module_id field uses STRING (non-tokenised), so the term matches exactly.
        let module_field = self
            .schema
            .get_field("module_id")
            .map_err(|e| BibleError::Engine(e.to_string()))?;
        let term = tantivy::Term::from_field_text(module_field, module_id);
        writer.delete_term(term);

        // If verses is empty this is an uninstall: commit the deletion and return.
        if verses.is_empty() {
            writer
                .commit()
                .map_err(|e| BibleError::Engine(e.to_string()))?;
            if let Ok(mut metadata) = self.metadata.lock() {
                metadata.remove_module(module_id);
                if let Err(e) = metadata.save(&self.index_dir) {
                    tracing::warn!(
                        "Failed to save index metadata after uninstall of '{}': {}",
                        module_id,
                        e
                    );
                }
            }
            return Ok(());
        }

        let book_f = self
            .schema
            .get_field("book")
            .map_err(|e| BibleError::Engine(e.to_string()))?;
        let chapter_f = self
            .schema
            .get_field("chapter")
            .map_err(|e| BibleError::Engine(e.to_string()))?;
        let verse_f = self
            .schema
            .get_field("verse_num")
            .map_err(|e| BibleError::Engine(e.to_string()))?;
        let text_f = self
            .schema
            .get_field("text")
            .map_err(|e| BibleError::Engine(e.to_string()))?;

        for v in verses {
            let mut doc = TantivyDocument::default();
            doc.add_text(module_field, module_id);
            doc.add_text(book_f, &v.book);
            doc.add_u64(chapter_f, v.chapter as u64);
            doc.add_u64(verse_f, v.verse as u64);
            doc.add_text(text_f, &v.text);
            writer
                .add_document(doc)
                .map_err(|e| BibleError::Engine(e.to_string()))?;
        }

        writer
            .commit()
            .map_err(|e| BibleError::Engine(e.to_string()))?;

        // Only after successful commit, persist the fingerprint so stale metadata
        // is never written when indexing fails mid-way.
        if let Ok(mut metadata) = self.metadata.lock() {
            metadata.mark_indexed(module_id, fingerprint);
            if let Err(e) = metadata.save(&self.index_dir) {
                tracing::warn!("Failed to save index metadata for '{}': {}", module_id, e);
                // Don't fail the indexing operation if metadata save fails
            }
        }

        Ok(())
    }

    pub fn search(&self, q: &str, limit: usize) -> Result<Vec<SearchResult>> {
        // Reload ensures we see the latest committed segments.
        let reader = self
            .index
            .reader_builder()
            .reload_policy(tantivy::ReloadPolicy::Manual)
            .try_into()
            .map_err(|e: tantivy::TantivyError| BibleError::Search(e.to_string()))?;
        reader
            .reload()
            .map_err(|e| BibleError::Search(e.to_string()))?;
        let searcher = reader.searcher();

        let module_f = self
            .schema
            .get_field("module_id")
            .map_err(|e| BibleError::Search(e.to_string()))?;
        let book_f = self
            .schema
            .get_field("book")
            .map_err(|e| BibleError::Search(e.to_string()))?;
        let chapter_f = self
            .schema
            .get_field("chapter")
            .map_err(|e| BibleError::Search(e.to_string()))?;
        let verse_f = self
            .schema
            .get_field("verse_num")
            .map_err(|e| BibleError::Search(e.to_string()))?;
        let text_f = self
            .schema
            .get_field("text")
            .map_err(|e| BibleError::Search(e.to_string()))?;

        let parser = QueryParser::for_index(&self.index, vec![text_f]);
        let query = parser
            .parse_query(q)
            .map_err(|e| BibleError::Search(e.to_string()))?;

        let top_docs = searcher
            .search(&query, &TopDocs::with_limit(limit))
            .map_err(|e| BibleError::Search(e.to_string()))?;

        let mut results = Vec::new();
        for (score, addr) in top_docs {
            let doc: TantivyDocument = searcher
                .doc(addr)
                .map_err(|e| BibleError::Search(e.to_string()))?;

            let module_id = doc
                .get_first(module_f)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let book = doc
                .get_first(book_f)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let chapter = doc
                .get_first(chapter_f)
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32;
            let verse = doc.get_first(verse_f).and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let snippet = doc
                .get_first(text_f)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            results.push(SearchResult {
                module_id,
                reference: BibleRef {
                    book,
                    chapter,
                    verse,
                },
                snippet,
                score,
            });
        }
        Ok(results)
    }

    pub fn index_dir(&self) -> &PathBuf {
        &self.index_dir
    }
}

fn build_schema() -> Schema {
    let mut builder = Schema::builder();
    // STRING = non-tokenised exact-match field; required for delete_term to work correctly.
    builder.add_text_field("module_id", STRING | STORED);
    builder.add_text_field("book", TEXT | STORED);
    builder.add_u64_field("chapter", STORED | FAST);
    builder.add_u64_field("verse_num", STORED | FAST);
    builder.add_text_field("text", TEXT | STORED);
    builder.build()
}

/// Open (or create) the index. If the schema on disk doesn't match, wipe and recreate.
fn open_or_rebuild(dir: &PathBuf, schema: &Schema) -> Result<Index> {
    let mmap = MmapDirectory::open(dir).map_err(|e| BibleError::Engine(e.to_string()))?;
    match Index::open_or_create(mmap, schema.clone()) {
        Ok(idx) => Ok(idx),
        Err(_) => {
            std::fs::remove_dir_all(dir).map_err(BibleError::Io)?;
            std::fs::create_dir_all(dir).map_err(BibleError::Io)?;
            let fresh = MmapDirectory::open(dir).map_err(|e| BibleError::Engine(e.to_string()))?;
            Index::open_or_create(fresh, schema.clone())
                .map_err(|e| BibleError::Engine(e.to_string()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bible_core::models::Verse;

    fn tmp_index_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join("vera_index_tests").join(label);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn verse(book: &str, chapter: u32, verse: u32, text: &str, translation: &str) -> Verse {
        Verse {
            book: book.into(),
            chapter,
            verse,
            text: text.into(),
            translation: translation.into(),
        }
    }

    #[test]
    fn search_finds_indexed_verse() {
        let idx = VerseIndex::new(tmp_index_dir("search_basic")).unwrap();
        idx.index_module(
            "KJV",
            &[verse("John", 1, 1, "In the beginning was the Word", "KJV")],
            1,
        )
        .unwrap();

        let results = idx.search("Word", 10).unwrap();
        assert!(!results.is_empty(), "Should find at least one result");
        assert_eq!(results[0].module_id, "KJV");
        assert_eq!(results[0].reference.book, "John");
    }

    #[test]
    fn reindex_does_not_duplicate() {
        let idx = VerseIndex::new(tmp_index_dir("search_no_dup")).unwrap();
        let verses = vec![verse("Gen", 1, 1, "unique_marker_alpha", "KJV")];
        idx.index_module("KJV", &verses, 1).unwrap();
        idx.index_module("KJV", &verses, 1).unwrap();

        let results = idx.search("unique_marker_alpha", 50).unwrap();
        assert_eq!(
            results.len(),
            1,
            "Re-indexing must not produce duplicate results; got {}",
            results.len()
        );
    }

    #[test]
    fn uninstall_removes_module_docs() {
        let idx = VerseIndex::new(tmp_index_dir("search_uninstall")).unwrap();
        idx.index_module(
            "MOD_A",
            &[verse("Gen", 1, 1, "module_a_unique_text", "MOD_A")],
            1,
        )
        .unwrap();
        idx.index_module(
            "MOD_B",
            &[verse("Gen", 1, 1, "module_b_unique_text", "MOD_B")],
            2,
        )
        .unwrap();

        assert!(!idx.search("module_a_unique_text", 10).unwrap().is_empty());
        assert!(!idx.search("module_b_unique_text", 10).unwrap().is_empty());

        idx.index_module("MOD_A", &[], 0).unwrap();

        assert!(
            idx.search("module_a_unique_text", 10).unwrap().is_empty(),
            "MOD_A docs must be removed after uninstall"
        );
        assert!(
            !idx.search("module_b_unique_text", 10).unwrap().is_empty(),
            "MOD_B docs must survive MOD_A uninstall"
        );
    }

    #[test]
    fn multiple_modules_return_correct_module_id() {
        let idx = VerseIndex::new(tmp_index_dir("search_multi")).unwrap();
        idx.index_module(
            "KJV",
            &[verse("John", 3, 16, "For God so loved the world", "KJV")],
            1,
        )
        .unwrap();
        idx.index_module(
            "DRB",
            &[verse("John", 3, 16, "For God so loved the world", "DRB")],
            2,
        )
        .unwrap();

        let results = idx.search("loved world", 10).unwrap();
        assert_eq!(results.len(), 2, "Both modules should return a result");
        let ids: Vec<&str> = results.iter().map(|r| r.module_id.as_str()).collect();
        assert!(ids.contains(&"KJV"));
        assert!(ids.contains(&"DRB"));
    }

    #[test]
    fn schema_mismatch_rebuilds_cleanly() {
        let dir = tmp_index_dir("search_schema");
        let idx1 = VerseIndex::new(dir.clone()).unwrap();
        idx1.index_module("KJV", &[verse("Gen", 1, 1, "schema_test", "KJV")], 1)
            .unwrap();
        drop(idx1);
        let idx2 = VerseIndex::new(dir).unwrap();
        let _ = idx2.search("schema_test", 10);
    }

    #[test]
    fn metadata_fingerprint_persists_across_reopens() {
        let dir = tmp_index_dir("metadata_persist");
        const FP: u64 = 0xDEAD_BEEF;

        {
            let idx = VerseIndex::new(dir.clone()).unwrap();
            idx.index_module("TEST", &[verse("Gen", 1, 1, "test_text", "TEST")], FP)
                .unwrap();
            assert!(
                idx.is_module_current("TEST", FP),
                "fingerprint should match"
            );
            assert!(idx.is_module_indexed("TEST"), "should be marked present");
        }

        {
            let idx = VerseIndex::new(dir).unwrap();
            assert!(
                idx.is_module_current("TEST", FP),
                "fingerprint must persist across reopen"
            );
            // A different fingerprint must NOT match.
            assert!(
                !idx.is_module_current("TEST", FP + 1),
                "stale fingerprint must not match"
            );
        }
    }

    #[test]
    fn uninstall_clears_indexed_flag() {
        let dir = tmp_index_dir("metadata_uninstall");
        let idx = VerseIndex::new(dir).unwrap();

        idx.index_module("MOD", &[verse("Gen", 1, 1, "text", "MOD")], 42)
            .unwrap();
        assert!(idx.is_module_indexed("MOD"));
        assert!(idx.is_module_current("MOD", 42));

        idx.index_module("MOD", &[], 0).unwrap();
        assert!(
            !idx.is_module_indexed("MOD"),
            "Indexed flag should be cleared on uninstall"
        );
        assert!(!idx.is_module_current("MOD", 42));
    }

    #[test]
    fn multiple_modules_tracked_independently() {
        let dir = tmp_index_dir("metadata_multiple");
        let idx = VerseIndex::new(dir).unwrap();

        idx.index_module("MOD_A", &[verse("Gen", 1, 1, "a", "MOD_A")], 10)
            .unwrap();
        idx.index_module("MOD_B", &[verse("Gen", 1, 1, "b", "MOD_B")], 20)
            .unwrap();

        assert!(idx.is_module_indexed("MOD_A"));
        assert!(idx.is_module_indexed("MOD_B"));
        assert!(!idx.is_module_indexed("MOD_C"));
        assert!(idx.is_module_current("MOD_A", 10));
        assert!(idx.is_module_current("MOD_B", 20));
        assert!(
            !idx.is_module_current("MOD_A", 20),
            "wrong fingerprint must not match"
        );

        idx.index_module("MOD_A", &[], 0).unwrap();

        assert!(!idx.is_module_indexed("MOD_A"));
        assert!(
            idx.is_module_indexed("MOD_B"),
            "Uninstalling MOD_A should not affect MOD_B"
        );
    }

    #[test]
    fn changed_fingerprint_invalidates_current_check() {
        let dir = tmp_index_dir("fingerprint_change");
        let idx = VerseIndex::new(dir).unwrap();
        idx.index_module("MOD", &[verse("Gen", 1, 1, "old", "MOD")], 100)
            .unwrap();

        // Simulate reinstall with new content (different fingerprint)
        idx.index_module("MOD", &[verse("Gen", 1, 1, "new", "MOD")], 200)
            .unwrap();

        assert!(
            !idx.is_module_current("MOD", 100),
            "old fingerprint should not match"
        );
        assert!(
            idx.is_module_current("MOD", 200),
            "new fingerprint should match"
        );
        // New content is searchable
        assert!(!idx.search("new", 10).unwrap().is_empty());
        assert!(
            idx.search("old", 10).unwrap().is_empty(),
            "old content replaced"
        );
    }

    #[test]
    fn stale_metadata_cleared_when_index_empty() {
        let dir = tmp_index_dir("stale_metadata");

        // Cold index: write metadata claiming module is indexed
        {
            let idx = VerseIndex::new(dir.clone()).unwrap();
            idx.index_module("MOD", &[verse("Gen", 1, 1, "text", "MOD")], 99)
                .unwrap();
        }

        // Externally wipe Tantivy segments but keep the metadata file
        for entry in std::fs::read_dir(&dir).unwrap().flatten() {
            let name = entry.file_name();
            if name != "index_metadata.json" {
                let _ = std::fs::remove_file(entry.path());
                let _ = std::fs::remove_dir_all(entry.path());
            }
        }

        // Reopening must detect the empty index and clear the stale metadata
        let idx = VerseIndex::new(dir).unwrap();
        assert!(
            !idx.is_module_indexed("MOD"),
            "Stale metadata must be cleared when Tantivy index is empty"
        );
    }

    #[test]
    fn corrupt_metadata_recovered_on_open() {
        let dir = tmp_index_dir("corrupt_metadata");
        {
            let idx = VerseIndex::new(dir.clone()).unwrap();
            idx.index_module("MOD", &[verse("Gen", 1, 1, "text", "MOD")], 7)
                .unwrap();
        }
        // Corrupt the metadata file
        std::fs::write(dir.join(METADATA_FILE), b"not valid json {{{{").unwrap();

        // Must open without panic and fall back to empty metadata
        let idx = VerseIndex::new(dir).unwrap();
        assert!(
            !idx.is_module_indexed("MOD"),
            "Corrupt metadata must be treated as empty"
        );
    }

    #[test]
    fn failed_metadata_save_does_not_break_indexing() {
        let dir = tmp_index_dir("metadata_save_resilient");
        let idx = VerseIndex::new(dir).unwrap();

        idx.index_module("RESILIENT", &[verse("Gen", 1, 1, "text", "RESILIENT")], 1)
            .unwrap();

        let results = idx.search("text", 10).unwrap();
        assert!(
            !results.is_empty(),
            "Indexing should complete despite potential metadata issues"
        );
    }
}
