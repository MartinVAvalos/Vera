use crate::error::BibleError;
use crate::models::{BibleBook, BibleRef, Chapter, Module, SearchResult, Verse};

type Result<T> = std::result::Result<T, BibleError>;

pub trait BibleEngine {
    fn get_verse(&self, module_id: &str, r: &BibleRef) -> Result<Verse>;
    fn get_chapter(&self, module_id: &str, book: &str, chapter: u32) -> Result<Chapter>;
    fn list_books(&self, module_id: &str) -> Result<Vec<BibleBook>>;
    fn list_modules(&self) -> Result<Vec<Module>>;
    fn install_module(&self, id: &str) -> Result<()>;
}

pub trait SearchEngine {
    fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchResult>>;
    fn index_module(&self, module_id: &str) -> Result<()>;
}
