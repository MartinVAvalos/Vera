use thiserror::Error;

#[derive(Debug, Error)]
pub enum BibleError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Engine error: {0}")]
    Engine(String),

    #[error("Search error: {0}")]
    Search(String),

    #[error("Module not found: {0}")]
    ModuleNotFound(String),

    #[error("Parse error: {0}")]
    Parse(String),
}
