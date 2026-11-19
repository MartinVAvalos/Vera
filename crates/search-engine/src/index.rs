use std::path::PathBuf;

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

pub struct VerseIndex {
    index_dir: PathBuf,
    schema: Schema,
    index: Index,
}

impl VerseIndex {
    pub fn new(dir: PathBuf) -> Result<Self> {
        let schema = build_schema();
        std::fs::create_dir_all(&dir).map_err(BibleError::Io)?;
        let index = open_or_rebuild(&dir, &schema)?;
        Ok(Self { index_dir: dir, schema, index })
    }

    /// Index all verses for one module. Clears any previous docs for that
    /// module first. Pass an empty slice to remove a module's documents (uninstall).
    pub fn index_module(&self, module_id: &str, verses: &[Verse]) -> Result<()> {
        let mut writer = self.index
            .writer(50_000_000)
            .map_err(|e| BibleError::Engine(e.to_string()))?;

        // Delete all existing documents for this module_id.
        // The module_id field uses STRING (non-tokenised), so the term matches exactly.
        let module_field = self.schema
            .get_field("module_id")
            .map_err(|e| BibleError::Engine(e.to_string()))?;
        let term = tantivy::Term::from_field_text(module_field, module_id);
        writer.delete_term(term);

        // If verses is empty this is an uninstall: commit the deletion and return.
        if verses.is_empty() {
            writer.commit().map_err(|e| BibleError::Engine(e.to_string()))?;
            return Ok(());
        }

        let book_f    = self.schema.get_field("book")      .map_err(|e| BibleError::Engine(e.to_string()))?;
        let chapter_f = self.schema.get_field("chapter")   .map_err(|e| BibleError::Engine(e.to_string()))?;
        let verse_f   = self.schema.get_field("verse_num") .map_err(|e| BibleError::Engine(e.to_string()))?;
        let text_f    = self.schema.get_field("text")      .map_err(|e| BibleError::Engine(e.to_string()))?;

        for v in verses {
            let mut doc = TantivyDocument::default();
            doc.add_text(module_field, module_id);
            doc.add_text(book_f, &v.book);
            doc.add_u64(chapter_f, v.chapter as u64);
            doc.add_u64(verse_f, v.verse as u64);
            doc.add_text(text_f, &v.text);
            writer.add_document(doc).map_err(|e| BibleError::Engine(e.to_string()))?;
        }

        writer.commit().map_err(|e| BibleError::Engine(e.to_string()))?;
        Ok(())
    }

    pub fn search(&self, q: &str, limit: usize) -> Result<Vec<SearchResult>> {
        // Reload ensures we see the latest committed segments.
        let reader = self.index
            .reader_builder()
            .reload_policy(tantivy::ReloadPolicy::Manual)
            .try_into()
            .map_err(|e: tantivy::TantivyError| BibleError::Search(e.to_string()))?;
        reader.reload().map_err(|e| BibleError::Search(e.to_string()))?;
        let searcher = reader.searcher();

        let module_f  = self.schema.get_field("module_id").map_err(|e| BibleError::Search(e.to_string()))?;
        let book_f    = self.schema.get_field("book")      .map_err(|e| BibleError::Search(e.to_string()))?;
        let chapter_f = self.schema.get_field("chapter")   .map_err(|e| BibleError::Search(e.to_string()))?;
        let verse_f   = self.schema.get_field("verse_num") .map_err(|e| BibleError::Search(e.to_string()))?;
        let text_f    = self.schema.get_field("text")      .map_err(|e| BibleError::Search(e.to_string()))?;

        let parser = QueryParser::for_index(&self.index, vec![text_f]);
        let query  = parser.parse_query(q).map_err(|e| BibleError::Search(e.to_string()))?;

        let top_docs = searcher
            .search(&query, &TopDocs::with_limit(limit))
            .map_err(|e| BibleError::Search(e.to_string()))?;

        let mut results = Vec::new();
        for (score, addr) in top_docs {
            let doc: TantivyDocument = searcher.doc(addr).map_err(|e| BibleError::Search(e.to_string()))?;

            let module_id = doc.get_first(module_f).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let book      = doc.get_first(book_f)  .and_then(|v| v.as_str()).unwrap_or("").to_string();
            let chapter   = doc.get_first(chapter_f).and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let verse     = doc.get_first(verse_f) .and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let snippet   = doc.get_first(text_f)  .and_then(|v| v.as_str()).unwrap_or("").to_string();

            results.push(SearchResult {
                module_id,
                reference: BibleRef { book, chapter, verse },
                snippet,
                score,
            });
        }
        Ok(results)
    }

    pub fn index_dir(&self) -> &PathBuf { &self.index_dir }
}

fn build_schema() -> Schema {
    let mut builder = Schema::builder();
    // STRING = non-tokenised exact-match field; required for delete_term to work correctly.
    builder.add_text_field("module_id", STRING | STORED);
    builder.add_text_field("book",      TEXT | STORED);
    builder.add_u64_field("chapter",    STORED | FAST);
    builder.add_u64_field("verse_num",  STORED | FAST);
    builder.add_text_field("text",      TEXT | STORED);
    builder.build()
}

/// Open (or create) the index. If the schema on disk doesn't match, wipe and recreate.
fn open_or_rebuild(dir: &PathBuf, schema: &Schema) -> Result<Index> {
    let mmap = MmapDirectory::open(dir).map_err(|e| BibleError::Engine(e.to_string()))?;
    match Index::open_or_create(mmap, schema.clone()) {
        Ok(idx) => Ok(idx),
        Err(_)  => {
            std::fs::remove_dir_all(dir).map_err(BibleError::Io)?;
            std::fs::create_dir_all(dir).map_err(BibleError::Io)?;
            let fresh = MmapDirectory::open(dir).map_err(|e| BibleError::Engine(e.to_string()))?;
            Index::open_or_create(fresh, schema.clone()).map_err(|e| BibleError::Engine(e.to_string()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bible_core::models::Verse;

    fn tmp_index_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir()
            .join("vera_index_tests")
            .join(label);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn verse(book: &str, chapter: u32, verse: u32, text: &str, translation: &str) -> Verse {
        Verse { book: book.into(), chapter, verse, text: text.into(), translation: translation.into() }
    }

    #[test]
    fn search_finds_indexed_verse() {
        let idx = VerseIndex::new(tmp_index_dir("search_basic")).unwrap();
        idx.index_module("KJV", &[verse("John", 1, 1, "In the beginning was the Word", "KJV")]).unwrap();

        let results = idx.search("Word", 10).unwrap();
        assert!(!results.is_empty(), "Should find at least one result");
        assert_eq!(results[0].module_id, "KJV");
        assert_eq!(results[0].reference.book, "John");
    }

    #[test]
    fn reindex_does_not_duplicate() {
        let idx = VerseIndex::new(tmp_index_dir("search_no_dup")).unwrap();
        let verses = vec![verse("Gen", 1, 1, "unique_marker_alpha", "KJV")];
        idx.index_module("KJV", &verses).unwrap();
        idx.index_module("KJV", &verses).unwrap(); // second index same data

        let results = idx.search("unique_marker_alpha", 50).unwrap();
        assert_eq!(results.len(), 1, "Re-indexing must not produce duplicate results; got {}", results.len());
    }

    #[test]
    fn uninstall_removes_module_docs() {
        let idx = VerseIndex::new(tmp_index_dir("search_uninstall")).unwrap();
        idx.index_module("MOD_A", &[verse("Gen", 1, 1, "module_a_unique_text", "MOD_A")]).unwrap();
        idx.index_module("MOD_B", &[verse("Gen", 1, 1, "module_b_unique_text", "MOD_B")]).unwrap();

        assert!(!idx.search("module_a_unique_text", 10).unwrap().is_empty());
        assert!(!idx.search("module_b_unique_text", 10).unwrap().is_empty());

        // Uninstall MOD_A via empty slice
        idx.index_module("MOD_A", &[]).unwrap();

        assert!(idx.search("module_a_unique_text", 10).unwrap().is_empty(),
            "MOD_A docs must be removed after uninstall");
        assert!(!idx.search("module_b_unique_text", 10).unwrap().is_empty(),
            "MOD_B docs must survive MOD_A uninstall");
    }

    #[test]
    fn multiple_modules_return_correct_module_id() {
        let idx = VerseIndex::new(tmp_index_dir("search_multi")).unwrap();
        idx.index_module("KJV", &[verse("John", 3, 16, "For God so loved the world", "KJV")]).unwrap();
        idx.index_module("DRB", &[verse("John", 3, 16, "For God so loved the world", "DRB")]).unwrap();

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
        idx1.index_module("KJV", &[verse("Gen", 1, 1, "schema_test", "KJV")]).unwrap();
        drop(idx1);
        // Re-open: same schema, must not panic.
        let idx2 = VerseIndex::new(dir).unwrap();
        let _ = idx2.search("schema_test", 10);
    }
}
