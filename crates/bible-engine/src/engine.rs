use std::{collections::HashMap, path::PathBuf, sync::RwLock};

use bible_core::{
    error::BibleError,
    models::{BibleBook, BibleRef, Chapter, Module, ModuleType, Verse},
    traits::BibleEngine,
};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

type Result<T> = std::result::Result<T, BibleError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleMeta {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub module_type: String,
    pub lang: String,
    #[serde(default)]
    pub description: String,
}

impl ModuleMeta {
    fn as_module_type(&self) -> ModuleType {
        match self.module_type.to_lowercase().as_str() {
            "bible" => ModuleType::Bible,
            "commentary" => ModuleType::Commentary,
            "genbook" => ModuleType::GenBook,
            "lexicon" => ModuleType::Lexicon,
            "dailydevotion" | "dailydevoional" => ModuleType::DailyDevotional,
            _ => ModuleType::GenBook,
        }
    }
}

struct ModuleIndex {
    meta: ModuleMeta,
    book_order: Vec<String>,
    book_names: HashMap<String, String>,
    /// book → chapter → verse → text
    data: HashMap<String, HashMap<u32, HashMap<u32, String>>>,
}

impl ModuleIndex {
    fn chapter_count(&self, book: &str) -> u32 {
        self.data
            .get(book)
            .map(|chs| chs.keys().copied().max().unwrap_or(0))
            .unwrap_or(0)
    }

    fn verses(&self) -> Vec<Verse> {
        let mut verses = Vec::new();
        for book in &self.book_order {
            let Some(chs) = self.data.get(book) else {
                continue;
            };
            for (&ch, vs) in chs {
                for (&vn, text) in vs {
                    verses.push(Verse {
                        book: book.clone(),
                        chapter: ch,
                        verse: vn,
                        text: text.clone(),
                        translation: self.meta.name.clone(),
                    });
                }
            }
        }
        verses
    }
}

pub struct SwordEngine {
    data_dir: PathBuf,
    modules: RwLock<HashMap<String, ModuleIndex>>,
}

impl SwordEngine {
    pub fn new(data_dir: PathBuf) -> Self {
        let engine = Self {
            data_dir,
            modules: RwLock::new(HashMap::new()),
        };
        engine.load_all();
        engine
    }

    /// Reload from disk — clears the in-memory index first.
    pub fn reload(&self) {
        self.modules.write().unwrap().clear();
        self.load_all();
    }

    /// Return all loaded verses grouped by module_id, for search indexing.
    pub fn all_verses_by_module(&self) -> Vec<(String, Vec<Verse>)> {
        let m = self.modules.read().unwrap();
        m.iter()
            .map(|(id, idx)| (id.clone(), idx.verses()))
            .collect()
    }

    /// Verses of one loaded module, for search indexing.
    pub fn verses_for_module(&self, module_id: &str) -> Option<Vec<Verse>> {
        self.modules
            .read()
            .unwrap()
            .get(module_id)
            .map(ModuleIndex::verses)
    }

    fn load_all(&self) {
        if !self.data_dir.exists() {
            return;
        }
        let entries = match std::fs::read_dir(&self.data_dir) {
            Ok(e) => e,
            Err(e) => {
                warn!("Cannot read modules dir: {e}");
                return;
            }
        };

        let mut loaded = self.modules.write().unwrap();
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let meta_path = path.join("module.json");
            let osis_path = path.join("text.osis");
            let zef_path = path.join("text.xml");

            let meta: ModuleMeta = match std::fs::read_to_string(&meta_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
            {
                Some(m) => m,
                None => {
                    warn!("Missing/invalid module.json at {:?}", meta_path);
                    continue;
                }
            };

            let text_file = if osis_path.exists() {
                &osis_path
            } else if zef_path.exists() {
                &zef_path
            } else {
                continue;
            };

            let xml = match std::fs::read_to_string(text_file) {
                Ok(s) => s,
                Err(e) => {
                    warn!("Cannot read {:?}: {e}", text_file);
                    continue;
                }
            };

            let verses = if text_file == &osis_path {
                text_parser::osis::parse_osis(&xml, &meta.name)
            } else {
                text_parser::zefania::parse_zefania(&xml, &meta.name)
            };

            match verses {
                Err(e) => {
                    warn!("Parse error in module '{}': {e}", meta.id);
                }
                Ok(vs) => {
                    info!(
                        "Loaded module '{}' ({}) — {} verses",
                        meta.id,
                        meta.module_type,
                        vs.len()
                    );
                    loaded.insert(meta.id.clone(), build_index(meta, vs));
                }
            }
        }
    }

    fn with_module<T, F>(&self, module_id: &str, f: F) -> Result<T>
    where
        F: FnOnce(&ModuleIndex) -> Result<T>,
    {
        let m = self.modules.read().unwrap();
        match m.get(module_id) {
            Some(idx) => f(idx),
            None => Err(BibleError::ModuleNotFound(module_id.to_string())),
        }
    }
}

fn build_index(meta: ModuleMeta, verses: Vec<Verse>) -> ModuleIndex {
    let mut data: HashMap<String, HashMap<u32, HashMap<u32, String>>> = HashMap::new();
    let mut book_order: Vec<String> = Vec::new();
    let mut book_names: HashMap<String, String> = HashMap::new();

    for v in verses {
        data.entry(v.book.clone())
            .or_default()
            .entry(v.chapter)
            .or_default()
            .insert(v.verse, v.text);

        if !book_names.contains_key(&v.book) {
            book_order.push(v.book.clone());
            book_names.insert(v.book.clone(), canonical_name(&v.book));
        }
    }

    ModuleIndex {
        meta,
        book_order,
        book_names,
        data,
    }
}

fn canonical_name(id: &str) -> String {
    BOOK_NAMES
        .iter()
        .find(|(abbr, _)| abbr.eq_ignore_ascii_case(id))
        .map(|(_, name)| (*name).to_string())
        .unwrap_or_else(|| id.to_string())
}

impl BibleEngine for SwordEngine {
    fn get_verse(&self, module_id: &str, r: &BibleRef) -> Result<Verse> {
        self.with_module(module_id, |idx| {
            idx.data
                .get(&r.book)
                .and_then(|chs| chs.get(&r.chapter))
                .and_then(|vs| vs.get(&r.verse))
                .map(|text| Verse {
                    book: r.book.clone(),
                    chapter: r.chapter,
                    verse: r.verse,
                    text: text.clone(),
                    translation: idx.meta.name.clone(),
                })
                .ok_or_else(|| {
                    BibleError::ModuleNotFound(format!(
                        "{} {}:{} in '{}'",
                        r.book, r.chapter, r.verse, module_id
                    ))
                })
        })
    }

    fn get_chapter(&self, module_id: &str, book: &str, chapter: u32) -> Result<Chapter> {
        self.with_module(module_id, |idx| {
            let v_map = idx
                .data
                .get(book)
                .and_then(|chs| chs.get(&chapter))
                .ok_or_else(|| {
                    BibleError::ModuleNotFound(format!("{} {} in '{}'", book, chapter, module_id))
                })?;

            let mut verses: Vec<Verse> = v_map
                .iter()
                .map(|(&vn, text)| Verse {
                    book: book.to_string(),
                    chapter,
                    verse: vn,
                    text: text.clone(),
                    translation: idx.meta.name.clone(),
                })
                .collect();
            verses.sort_by_key(|v| v.verse);
            Ok(Chapter {
                book: book.to_string(),
                chapter,
                verses,
            })
        })
    }

    fn list_books(&self, module_id: &str) -> Result<Vec<BibleBook>> {
        self.with_module(module_id, |idx| {
            Ok(idx
                .book_order
                .iter()
                .map(|id| BibleBook {
                    id: id.clone(),
                    name: idx
                        .book_names
                        .get(id)
                        .cloned()
                        .unwrap_or_else(|| id.clone()),
                    chapters: idx.chapter_count(id),
                })
                .collect())
        })
    }

    fn list_modules(&self) -> Result<Vec<Module>> {
        let m = self.modules.read().unwrap();
        Ok(m.values()
            .map(|idx| Module {
                id: idx.meta.id.clone(),
                name: idx.meta.name.clone(),
                module_type: idx.meta.as_module_type(),
                lang: idx.meta.lang.clone(),
                description: idx.meta.description.clone(),
                installed: true,
            })
            .collect())
    }

    fn install_module(&self, id: &str) -> Result<()> {
        // After the module manager has extracted the files, reload from disk.
        let _ = id;
        self.reload();
        Ok(())
    }
}

static BOOK_NAMES: &[(&str, &str)] = &[
    ("Gen", "Genesis"),
    ("Exod", "Exodus"),
    ("Lev", "Leviticus"),
    ("Num", "Numbers"),
    ("Deut", "Deuteronomy"),
    ("Josh", "Joshua"),
    ("Judg", "Judges"),
    ("Ruth", "Ruth"),
    ("1Sam", "1 Samuel"),
    ("2Sam", "2 Samuel"),
    ("1Kgs", "1 Kings"),
    ("2Kgs", "2 Kings"),
    ("1Chr", "1 Chronicles"),
    ("2Chr", "2 Chronicles"),
    ("Ezra", "Ezra"),
    ("Neh", "Nehemiah"),
    ("Esth", "Esther"),
    ("Job", "Job"),
    ("Ps", "Psalms"),
    ("Prov", "Proverbs"),
    ("Eccl", "Ecclesiastes"),
    ("Song", "Song of Solomon"),
    ("Isa", "Isaiah"),
    ("Jer", "Jeremiah"),
    ("Lam", "Lamentations"),
    ("Ezek", "Ezekiel"),
    ("Dan", "Daniel"),
    ("Hos", "Hosea"),
    ("Joel", "Joel"),
    ("Amos", "Amos"),
    ("Obad", "Obadiah"),
    ("Jonah", "Jonah"),
    ("Mic", "Micah"),
    ("Nah", "Nahum"),
    ("Hab", "Habakkuk"),
    ("Zeph", "Zephaniah"),
    ("Hag", "Haggai"),
    ("Zech", "Zechariah"),
    ("Mal", "Malachi"),
    // Deuterocanon
    ("Tob", "Tobit"),
    ("Jdt", "Judith"),
    ("1Macc", "1 Maccabees"),
    ("2Macc", "2 Maccabees"),
    ("Wis", "Wisdom"),
    ("Sir", "Sirach"),
    ("Bar", "Baruch"),
    // NT
    ("Matt", "Matthew"),
    ("Mark", "Mark"),
    ("Luke", "Luke"),
    ("John", "John"),
    ("Acts", "Acts"),
    ("Rom", "Romans"),
    ("1Cor", "1 Corinthians"),
    ("2Cor", "2 Corinthians"),
    ("Gal", "Galatians"),
    ("Eph", "Ephesians"),
    ("Phil", "Philippians"),
    ("Col", "Colossians"),
    ("1Thess", "1 Thessalonians"),
    ("2Thess", "2 Thessalonians"),
    ("1Tim", "1 Timothy"),
    ("2Tim", "2 Timothy"),
    ("Titus", "Titus"),
    ("Phlm", "Philemon"),
    ("Heb", "Hebrews"),
    ("Jas", "James"),
    ("1Pet", "1 Peter"),
    ("2Pet", "2 Peter"),
    ("1John", "1 John"),
    ("2John", "2 John"),
    ("3John", "3 John"),
    ("Jude", "Jude"),
    ("Rev", "Revelation"),
];

#[cfg(test)]
mod tests {
    use super::*;
    use bible_core::traits::BibleEngine;
    use std::fs;

    // ── Fixtures ──────────────────────────────────────────────────────────────

    const MOD_A_OSIS: &str = r#"<osis>
  <osisText>
    <div type="book" osisID="Gen">
      <chapter osisID="Gen.1">
        <verse osisID="Gen.1.1">Module A verse one.</verse>
        <verse osisID="Gen.1.2">Module A verse two.</verse>
      </chapter>
      <chapter osisID="Gen.2">
        <verse osisID="Gen.2.1">Module A chapter two.</verse>
      </chapter>
    </div>
    <div type="book" osisID="John">
      <chapter osisID="John.1">
        <verse osisID="John.1.1">Module A John one one.</verse>
      </chapter>
    </div>
  </osisText>
</osis>"#;

    const MOD_B_OSIS: &str = r#"<osis>
  <osisText>
    <div type="book" osisID="Gen">
      <chapter osisID="Gen.1">
        <verse osisID="Gen.1.1">Module B verse one — different text.</verse>
        <verse osisID="Gen.1.2">Module B verse two — different text.</verse>
      </chapter>
    </div>
  </osisText>
</osis>"#;

    const META_A: &str = r#"{"id":"MOD_A","name":"Module A","type":"Bible","lang":"en"}"#;
    const META_B: &str = r#"{"id":"MOD_B","name":"Module B","type":"Bible","lang":"en"}"#;

    fn tmp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join("vera_engine_tests").join(label);
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_module(base: &std::path::Path, id: &str, meta: &str, osis: &str) {
        let d = base.join(id);
        fs::create_dir_all(&d).unwrap();
        fs::write(d.join("module.json"), meta).unwrap();
        fs::write(d.join("text.osis"), osis).unwrap();
    }

    fn engine_with_two_modules(label: &str) -> (SwordEngine, PathBuf) {
        let dir = tmp_dir(label);
        write_module(&dir, "MOD_A", META_A, MOD_A_OSIS);
        write_module(&dir, "MOD_B", META_B, MOD_B_OSIS);
        let engine = SwordEngine::new(dir.clone());
        (engine, dir)
    }

    // ── P0.2 isolation tests ──────────────────────────────────────────────────

    #[test]
    fn get_chapter_returns_correct_module_text() {
        let (engine, _dir) = engine_with_two_modules("iso_text");

        let ch_a = engine.get_chapter("MOD_A", "Gen", 1).expect("MOD_A Gen 1");
        let ch_b = engine.get_chapter("MOD_B", "Gen", 1).expect("MOD_B Gen 1");

        assert_eq!(
            ch_a.verses[0].text, "Module A verse one.",
            "MOD_A should return Module A's text"
        );
        assert_eq!(
            ch_b.verses[0].text, "Module B verse one — different text.",
            "MOD_B should return Module B's text"
        );
        // Cross-contamination check
        assert_ne!(
            ch_a.verses[0].text, ch_b.verses[0].text,
            "Modules must not share text"
        );
    }

    #[test]
    fn get_chapter_unknown_module_errors() {
        let (engine, _dir) = engine_with_two_modules("iso_unknown");

        let result = engine.get_chapter("NONEXISTENT", "Gen", 1);
        assert!(result.is_err(), "Unknown module must return an error");
        // Verify text from known modules did not leak
        let err_msg = result.unwrap_err().to_string();
        assert!(
            !err_msg.contains("Module A"),
            "Error must not expose MOD_A text"
        );
        assert!(
            !err_msg.contains("Module B"),
            "Error must not expose MOD_B text"
        );
    }

    #[test]
    fn get_chapter_missing_passage_errors() {
        let (engine, _dir) = engine_with_two_modules("iso_missing");

        // Book not in MOD_A
        let result = engine.get_chapter("MOD_A", "Rev", 1);
        assert!(result.is_err(), "Missing book must return error");
        // MOD_B has Gen but MOD_A should not fall back to it
        let result2 = engine.get_chapter("MOD_A", "Gen", 99);
        assert!(
            result2.is_err(),
            "Missing chapter must return error, not text from MOD_B"
        );
    }

    #[test]
    fn get_verse_isolated_to_module() {
        let (engine, _dir) = engine_with_two_modules("iso_verse");
        let r = bible_core::models::BibleRef {
            book: "Gen".into(),
            chapter: 1,
            verse: 1,
        };

        let va = engine.get_verse("MOD_A", &r).expect("MOD_A Gen 1:1");
        let vb = engine.get_verse("MOD_B", &r).expect("MOD_B Gen 1:1");
        assert_eq!(va.text, "Module A verse one.");
        assert_eq!(vb.text, "Module B verse one — different text.");
        assert_eq!(va.translation, "Module A");
        assert_eq!(vb.translation, "Module B");
    }

    #[test]
    fn list_books_scoped_to_module() {
        let (engine, _dir) = engine_with_two_modules("iso_books");

        let books_a = engine.list_books("MOD_A").expect("list_books MOD_A");
        let books_b = engine.list_books("MOD_B").expect("list_books MOD_B");

        // MOD_A has Gen + John
        assert_eq!(books_a.len(), 2);
        assert!(books_a.iter().any(|b| b.id == "Gen"));
        assert!(books_a.iter().any(|b| b.id == "John"));

        // MOD_B has only Gen
        assert_eq!(books_b.len(), 1);
        assert_eq!(books_b[0].id, "Gen");

        // MOD_A's John must not appear in MOD_B's list
        assert!(
            !books_b.iter().any(|b| b.id == "John"),
            "John from MOD_A must not appear in MOD_B's book list"
        );
    }

    #[test]
    fn list_books_unknown_module_errors() {
        let (engine, _dir) = engine_with_two_modules("iso_books_err");
        assert!(engine.list_books("NONEXISTENT").is_err());
    }

    #[test]
    fn reload_clears_removed_module() {
        let dir = tmp_dir("iso_reload");
        write_module(&dir, "MOD_A", META_A, MOD_A_OSIS);
        let engine = SwordEngine::new(dir.clone());

        // Confirm it loads correctly before removal
        assert!(engine.get_chapter("MOD_A", "Gen", 1).is_ok());

        // Remove the module directory and reload
        fs::remove_dir_all(dir.join("MOD_A")).unwrap();
        engine.reload();

        // Must now return an error
        let result = engine.get_chapter("MOD_A", "Gen", 1);
        assert!(
            result.is_err(),
            "Removed module must not be accessible after reload"
        );
    }

    #[test]
    fn chapter_verse_count_matches_fixture() {
        let (engine, _dir) = engine_with_two_modules("iso_count");
        let ch = engine.get_chapter("MOD_A", "Gen", 1).expect("Gen 1");
        assert_eq!(ch.verses.len(), 2, "Gen 1 fixture has exactly 2 verses");
        assert_eq!(ch.verses[0].verse, 1);
        assert_eq!(ch.verses[1].verse, 2);
    }
}
