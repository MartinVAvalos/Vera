//! Reduces a single SWORD entry (an OSIS/ThML/GBF/TEI fragment) to display text.
//!
//! SWORD entries are markup fragments, not documents, so they are handled with
//! a small tag scanner rather than an XML parser (GBF is not XML at all).

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MarkupKind {
    Osis,
    Thml,
    Gbf,
    Tei,
    Plaintext,
}

/// Elements whose entire content is dropped (footnotes and headings).
const DROP_ELEMENTS: &[&str] = &["note", "title", "head"];

/// Strip markup from one entry, returning whitespace-normalised plain text.
pub fn strip_markup(raw: &str, kind: MarkupKind) -> String {
    if kind == MarkupKind::Plaintext {
        return collapse_ws(&decode_entities(raw));
    }

    let mut out = String::with_capacity(raw.len());
    let mut chars = raw.char_indices().peekable();
    // Name of the element being dropped and its current nesting depth.
    let mut dropping: Option<(String, u32)> = None;

    while let Some((i, c)) = chars.next() {
        if c != '<' {
            if dropping.is_none() {
                out.push(c);
            }
            continue;
        }
        let Some(end) = raw[i..].find('>') else {
            // Unterminated tag: treat the remainder as literal text.
            if dropping.is_none() {
                out.push_str(&raw[i..]);
            }
            break;
        };
        let tag = &raw[i + 1..i + end];
        while chars.peek().is_some_and(|(j, _)| *j <= i + end) {
            chars.next();
        }

        let closing = tag.starts_with('/');
        let self_closing = tag.ends_with('/');
        let name = tag_name(tag);

        if let Some((drop_name, depth)) = dropping.as_mut() {
            if name == *drop_name && !self_closing {
                if closing {
                    *depth -= 1;
                    if *depth == 0 {
                        dropping = None;
                    }
                } else {
                    *depth += 1;
                }
            }
            continue;
        }

        if kind == MarkupKind::Gbf {
            // <RF> opens a footnote that <Rf> closes; names are case-sensitive in GBF.
            if tag == "RF" || tag == "RX" {
                let close = if tag == "RF" { "<Rf>" } else { "<Rx>" };
                if let Some(pos) = raw[i + end..].find(close) {
                    let skip_to = i + end + pos + close.len();
                    while chars.peek().is_some_and(|(j, _)| *j < skip_to) {
                        chars.next();
                    }
                }
                continue;
            }
            if matches!(tag, "CM" | "CL" | "TS" | "Ts") {
                out.push(' ');
            }
            continue;
        }

        if !closing && !self_closing && DROP_ELEMENTS.contains(&name.as_str()) {
            dropping = Some((name, 1));
            continue;
        }

        if is_block(&name) {
            out.push(' ');
        }
    }

    collapse_ws(&decode_entities(&out))
}

fn tag_name(tag: &str) -> String {
    tag.trim_start_matches('/')
        .split(|c: char| c.is_whitespace() || c == '/')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn is_block(name: &str) -> bool {
    matches!(name, "p" | "lb" | "l" | "br" | "div" | "lg" | "milestone" | "item" | "list")
}

fn collapse_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn decode_entities(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(pos) = rest.find('&') {
        out.push_str(&rest[..pos]);
        rest = &rest[pos..];
        match rest.find(';').filter(|&e| e <= 10) {
            Some(e) => {
                let ent = &rest[1..e];
                let decoded = match ent {
                    "amp" => Some('&'),
                    "lt" => Some('<'),
                    "gt" => Some('>'),
                    "quot" => Some('"'),
                    "apos" => Some('\''),
                    _ => ent
                        .strip_prefix("#x")
                        .and_then(|h| u32::from_str_radix(h, 16).ok())
                        .or_else(|| ent.strip_prefix('#').and_then(|d| d.parse().ok()))
                        .and_then(char::from_u32),
                };
                match decoded {
                    Some(c) => {
                        out.push(c);
                        rest = &rest[e + 1..];
                    }
                    None => {
                        out.push('&');
                        rest = &rest[1..];
                    }
                }
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn osis_strongs_words_keep_text() {
        let raw = r#"<w lemma="strong:H07225" morph="x">In the beginning</w> <w lemma="strong:H0430">God</w> created"#;
        assert_eq!(strip_markup(raw, MarkupKind::Osis), "In the beginning God created");
    }

    #[test]
    fn osis_notes_and_titles_dropped_including_nested_markup() {
        let raw = r#"<title>Psalm</title>Blessed<note type="x">a <hi>footnote</hi></note> is the man"#;
        assert_eq!(strip_markup(raw, MarkupKind::Osis), "Blessed is the man");
    }

    #[test]
    fn osis_inline_tags_do_not_join_or_split_words() {
        let raw = r#"the <transChange type="added">LORD</transChange>'s <divineName>Lord</divineName>"#;
        assert_eq!(strip_markup(raw, MarkupKind::Osis), "the LORD's Lord");
    }

    #[test]
    fn osis_line_breaks_become_spaces() {
        let raw = r#"line one<lb/>line two<p/>three"#;
        assert_eq!(strip_markup(raw, MarkupKind::Osis), "line one line two three");
    }

    #[test]
    fn entities_decode() {
        assert_eq!(strip_markup("a &amp; b &lt;c&gt; &#8212; &#x2014;", MarkupKind::Osis), "a & b <c> — —");
        assert_eq!(strip_markup("fish & chips", MarkupKind::Osis), "fish & chips");
    }

    #[test]
    fn gbf_footnotes_and_strongs_dropped() {
        let raw = "In the beginning<WH07225> God<RF>a note<Rf> created<CM>";
        assert_eq!(strip_markup(raw, MarkupKind::Gbf), "In the beginning God created");
    }

    #[test]
    fn plaintext_is_unchanged_apart_from_whitespace() {
        assert_eq!(strip_markup("a  <b>\n c", MarkupKind::Plaintext), "a <b> c");
    }

    #[test]
    fn unterminated_tag_is_kept_literal() {
        assert_eq!(strip_markup("1 < 2", MarkupKind::Osis), "1 < 2");
    }
}
