//! Acceptance tests against real binary SWORD modules (not repackaged XML).
//!
//! Ignored by default because they need external module data:
//!   VERA_SWORD_REAL      dir with mods.d/ + modules/ holding CrossWire KJV and DRC
//!   VERA_SWORD_FIXTURES  dir holding the libsword-generated driver fixtures
//!                        (sword-modules tests/fixtures.tar.gz, extracted)
//! Run with `make test-native`.
#![cfg(feature = "native-sword")]

use std::path::PathBuf;

use bible_core::{error::BibleError, models::ModuleType, traits::BibleEngine};
use bible_engine::{composite::CompositeEngine, native::NativeSwordEngine};

fn engine(var: &str) -> NativeSwordEngine {
    let dir = std::env::var(var).unwrap_or_else(|_| panic!("{var} must point at a SWORD library; run `make test-native`"));
    NativeSwordEngine::new(PathBuf::from(dir))
}

#[test]
#[ignore = "needs VERA_SWORD_REAL"]
fn composite_routes_native_and_xml_modules_side_by_side() {
    let sword = std::env::var("VERA_SWORD_REAL").expect("VERA_SWORD_REAL");
    let xml = std::env::temp_dir().join("vera_composite_native").join("modules");
    let _ = std::fs::remove_dir_all(&xml);
    let m = xml.join("XMLMOD");
    std::fs::create_dir_all(&m).unwrap();
    std::fs::write(m.join("module.json"), r#"{"id":"XMLMOD","name":"Xml","type":"Bible","lang":"en"}"#).unwrap();
    std::fs::write(
        m.join("text.osis"),
        r#"<osis><osisText><div type="book" osisID="Gen"><chapter osisID="Gen.1"><verse osisID="Gen.1.1">xml genesis</verse></chapter></div></osisText></osis>"#,
    )
    .unwrap();

    let e = CompositeEngine::new(xml, PathBuf::from(sword));
    assert!(CompositeEngine::native_enabled());
    let ids: Vec<String> = e.list_modules().unwrap().into_iter().map(|m| m.id).collect();
    for want in ["KJV", "DRC", "XMLMOD"] {
        assert!(ids.iter().any(|i| i == want), "{want} missing from {ids:?}");
    }
    assert_eq!(e.get_chapter("XMLMOD", "Gen", 1).unwrap().verses[0].text, "xml genesis");
    assert!(e.get_chapter("KJV", "Gen", 1).unwrap().verses[0].text.starts_with("In the beginning God created the heaven"));
    assert!(matches!(e.get_chapter("XMLMOD", "John", 3), Err(BibleError::ModuleNotFound(_))));

    assert_eq!(e.verses_for_module("KJV").unwrap().unwrap().len(), 31102);
    assert_eq!(e.verses_for_module("XMLMOD").unwrap().unwrap().len(), 1);
    assert!(e.verses_for_module("NOPE").unwrap().is_none());
    let all = e.all_verses_by_module();
    assert!(["KJV", "DRC", "XMLMOD"].iter().all(|w| all.iter().any(|(id, _)| id == w)));
}

#[test]
#[ignore = "needs VERA_SWORD_REAL"]
fn real_modules_are_discovered() {
    let e = engine("VERA_SWORD_REAL");
    let mods = e.list_modules().unwrap();
    let ids: Vec<_> = mods.iter().map(|m| m.id.as_str()).collect();
    assert!(ids.contains(&"KJV") && ids.contains(&"DRC"), "found {ids:?}");
    assert!(mods.iter().all(|m| matches!(m.module_type, ModuleType::Bible)));
    assert!(mods.iter().find(|m| m.id == "KJV").unwrap().description.contains("King James"));
}

#[test]
#[ignore = "needs VERA_SWORD_REAL"]
fn real_kjv_reads_known_verses_without_markup() {
    let e = engine("VERA_SWORD_REAL");
    let gen1 = e.get_chapter("KJV", "Gen", 1).unwrap();
    assert_eq!(gen1.verses.len(), 31);
    assert_eq!(gen1.verses[0].text, "In the beginning God created the heaven and the earth.");
    let jn = e
        .get_verse("KJV", &bible_core::models::BibleRef { book: "John".into(), chapter: 3, verse: 16 })
        .unwrap();
    assert!(jn.text.starts_with("For God so loved the world"), "{}", jn.text);
    for v in &gen1.verses {
        assert!(!v.text.contains('<') && !v.text.contains("lemma"), "markup leaked: {}", v.text);
    }
}

#[test]
#[ignore = "needs VERA_SWORD_REAL"]
fn real_modules_do_not_leak_into_each_other() {
    let e = engine("VERA_SWORD_REAL");
    let kjv = e.get_chapter("KJV", "Gen", 1).unwrap().verses[0].text.clone();
    let drc = e.get_chapter("DRC", "Gen", 1).unwrap().verses[0].text.clone();
    assert_ne!(kjv, drc);
    assert!(drc.starts_with("In the beginning"), "{drc}");
}

#[test]
#[ignore = "needs VERA_SWORD_REAL"]
fn real_catholic_module_has_deuterocanon_and_protestant_does_not() {
    let e = engine("VERA_SWORD_REAL");
    let drc: Vec<String> = e.list_books("DRC").unwrap().into_iter().map(|b| b.id).collect();
    for book in ["Tob", "Jdt", "Wis", "Sir", "Bar", "1Macc", "2Macc"] {
        assert!(drc.iter().any(|b| b == book), "DRC missing {book}; has {drc:?}");
    }
    let kjv: Vec<String> = e.list_books("KJV").unwrap().into_iter().map(|b| b.id).collect();
    assert_eq!(kjv.len(), 66, "{kjv:?}");
    assert!(!kjv.iter().any(|b| b == "Tob"));

    let tobit = e.get_chapter("DRC", "Tob", 1).unwrap();
    assert!(!tobit.verses.is_empty());
    assert!(matches!(e.get_chapter("KJV", "Tob", 1), Err(BibleError::ModuleNotFound(_))));
}

#[test]
#[ignore = "needs VERA_SWORD_REAL"]
fn real_errors_are_typed_not_fallbacks() {
    let e = engine("VERA_SWORD_REAL");
    assert!(matches!(e.get_chapter("NOPE", "Gen", 1), Err(BibleError::ModuleNotFound(_))));
    assert!(matches!(e.get_chapter("KJV", "Gen", 99), Err(BibleError::ModuleNotFound(_))));
    assert!(matches!(e.get_chapter("KJV", "NotABook", 1), Err(BibleError::ModuleNotFound(_))));
    assert!(matches!(e.get_chapter("KJV", "Gen", 1000), Err(BibleError::ModuleNotFound(_))));
}

#[test]
#[ignore = "needs VERA_SWORD_REAL"]
fn real_all_verses_covers_whole_bible() {
    let e = engine("VERA_SWORD_REAL");
    let all = e.all_verses_by_module();
    let kjv = &all.iter().find(|(id, _)| id == "KJV").expect("KJV indexed").1;
    assert_eq!(kjv.len(), 31102, "KJV has 31,102 verses");
    assert!(kjv.iter().all(|v| !v.text.is_empty() && !v.text.contains('<')));
}

#[test]
#[ignore = "needs VERA_SWORD_FIXTURES"]
fn libsword_generated_drivers_agree_on_chapter_text() {
    let e = engine("VERA_SWORD_FIXTURES");
    let baseline = e.get_chapter("TRaw", "Gen", 1).unwrap();
    assert!(baseline.verses.len() > 10);
    // Every compression / block-type variant must decode to the same text.
    for id in ["TRaw4", "TZip4", "TZipBook", "TZipChap", "TZipVerse", "TBzip", "TXz", "TLzss"] {
        let ch = e.get_chapter(id, "Gen", 1).unwrap_or_else(|err| panic!("{id}: {err}"));
        let a: Vec<_> = ch.verses.iter().map(|v| (v.verse, v.text.clone())).collect();
        let b: Vec<_> = baseline.verses.iter().map(|v| (v.verse, v.text.clone())).collect();
        assert_eq!(a, b, "{id} differs from TRaw");
    }
}

#[test]
#[ignore = "needs VERA_SWORD_FIXTURES"]
fn libsword_fixtures_cover_commentary_dictionary_and_alt_versification() {
    let e = engine("VERA_SWORD_FIXTURES");
    let mods = e.list_modules().unwrap();
    let ty = |id: &str| mods.iter().find(|m| m.id == id).map(|m| format!("{:?}", m.module_type));
    assert_eq!(ty("TCom").as_deref(), Some("Commentary"));
    assert_eq!(ty("LRaw").as_deref(), Some("Lexicon"));
    assert_eq!(ty("GBook").as_deref(), Some("GenBook"));

    // Synodal versification differs from KJVA; books are still resolved per module.
    assert!(e.list_books("TNrsv").unwrap().iter().any(|b| b.id == "Gen"));
    // Lexicons are listed but not verse-readable.
    assert!(e.get_chapter("LRaw", "Gen", 1).is_err());
    // The fixture's conf carries its CipherKey, so the enciphered module decodes.
    let ciph = e.get_chapter("TCiphZ", "Gen", 1).unwrap();
    assert!(ciph.verses.iter().any(|v| v.text.ends_with("end.")), "cipher not decoded");
}
