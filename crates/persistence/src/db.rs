use std::path::Path;

use bible_core::{
    error::BibleError,
    models::{BibleRef, Bookmark, Highlight, Note},
};
use rusqlite::{params, Connection};

type Result<T> = std::result::Result<T, BibleError>;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path).map_err(|e| BibleError::Database(e.to_string()))?;
        Ok(Self { conn })
    }

    pub fn init_schema(&self) -> Result<()> {
        self.conn
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS notes (
                    id          TEXT PRIMARY KEY,
                    book        TEXT NOT NULL,
                    chapter     INTEGER NOT NULL,
                    verse       INTEGER NOT NULL,
                    body        TEXT NOT NULL,
                    created_at  TEXT NOT NULL,
                    updated_at  TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS bookmarks (
                    id          TEXT PRIMARY KEY,
                    book        TEXT NOT NULL,
                    chapter     INTEGER NOT NULL,
                    verse       INTEGER NOT NULL,
                    label       TEXT NOT NULL,
                    created_at  TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS highlights (
                    id          TEXT PRIMARY KEY,
                    book        TEXT NOT NULL,
                    chapter     INTEGER NOT NULL,
                    verse       INTEGER NOT NULL,
                    color       TEXT NOT NULL,
                    created_at  TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS reading_history (
                    id          TEXT PRIMARY KEY,
                    book        TEXT NOT NULL,
                    chapter     INTEGER NOT NULL,
                    verse       INTEGER NOT NULL,
                    accessed_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS workspace_state (
                    key   TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                ",
            )
            .map_err(|e| BibleError::Database(e.to_string()))
    }

    pub fn save_note(&self, n: &Note) -> Result<()> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO notes (id, book, chapter, verse, body, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    n.id.to_string(),
                    n.reference.book,
                    n.reference.chapter,
                    n.reference.verse,
                    n.body,
                    n.created_at.to_rfc3339(),
                    n.updated_at.to_rfc3339(),
                ],
            )
            .map_err(|e| BibleError::Database(e.to_string()))?;
        Ok(())
    }

    pub fn get_notes(&self, reference: Option<&str>) -> Result<Vec<Note>> {
        let sql = if reference.is_some() {
            "SELECT id, book, chapter, verse, body, created_at, updated_at
             FROM notes WHERE book || ':' || chapter || ':' || verse = ?1"
        } else {
            "SELECT id, book, chapter, verse, body, created_at, updated_at FROM notes"
        };

        let mut stmt = self.conn.prepare(sql).map_err(|e| BibleError::Database(e.to_string()))?;

        let rows = if let Some(r) = reference {
            stmt.query_map([r], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, u32>(2)?,
                    row.get::<_, u32>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                ))
            })
            .map_err(|e| BibleError::Database(e.to_string()))?
            .collect::<Vec<_>>()
        } else {
            stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, u32>(2)?,
                    row.get::<_, u32>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                ))
            })
            .map_err(|e| BibleError::Database(e.to_string()))?
            .collect::<Vec<_>>()
        };

        let mut notes = Vec::new();
        for row in rows {
            let (id_str, book, chapter, verse, body, created_str, updated_str) =
                row.map_err(|e| BibleError::Database(e.to_string()))?;

            let id = id_str.clone();
            let created_at = chrono::DateTime::parse_from_rfc3339(&created_str)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());
            let updated_at = chrono::DateTime::parse_from_rfc3339(&updated_str)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            notes.push(Note {
                id,
                reference: BibleRef { book, chapter, verse },
                body,
                created_at,
                updated_at,
            });
        }
        Ok(notes)
    }

    pub fn delete_note(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM notes WHERE id = ?1", [id])
            .map_err(|e| BibleError::Database(e.to_string()))?;
        Ok(())
    }

    pub fn save_bookmark(&self, b: &Bookmark) -> Result<()> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO bookmarks (id, book, chapter, verse, label, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    b.id.to_string(),
                    b.reference.book,
                    b.reference.chapter,
                    b.reference.verse,
                    b.label,
                    b.created_at.to_rfc3339(),
                ],
            )
            .map_err(|e| BibleError::Database(e.to_string()))?;
        Ok(())
    }

    pub fn get_bookmarks(&self) -> Result<Vec<Bookmark>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, book, chapter, verse, label, created_at FROM bookmarks")
            .map_err(|e| BibleError::Database(e.to_string()))?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, u32>(2)?,
                    row.get::<_, u32>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(|e| BibleError::Database(e.to_string()))?
            .collect::<Vec<_>>();

        let mut bookmarks = Vec::new();
        for row in rows {
            let (id_str, book, chapter, verse, label, created_str) =
                row.map_err(|e| BibleError::Database(e.to_string()))?;

            let id = id_str.clone();
            let created_at = chrono::DateTime::parse_from_rfc3339(&created_str)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            bookmarks.push(Bookmark {
                id,
                reference: BibleRef { book, chapter, verse },
                label,
                created_at,
            });
        }
        Ok(bookmarks)
    }

    pub fn delete_bookmark(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM bookmarks WHERE id = ?1", [id])
            .map_err(|e| BibleError::Database(e.to_string()))?;
        Ok(())
    }

    pub fn get_highlights(&self) -> Result<Vec<Highlight>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, book, chapter, verse, color, created_at FROM highlights")
            .map_err(|e| BibleError::Database(e.to_string()))?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, u32>(2)?,
                    row.get::<_, u32>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(|e| BibleError::Database(e.to_string()))?
            .collect::<Vec<_>>();

        let mut highlights = Vec::new();
        for row in rows {
            let (id_str, book, chapter, verse, color, created_str) =
                row.map_err(|e| BibleError::Database(e.to_string()))?;
            let id = id_str.clone();
            let created_at = chrono::DateTime::parse_from_rfc3339(&created_str)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());
            highlights.push(Highlight {
                id,
                reference: BibleRef { book, chapter, verse },
                color,
                created_at,
            });
        }
        Ok(highlights)
    }

    pub fn save_highlight(&self, h: &Highlight) -> Result<()> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO highlights (id, book, chapter, verse, color, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    h.id.to_string(),
                    h.reference.book,
                    h.reference.chapter,
                    h.reference.verse,
                    h.color,
                    h.created_at.to_rfc3339(),
                ],
            )
            .map_err(|e| BibleError::Database(e.to_string()))?;
        Ok(())
    }

    pub fn delete_highlight(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM highlights WHERE id = ?1", [id])
            .map_err(|e| BibleError::Database(e.to_string()))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    const LEGACY_ID: &str = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

    fn db_path(label: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join("vera_persistence_tests");
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join(format!("{label}.db"));
        let _ = std::fs::remove_file(&p);
        p
    }

    fn open(path: &Path) -> Database {
        let db = Database::open(path).unwrap();
        db.init_schema().unwrap();
        db
    }

    fn r(book: &str, c: u32, v: u32) -> BibleRef {
        BibleRef { book: book.into(), chapter: c, verse: v }
    }

    #[test]
    fn notes_create_update_read_delete_and_survive_restart() {
        let path = db_path("notes");
        let id = "11111111-2222-4333-8444-555555555555".to_string();
        let mut note = Note {
            id: id.clone(),
            reference: r("John", 3, 16),
            body: "first".into(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        {
            let db = open(&path);
            db.save_note(&note).unwrap();
            note.body = "edited".into();
            db.save_note(&note).unwrap(); // same id => update, not a second row
            let all = db.get_notes(None).unwrap();
            assert_eq!(all.len(), 1);
            assert_eq!(all[0].id, id);
            assert_eq!(all[0].body, "edited");
        }
        // Reopen the file: data and ID persist.
        let db = open(&path);
        assert_eq!(db.get_notes(Some("John:3:16")).unwrap()[0].id, id);
        assert!(db.get_notes(Some("John:3:17")).unwrap().is_empty());
        db.delete_note(&id).unwrap();
        assert!(db.get_notes(None).unwrap().is_empty());
    }

    #[test]
    fn bookmarks_and_highlights_round_trip_and_delete() {
        let db = open(&db_path("bm_hl"));
        let bm = Bookmark { id: "bm-1".into(), reference: r("Gen", 1, 1), label: "start".into(), created_at: Utc::now() };
        let hl = Highlight { id: "hl-1".into(), reference: r("Ps", 23, 1), color: "yellow".into(), created_at: Utc::now() };
        db.save_bookmark(&bm).unwrap();
        db.save_highlight(&hl).unwrap();
        assert_eq!(db.get_bookmarks().unwrap()[0].id, "bm-1");
        assert_eq!(db.get_highlights().unwrap()[0].color, "yellow");
        db.delete_bookmark("bm-1").unwrap();
        db.delete_highlight("hl-1").unwrap();
        assert!(db.get_bookmarks().unwrap().is_empty());
        assert!(db.get_highlights().unwrap().is_empty());
    }

    #[test]
    fn legacy_uuid_text_rows_keep_their_ids_and_serialize_as_strings() {
        let db = open(&db_path("legacy"));
        let ts = Utc::now().to_rfc3339();
        // Rows exactly as the pre-migration (Uuid) build stored them: UUID text keys.
        db.conn
            .execute(
                "INSERT INTO notes (id, book, chapter, verse, body, created_at, updated_at) VALUES (?1,'Rom',8,28,'old',?2,?2)",
                params![LEGACY_ID, ts],
            )
            .unwrap();
        db.conn
            .execute(
                "INSERT INTO bookmarks (id, book, chapter, verse, label, created_at) VALUES (?1,'Rom',8,28,'old',?2)",
                params![LEGACY_ID, ts],
            )
            .unwrap();
        db.conn
            .execute(
                "INSERT INTO highlights (id, book, chapter, verse, color, created_at) VALUES (?1,'Rom',8,28,'red',?2)",
                params![LEGACY_ID, ts],
            )
            .unwrap();

        let n = &db.get_notes(None).unwrap()[0];
        let b = &db.get_bookmarks().unwrap()[0];
        let h = &db.get_highlights().unwrap()[0];
        assert_eq!((n.id.as_str(), b.id.as_str(), h.id.as_str()), (LEGACY_ID, LEGACY_ID, LEGACY_ID));
        // The IPC payload is a plain JSON string, as the Angular models expect.
        assert_eq!(serde_json::to_value(n).unwrap()["id"], LEGACY_ID);

        // Updating a legacy row reuses its ID rather than creating a duplicate.
        let mut edited = n.clone();
        edited.body = "new".into();
        db.save_note(&edited).unwrap();
        let all = db.get_notes(None).unwrap();
        assert_eq!((all.len(), all[0].id.as_str(), all[0].body.as_str()), (1, LEGACY_ID, "new"));
    }
}
