use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Verse {
    pub book: String,
    pub chapter: u32,
    pub verse: u32,
    pub text: String,
    pub translation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub book: String,
    pub chapter: u32,
    pub verses: Vec<Verse>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Book {
    pub name: String,
    pub abbreviation: String,
    pub chapters: Vec<Chapter>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BibleBook {
    pub id: String,
    pub name: String,
    pub chapters: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BibleRef {
    pub book: String,
    pub chapter: u32,
    pub verse: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ModuleType {
    Bible,
    Commentary,
    DailyDevotional,
    GenBook,
    Lexicon,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Module {
    pub id: String,
    pub name: String,
    pub module_type: ModuleType,
    pub lang: String,
    pub description: String,
    pub installed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub module_id: String,
    pub reference: BibleRef,
    pub snippet: String,
    pub score: f32,
}

// User-data IDs are UUID v4 strings generated at the command layer. They are
// stored as TEXT in SQLite, so `String` preserves existing rows unchanged.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub reference: BibleRef,
    pub body: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bookmark {
    pub id: String,
    pub reference: BibleRef,
    pub label: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Highlight {
    pub id: String,
    pub reference: BibleRef,
    pub color: String,
    pub created_at: DateTime<Utc>,
}

/// Controls which OSIS elements are included in rendered text.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterOptions {
    pub verse_numbers: bool,
    pub headings: bool,
    pub footnotes: bool,
    pub strongs: bool,
    pub red_letter: bool,
    pub cross_refs: bool,
}

impl Default for FilterOptions {
    fn default() -> Self {
        Self {
            verse_numbers: true,
            headings: true,
            footnotes: false,
            strongs: false,
            red_letter: true,
            cross_refs: false,
        }
    }
}

/// Controls visual presentation in the reader.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayOptions {
    /// Font size step: 1 = smallest … 5 = largest.
    pub font_size: u32,
    pub line_breaks: bool,
}

impl Default for DisplayOptions {
    fn default() -> Self {
        Self {
            font_size: 3,
            line_breaks: false,
        }
    }
}
