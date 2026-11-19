//! Native CrossWire SWORD module reader built on the [`sword-modules`] crate
//! (CC0-1.0, pure Rust: raw/z* text drivers, zip/bzip2/xz/LZSS compression,
//! the built-in versification systems including Vulg and Catholic).
//!
//! Layout read from `{sword_dir}`:
//! ```text
//! mods.d/*.conf      one conf per module
//! modules/...        driver data referenced by each conf's DataPath
//! ```
//!
//! The engine is stateless: the library is re-scanned on every call, so module
//! installs and removals are visible immediately without a reload.
//!
//! Limitations: entry markup is reduced to plain text (see
//! `text_parser::markup`), enciphered modules are not opened, and only
//! verse-keyed modules (Bibles, commentaries) are readable through
//! [`BibleEngine`]; lexicons and general books are listed but not retrievable.

use std::path::{Path, PathBuf};

use bible_core::{
    error::BibleError,
    models::{BibleBook, BibleRef, Chapter, Module as CoreModule, ModuleType, Verse},
    traits::BibleEngine,
};
use sword_modules::{Markup, ModuleConf, ModuleKind, SwordLibrary, VerseModule};
use text_parser::markup::{strip_markup, MarkupKind};

type Result<T> = std::result::Result<T, BibleError>;

pub struct NativeSwordEngine {
    sword_dir: PathBuf,
}

fn markup_kind(m: Markup) -> MarkupKind {
    match m {
        Markup::Osis => MarkupKind::Osis,
        Markup::Thml => MarkupKind::Thml,
        Markup::Gbf => MarkupKind::Gbf,
        Markup::Tei => MarkupKind::Tei,
        Markup::Plaintext => MarkupKind::Plaintext,
    }
}

fn engine_err(module_id: &str, e: sword_modules::Error) -> BibleError {
    match e {
        sword_modules::Error::ModuleNotFound(_) => BibleError::ModuleNotFound(module_id.to_string()),
        other => BibleError::Engine(format!("{module_id}: {other}")),
    }
}

fn module_type(conf: &ModuleConf) -> Option<ModuleType> {
    match conf.module_kind().ok()? {
        ModuleKind::Bible => Some(ModuleType::Bible),
        ModuleKind::Commentary => Some(ModuleType::Commentary),
        ModuleKind::Dictionary => Some(ModuleType::Lexicon),
        ModuleKind::GenBook => {
            let devotional = conf
                .category()
                .is_some_and(|c| c.to_ascii_lowercase().contains("devotional"));
            Some(if devotional { ModuleType::DailyDevotional } else { ModuleType::GenBook })
        }
        ModuleKind::Unknown => None,
    }
}

impl NativeSwordEngine {
    pub fn new(sword_dir: PathBuf) -> Self {
        Self { sword_dir }
    }

    pub fn sword_dir(&self) -> &Path {
        &self.sword_dir
    }

    /// A missing `mods.d` is an empty library, not an error.
    fn library(&self) -> SwordLibrary {
        SwordLibrary::open(&self.sword_dir).unwrap_or_default()
    }

    pub fn has_module(&self, module_id: &str) -> bool {
        self.library().conf(module_id).is_some()
    }

    fn open_verse_module(&self, module_id: &str) -> Result<VerseModule> {
        self.library()
            .open_module(module_id)
            .and_then(|m| m.into_verse())
            .map_err(|e| engine_err(module_id, e))
    }

    /// Every verse of every readable Bible module, for search indexing.
    /// A module that fails to open or decode is skipped with a warning.
    pub fn all_verses_by_module(&self) -> Vec<(String, Vec<Verse>)> {
        let lib = self.library();
        lib.modules_of_kind(ModuleKind::Bible)
            .filter_map(|conf| {
                let id = conf.name().to_string();
                match self.verses_for_module(&id) {
                    Ok(v) => Some((id, v)),
                    Err(e) => {
                        tracing::warn!("Skipping native module '{id}': {e}");
                        None
                    }
                }
            })
            .collect()
    }

    /// Every verse of one Bible module, with markup stripped.
    pub fn verses_for_module(&self, id: &str) -> Result<Vec<Verse>> {
        let vm = self.open_verse_module(id)?;
        let kind = markup_kind(vm.markup());
        let mut verses = Vec::new();
        for item in vm.iter() {
            let (key, entry) = item.map_err(|e| engine_err(id, e))?;
            if key.verse == 0 || key.chapter == 0 {
                continue;
            }
            let Some(book) = key.osis_book() else { continue };
            let text = strip_markup(&entry.raw, kind);
            if text.is_empty() {
                continue;
            }
            verses.push(Verse {
                book: book.to_string(),
                chapter: u32::from(key.chapter),
                verse: u32::from(key.verse),
                text,
                translation: id.to_string(),
            });
        }
        Ok(verses)
    }
}

impl BibleEngine for NativeSwordEngine {
    fn get_verse(&self, module_id: &str, r: &BibleRef) -> Result<Verse> {
        let ch = self.get_chapter(module_id, &r.book, r.chapter)?;
        ch.verses.into_iter().find(|v| v.verse == r.verse).ok_or_else(|| {
            BibleError::ModuleNotFound(format!("{} {}:{} in '{}'", r.book, r.chapter, r.verse, module_id))
        })
    }

    fn get_chapter(&self, module_id: &str, book: &str, chapter: u32) -> Result<Chapter> {
        let vm = self.open_verse_module(module_id)?;
        let missing = || BibleError::ModuleNotFound(format!("{book} {chapter} in '{module_id}'"));

        let def = vm.versification().book_by_osis(book).ok_or_else(missing)?;
        let chapter_no = u8::try_from(chapter).map_err(|_| missing())?;
        let entries = vm.chapter(def.id, chapter_no).map_err(|e| engine_err(module_id, e))?;

        let kind = markup_kind(vm.markup());
        let mut verses: Vec<Verse> = entries
            .into_iter()
            .filter(|(key, _)| key.verse != 0)
            .filter_map(|(key, entry)| {
                let text = strip_markup(&entry.raw, kind);
                (!text.is_empty()).then(|| Verse {
                    book: def.osis.to_string(),
                    chapter,
                    verse: u32::from(key.verse),
                    text,
                    translation: module_id.to_string(),
                })
            })
            .collect();

        if verses.is_empty() {
            return Err(missing());
        }
        verses.sort_by_key(|v| v.verse);
        Ok(Chapter { book: def.osis.to_string(), chapter, verses })
    }

    fn list_books(&self, module_id: &str) -> Result<Vec<BibleBook>> {
        let vm = self.open_verse_module(module_id)?;
        let v11n = vm.versification();
        let mut books = Vec::new();
        for (i, def) in v11n.books().iter().enumerate() {
            if !vm.has_testament(v11n.testament_of(i)) {
                continue;
            }
            if vm.has_book(def.id).map_err(|e| engine_err(module_id, e))? {
                books.push(BibleBook {
                    id: def.osis.to_string(),
                    name: def.name.to_string(),
                    chapters: u32::from(def.chapters),
                });
            }
        }
        Ok(books)
    }

    fn list_modules(&self) -> Result<Vec<CoreModule>> {
        let lib = self.library();
        Ok(lib
            .modules()
            .filter_map(|conf| {
                let module_type = module_type(conf)?;
                let description = conf.description().unwrap_or("").to_string();
                Some(CoreModule {
                    id: conf.name().to_string(),
                    name: if description.is_empty() { conf.name().to_string() } else { description.clone() },
                    module_type,
                    lang: conf.lang().unwrap_or("en").to_string(),
                    description,
                    installed: true,
                })
            })
            .collect())
    }

    fn install_module(&self, _id: &str) -> Result<()> {
        Err(BibleError::Engine(
            "SWORD modules are installed through the module manager, not the engine.".into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join("vera_native_tests").join(label);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("mods.d")).unwrap();
        std::fs::create_dir_all(dir.join("modules")).unwrap();
        dir
    }

    #[test]
    fn empty_library_lists_no_modules() {
        let engine = NativeSwordEngine::new(empty_dir("empty_lib"));
        assert!(engine.list_modules().unwrap().is_empty());
    }

    #[test]
    fn missing_sword_dir_is_an_empty_library() {
        let engine = NativeSwordEngine::new(std::env::temp_dir().join("vera_native_tests/does_not_exist"));
        assert!(engine.list_modules().unwrap().is_empty());
        assert!(!engine.has_module("KJV"));
    }

    #[test]
    fn unknown_module_is_module_not_found() {
        let engine = NativeSwordEngine::new(empty_dir("missing_mod"));
        assert!(matches!(engine.list_books("NOPE"), Err(BibleError::ModuleNotFound(_))));
        assert!(matches!(engine.get_chapter("NOPE", "Gen", 1), Err(BibleError::ModuleNotFound(_))));
    }
}
