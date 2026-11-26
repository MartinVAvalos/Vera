//! The single engine the application talks to.
//!
//! Routes each call by module ID to either the native CrossWire SWORD reader
//! (when the `native-sword` feature is compiled in and the module exists in the
//! SWORD library) or the XML (OSIS/Zefania) loader. A module found natively
//! never falls back to the XML copy: if it fails to read, the error surfaces.

use std::path::PathBuf;

use bible_core::{
    error::BibleError,
    models::{BibleBook, BibleRef, Chapter, Module, Verse},
    traits::BibleEngine,
};

use crate::engine::SwordEngine;
#[cfg(feature = "native-sword")]
use crate::native::NativeSwordEngine;

type Result<T> = std::result::Result<T, BibleError>;

pub struct CompositeEngine {
    xml: SwordEngine,
    #[cfg(feature = "native-sword")]
    native: NativeSwordEngine,
}

impl CompositeEngine {
    /// `xml_dir` holds `{ID}/module.json` + `text.osis|text.xml`;
    /// `sword_dir` is a SWORD library (`mods.d/` + `modules/`).
    #[cfg_attr(not(feature = "native-sword"), allow(unused_variables))]
    pub fn new(xml_dir: PathBuf, sword_dir: PathBuf) -> Self {
        Self {
            xml: SwordEngine::new(xml_dir),
            #[cfg(feature = "native-sword")]
            native: NativeSwordEngine::new(sword_dir),
        }
    }

    /// Whether this build can read native SWORD modules.
    pub const fn native_enabled() -> bool {
        cfg!(feature = "native-sword")
    }

    /// Reload the XML index. Native modules are read on demand and need no reload.
    pub fn reload(&self) {
        self.xml.reload();
    }

    /// Every verse of every module, for search indexing. A native module hides an
    /// XML module with the same ID, matching the routing rule.
    pub fn all_verses_by_module(&self) -> Vec<(String, Vec<Verse>)> {
        #[cfg(feature = "native-sword")]
        {
            let mut all = self.native.all_verses_by_module();
            let native_ids: Vec<String> = all.iter().map(|(id, _)| id.clone()).collect();
            all.extend(
                self.xml
                    .all_verses_by_module()
                    .into_iter()
                    .filter(|(id, _)| !native_ids.contains(id)),
            );
            all
        }
        #[cfg(not(feature = "native-sword"))]
        {
            self.xml.all_verses_by_module()
        }
    }

    /// Verses of one module (native first, then XML), for search indexing.
    /// `Ok(None)` means the module is not installed in either engine.
    pub fn verses_for_module(&self, module_id: &str) -> Result<Option<Vec<Verse>>> {
        #[cfg(feature = "native-sword")]
        if self.is_native(module_id) {
            return self.native.verses_for_module(module_id).map(Some);
        }
        Ok(self.xml.verses_for_module(module_id))
    }

    #[cfg(feature = "native-sword")]
    fn is_native(&self, module_id: &str) -> bool {
        self.native.has_module(module_id)
    }
}

macro_rules! route {
    ($self:ident, $id:expr, $method:ident($($arg:expr),*)) => {{
        #[cfg(feature = "native-sword")]
        if $self.is_native($id) {
            return $self.native.$method($($arg),*);
        }
        $self.xml.$method($($arg),*)
    }};
}

impl BibleEngine for CompositeEngine {
    fn get_verse(&self, module_id: &str, r: &BibleRef) -> Result<Verse> {
        route!(self, module_id, get_verse(module_id, r))
    }

    fn get_chapter(&self, module_id: &str, book: &str, chapter: u32) -> Result<Chapter> {
        route!(self, module_id, get_chapter(module_id, book, chapter))
    }

    fn list_books(&self, module_id: &str) -> Result<Vec<BibleBook>> {
        route!(self, module_id, list_books(module_id))
    }

    fn list_modules(&self) -> Result<Vec<Module>> {
        #[cfg(feature = "native-sword")]
        {
            let mut mods = self.native.list_modules()?;
            let xml = self.xml.list_modules()?;
            let native_ids: Vec<String> = mods.iter().map(|m| m.id.clone()).collect();
            mods.extend(xml.into_iter().filter(|m| !native_ids.contains(&m.id)));
            Ok(mods)
        }
        #[cfg(not(feature = "native-sword"))]
        {
            self.xml.list_modules()
        }
    }

    fn install_module(&self, id: &str) -> Result<()> {
        self.xml.install_module(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn xml_only_library_routes_to_xml_engine() {
        let base = std::env::temp_dir()
            .join("vera_composite_tests")
            .join("xml_only");
        let _ = std::fs::remove_dir_all(&base);
        let xml = base.join("modules");
        let m = xml.join("X");
        std::fs::create_dir_all(&m).unwrap();
        std::fs::write(
            m.join("module.json"),
            r#"{"id":"X","name":"X","type":"Bible","lang":"en"}"#,
        )
        .unwrap();
        std::fs::write(
            m.join("text.osis"),
            r#"<osis><osisText><div type="book" osisID="Gen"><chapter osisID="Gen.1"><verse osisID="Gen.1.1">xml text</verse></chapter></div></osisText></osis>"#,
        )
        .unwrap();

        let e = CompositeEngine::new(xml, base.join("sword"));
        assert_eq!(
            e.get_chapter("X", "Gen", 1).unwrap().verses[0].text,
            "xml text"
        );
        assert_eq!(e.list_modules().unwrap().len(), 1);
        assert!(matches!(
            e.get_chapter("NOPE", "Gen", 1),
            Err(BibleError::ModuleNotFound(_))
        ));
    }
}
