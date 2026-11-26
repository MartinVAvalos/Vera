use bible_core::{error::BibleError, models::Verse};
use quick_xml::{events::Event, Reader};

pub fn parse_osis(xml: &str, translation: &str) -> Result<Vec<Verse>, BibleError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut verses: Vec<Verse> = Vec::new();
    let mut buf = Vec::new();

    let mut current_book = String::new();
    let mut current_chapter: u32 = 0;
    let mut current_verse_num: u32 = 0;

    // milestone verse tracking
    let mut in_verse = false;
    let mut verse_text = String::new();

    // skip-depth: depth of elements whose content we discard (note, rdg)
    let mut skip_depth: usize = 0;

    loop {
        match reader.read_event_into(&mut buf) {
            Err(e) => return Err(BibleError::Parse(e.to_string())),
            Ok(Event::Eof) => break,

            Ok(Event::Start(ref e)) => {
                if skip_depth > 0 {
                    skip_depth += 1;
                    buf.clear();
                    continue;
                }

                match e.name().as_ref() {
                    // skip note and alternate reading content
                    b"note" | b"rdg" => {
                        skip_depth = 1;
                    }

                    b"div" => {
                        // <div type="book" osisID="Gen">
                        let mut is_book = false;
                        let mut osis_id = String::new();
                        for attr in e.attributes().flatten() {
                            match attr.key.as_ref() {
                                b"type" if attr.value.as_ref() == b"book" => is_book = true,
                                b"osisID" => {
                                    osis_id = String::from_utf8_lossy(&attr.value).into_owned()
                                }
                                _ => {}
                            }
                        }
                        if is_book && !osis_id.is_empty() {
                            current_book = osis_id;
                            current_chapter = 0;
                        }
                    }

                    b"chapter" => {
                        // <chapter osisID="Gen.1"> or <chapter n="1">
                        for attr in e.attributes().flatten() {
                            match attr.key.as_ref() {
                                b"osisID" => {
                                    let s = String::from_utf8_lossy(&attr.value);
                                    // "Gen.1" → 1
                                    if let Some(ch) =
                                        s.split('.').nth(1).and_then(|n| n.parse().ok())
                                    {
                                        current_chapter = ch;
                                    }
                                }
                                b"n" => {
                                    if let Ok(n) =
                                        String::from_utf8_lossy(&attr.value).parse::<u32>()
                                    {
                                        current_chapter = n;
                                    }
                                }
                                _ => {}
                            }
                        }
                    }

                    b"verse" => {
                        // Check for start-milestone: sID attribute signals start of verse span
                        let mut sid = false;
                        let mut osis_id = String::new();
                        let mut n_val: u32 = 0;
                        for attr in e.attributes().flatten() {
                            match attr.key.as_ref() {
                                b"sID" => sid = true,
                                b"osisID" => {
                                    osis_id = String::from_utf8_lossy(&attr.value).into_owned()
                                }
                                b"n" => {
                                    n_val =
                                        String::from_utf8_lossy(&attr.value).parse().unwrap_or(0)
                                }
                                _ => {}
                            }
                        }

                        if !osis_id.is_empty() {
                            parse_osis_id(
                                &osis_id,
                                &mut current_book,
                                &mut current_chapter,
                                &mut current_verse_num,
                            );
                        } else if n_val > 0 {
                            current_verse_num = n_val;
                        }

                        if !sid {
                            // non-milestone: treat as container
                            in_verse = true;
                            verse_text.clear();
                        } else {
                            // milestone start
                            in_verse = true;
                            verse_text.clear();
                        }
                    }

                    // content tags whose inner text we keep
                    _ => {}
                }
            }

            Ok(Event::Empty(ref e)) => {
                if skip_depth > 0 {
                    buf.clear();
                    continue;
                }
                if e.name().as_ref() == b"verse" {
                    // could be eID (end milestone) or sID (start milestone)
                    let mut is_eid = false;
                    let mut is_sid = false;
                    let mut osis_id = String::new();
                    for attr in e.attributes().flatten() {
                        match attr.key.as_ref() {
                            b"eID" => is_eid = true,
                            b"sID" => is_sid = true,
                            b"osisID" => {
                                osis_id = String::from_utf8_lossy(&attr.value).into_owned()
                            }
                            _ => {}
                        }
                    }

                    if is_eid && in_verse {
                        // close the current verse span
                        push_verse(
                            &mut verses,
                            &current_book,
                            current_chapter,
                            current_verse_num,
                            &verse_text,
                            translation,
                        );
                        in_verse = false;
                        verse_text.clear();
                    } else if is_sid {
                        // start new verse span
                        if in_verse {
                            push_verse(
                                &mut verses,
                                &current_book,
                                current_chapter,
                                current_verse_num,
                                &verse_text,
                                translation,
                            );
                            verse_text.clear();
                        }
                        if !osis_id.is_empty() {
                            parse_osis_id(
                                &osis_id,
                                &mut current_book,
                                &mut current_chapter,
                                &mut current_verse_num,
                            );
                        }
                        in_verse = true;
                        verse_text.clear();
                    }
                }
            }

            Ok(Event::End(ref e)) => {
                if skip_depth > 0 {
                    skip_depth -= 1;
                    buf.clear();
                    continue;
                }
                if e.name().as_ref() == b"verse" && in_verse {
                    push_verse(
                        &mut verses,
                        &current_book,
                        current_chapter,
                        current_verse_num,
                        &verse_text,
                        translation,
                    );
                    in_verse = false;
                    verse_text.clear();
                }
            }

            Ok(Event::Text(ref e)) if skip_depth == 0 && in_verse => {
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

fn parse_osis_id(id: &str, book: &mut String, chapter: &mut u32, verse: &mut u32) {
    // format: "Gen.1.1" or "Gen.1" (chapter only)
    let parts: Vec<&str> = id.split('.').collect();
    if !parts.is_empty() && !parts[0].is_empty() {
        *book = parts[0].to_string();
    }
    if parts.len() >= 2 {
        if let Ok(c) = parts[1].parse() {
            *chapter = c;
        }
    }
    if parts.len() >= 3 {
        // Handle "Gen.1.1-Gen.1.3" ranges — take first verse
        let v_part = parts[2].split('-').next().unwrap_or(parts[2]);
        if let Ok(v) = v_part.parse() {
            *verse = v;
        }
    }
}

fn push_verse(
    verses: &mut Vec<Verse>,
    book: &str,
    chapter: u32,
    verse_num: u32,
    text: &str,
    translation: &str,
) {
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() || book.is_empty() || chapter == 0 || verse_num == 0 {
        return;
    }
    verses.push(Verse {
        book: book.to_string(),
        chapter,
        verse: verse_num,
        text: trimmed,
        translation: translation.to_string(),
    });
}
