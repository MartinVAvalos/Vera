use bible_core::{error::BibleError, models::Verse};
use quick_xml::{events::Event, Reader};

/// Parse Zefania XML format:
/// <XMLBIBLE><BIBLEBOOK bname="Genesis" bsname="Gen"><CHAPTER cnumber="1"><VERS vnumber="1">...</VERS>
pub fn parse_zefania(xml: &str, translation: &str) -> Result<Vec<Verse>, BibleError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut verses: Vec<Verse> = Vec::new();
    let mut buf = Vec::new();

    let mut current_book = String::new();
    let mut current_chapter: u32 = 0;
    let mut current_verse_num: u32 = 0;
    let mut in_vers = false;
    let mut verse_text = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Err(e) => return Err(BibleError::Parse(e.to_string())),
            Ok(Event::Eof) => break,

            Ok(Event::Start(ref e)) => match e.name().as_ref() {
                b"BIBLEBOOK" => {
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"bsname" {
                            current_book = String::from_utf8_lossy(&attr.value).into_owned();
                        }
                    }
                    if current_book.is_empty() {
                        for attr in e.attributes().flatten() {
                            if attr.key.as_ref() == b"bname" {
                                current_book = String::from_utf8_lossy(&attr.value).into_owned();
                            }
                        }
                    }
                    current_chapter = 0;
                }
                b"CHAPTER" => {
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"cnumber" {
                            if let Ok(n) = String::from_utf8_lossy(&attr.value).parse() {
                                current_chapter = n;
                            }
                        }
                    }
                }
                b"VERS" => {
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"vnumber" {
                            if let Ok(n) = String::from_utf8_lossy(&attr.value).parse() {
                                current_verse_num = n;
                            }
                        }
                    }
                    in_vers = true;
                    verse_text.clear();
                }
                _ => {}
            },

            Ok(Event::End(ref e)) if e.name().as_ref() == b"VERS" => {
                if in_vers {
                    let trimmed = verse_text.trim().to_string();
                    if !trimmed.is_empty() {
                        verses.push(Verse {
                            book: current_book.clone(),
                            chapter: current_chapter,
                            verse: current_verse_num,
                            text: trimmed,
                            translation: translation.to_string(),
                        });
                    }
                    in_vers = false;
                }
            }

            Ok(Event::Text(ref e)) if in_vers => {
                if let Ok(t) = e.unescape() {
                    verse_text.push_str(&t);
                }
            }

            Ok(_) => {}
        }
        buf.clear();
    }

    Ok(verses)
}
