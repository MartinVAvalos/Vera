use std::{
    fs,
    io::{Cursor, Read, Seek},
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use bible_core::{error::BibleError, models::Module};

type Result<T> = std::result::Result<T, BibleError>;

/// Largest archive accepted from a download.
pub const MAX_ARCHIVE_BYTES: u64 = 512 * 1024 * 1024;

/// Installs and removes modules in two layouts:
/// * XML modules: `{xml_dir}/{ID}/module.json` + `text.osis|text.xml`
/// * CrossWire SWORD modules: `{sword_dir}/mods.d/*.conf` + `{sword_dir}/modules/...`
///
/// The archive layout decides which one an install uses (`mods.d/` => SWORD).
pub struct ModuleManager {
    xml_dir: PathBuf,
    sword_dir: PathBuf,
}

/// Module IDs become file names and conf section names, so they are restricted.
pub fn validate_module_id(id: &str) -> Result<()> {
    let ok = !id.is_empty()
        && id.len() <= 64
        && id != "."
        && id != ".."
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'));
    if ok {
        Ok(())
    } else {
        Err(BibleError::Engine(format!("invalid module id '{id}'")))
    }
}

fn engine_err(e: impl std::fmt::Display) -> BibleError {
    BibleError::Engine(e.to_string())
}

/// `[Section]` names in a SWORD conf.
fn conf_sections(text: &str) -> Vec<String> {
    text.lines()
        .map(str::trim)
        .filter_map(|l| l.strip_prefix('[').and_then(|l| l.strip_suffix(']')))
        .map(str::to_string)
        .collect()
}

fn conf_value(text: &str, key: &str) -> Option<String> {
    text.lines().find_map(|l| {
        let (k, v) = l.split_once('=')?;
        k.trim()
            .eq_ignore_ascii_case(key)
            .then(|| v.trim().to_string())
    })
}

fn read_conf(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    // Confs are UTF-8 or Latin-1; only ASCII keys and paths matter here.
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

/// A conf `DataPath` relative to the SWORD root, rejected if it could escape it.
fn data_path_under(root: &Path, data_path: &str) -> Option<PathBuf> {
    let rel = Path::new(data_path.trim_start_matches("./"));
    let safe = rel.components().all(|c| matches!(c, Component::Normal(_)));
    (safe && rel.starts_with("modules")).then(|| root.join(rel))
}

fn data_present(root: &Path, data_path: &str) -> bool {
    let Some(p) = data_path_under(root, data_path) else {
        return false;
    };
    if p.exists() {
        return true;
    }
    // Lexicon-style DataPath names a file prefix, not a directory.
    match (p.parent(), p.file_name().and_then(|n| n.to_str())) {
        (Some(dir), Some(prefix)) => fs::read_dir(dir)
            .map(|rd| {
                rd.flatten()
                    .any(|e| e.file_name().to_string_lossy().starts_with(prefix))
            })
            .unwrap_or(false),
        _ => false,
    }
}

fn copy_tree(src: &Path, dst: &Path, created: &mut Vec<PathBuf>) -> std::io::Result<()> {
    if src.is_dir() {
        if !dst.exists() {
            fs::create_dir_all(dst)?;
            created.push(dst.to_path_buf());
        }
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            copy_tree(&entry.path(), &dst.join(entry.file_name()), created)?;
        }
    } else {
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)?;
        }
        let existed = dst.exists();
        fs::copy(src, dst)?;
        if !existed {
            created.push(dst.to_path_buf());
        }
    }
    Ok(())
}

struct Staging(PathBuf);

impl Drop for Staging {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

impl ModuleManager {
    pub fn new(xml_dir: PathBuf, sword_dir: PathBuf) -> Self {
        Self { xml_dir, sword_dir }
    }

    pub fn list_installed(&self) -> Result<Vec<Module>> {
        let manifest = self.xml_dir.join("modules.json");
        if !manifest.exists() {
            return Ok(Vec::new());
        }
        let raw = fs::read_to_string(&manifest)?;
        serde_json::from_str(&raw).map_err(|e| BibleError::Parse(e.to_string()))
    }

    /// Download a module archive and install it. Blocking.
    pub fn install(&self, id: &str, source_url: &str) -> Result<()> {
        validate_module_id(id)?;
        #[cfg(not(feature = "download"))]
        {
            let _ = source_url;
            Err(BibleError::Engine(
                "download feature not enabled".to_string(),
            ))
        }

        #[cfg(feature = "download")]
        {
            tracing::info!("Downloading module '{}' from {}", id, source_url);
            let client = reqwest::blocking::Client::builder()
                .timeout(std::time::Duration::from_secs(600))
                .build()
                .map_err(engine_err)?;
            let response = client
                .get(source_url)
                .send()
                .and_then(|r| r.error_for_status())
                .map_err(engine_err)?;
            if response
                .content_length()
                .is_some_and(|n| n > MAX_ARCHIVE_BYTES)
            {
                return Err(BibleError::Engine("archive exceeds the size limit".into()));
            }
            let mut bytes = Vec::new();
            response
                .take(MAX_ARCHIVE_BYTES + 1)
                .read_to_end(&mut bytes)
                .map_err(engine_err)?;
            self.install_from_bytes(id, bytes)
        }
    }

    /// Install a module from an in-memory zip. Nothing is left behind on failure.
    pub fn install_from_bytes(&self, id: &str, bytes: Vec<u8>) -> Result<()> {
        validate_module_id(id)?;
        if bytes.len() as u64 > MAX_ARCHIVE_BYTES {
            return Err(BibleError::Engine("archive exceeds the size limit".into()));
        }
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
            .map_err(|e| BibleError::Engine(format!("not a valid zip archive: {e}")))?;

        let is_sword = (0..archive.len()).any(|i| {
            archive
                .by_index(i)
                .map(|f| {
                    f.enclosed_name().is_some_and(|p| {
                        p.starts_with("mods.d")
                            && p.extension()
                                .is_some_and(|e| e.eq_ignore_ascii_case("conf"))
                    })
                })
                .unwrap_or(false)
        });

        let parent = self
            .sword_dir
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(std::env::temp_dir);
        fs::create_dir_all(&parent)?;
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let staging = Staging(parent.join(format!(".staging-{id}-{nanos}")));
        fs::create_dir_all(&staging.0)?;
        extract_checked(&mut archive, &staging.0)?;

        if is_sword {
            self.install_sword_staged(id, &staging.0)
        } else {
            self.install_xml_staged(id, &staging.0)
        }
    }

    fn install_xml_staged(&self, id: &str, staged: &Path) -> Result<()> {
        // Accept archives with files at the root or inside a single top-level folder.
        let root = if staged.join("module.json").exists() {
            staged.to_path_buf()
        } else {
            let mut dirs = fs::read_dir(staged)?
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.is_dir());
            match (dirs.next(), dirs.next()) {
                (Some(d), None) if d.join("module.json").exists() => d,
                _ => return Err(BibleError::Engine("archive has no module.json".into())),
            }
        };
        if !root.join("text.osis").exists() && !root.join("text.xml").exists() {
            return Err(BibleError::Engine(
                "archive has no text.osis or text.xml".into(),
            ));
        }

        let dest = self.xml_dir.join(id);
        let backup = self.xml_dir.join(format!(".replaced-{id}"));
        fs::create_dir_all(&self.xml_dir)?;
        let _ = fs::remove_dir_all(&backup);
        let had_previous = dest.exists();
        if had_previous {
            fs::rename(&dest, &backup)?;
        }
        let mut created = Vec::new();
        match copy_tree(&root, &dest, &mut created) {
            Ok(()) => {
                let _ = fs::remove_dir_all(&backup);
                Ok(())
            }
            Err(e) => {
                let _ = fs::remove_dir_all(&dest);
                if had_previous {
                    let _ = fs::rename(&backup, &dest);
                }
                Err(engine_err(e))
            }
        }
    }

    fn install_sword_staged(&self, id: &str, staged: &Path) -> Result<()> {
        let confs: Vec<PathBuf> = fs::read_dir(staged.join("mods.d"))
            .map_err(|_| BibleError::Engine("archive has no mods.d".into()))?
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.extension()
                    .is_some_and(|e| e.eq_ignore_ascii_case("conf"))
            })
            .collect();

        let mut found_id = false;
        for conf in &confs {
            let Some(text) = read_conf(conf) else {
                return Err(BibleError::Engine(format!(
                    "unreadable conf {:?}",
                    conf.file_name()
                )));
            };
            for section in conf_sections(&text) {
                if section.eq_ignore_ascii_case(id) {
                    found_id = true;
                }
            }
            let dp = conf_value(&text, "DataPath").ok_or_else(|| {
                BibleError::Engine(format!("{:?} has no DataPath", conf.file_name()))
            })?;
            if !data_present(staged, &dp) {
                return Err(BibleError::Engine(format!(
                    "module data missing from archive: {dp}"
                )));
            }
        }
        if !found_id {
            return Err(BibleError::Engine(format!(
                "archive does not contain module '{id}'"
            )));
        }

        // Replace any previous install of the same module, then copy in.
        let _ = self.remove_sword_module(id);
        let mut created = Vec::new();
        let result = (|| -> std::io::Result<()> {
            for top in ["mods.d", "modules"] {
                let src = staged.join(top);
                if src.exists() {
                    copy_tree(&src, &self.sword_dir.join(top), &mut created)?;
                }
            }
            Ok(())
        })();
        if let Err(e) = result {
            for path in created.iter().rev() {
                let _ = if path.is_dir() {
                    fs::remove_dir_all(path)
                } else {
                    fs::remove_file(path)
                };
            }
            return Err(engine_err(e));
        }
        tracing::info!("SWORD module '{}' installed to {:?}", id, self.sword_dir);
        Ok(())
    }

    pub fn uninstall(&self, id: &str) -> Result<()> {
        validate_module_id(id)?;
        let xml_dir = self.xml_dir.join(id);
        if xml_dir.is_dir() {
            fs::remove_dir_all(&xml_dir)?;
            tracing::info!("Module '{}' uninstalled", id);
            return Ok(());
        }
        if self.remove_sword_module(id)? {
            tracing::info!("SWORD module '{}' uninstalled", id);
            return Ok(());
        }
        Err(BibleError::ModuleNotFound(id.to_string()))
    }

    /// Remove a SWORD module's conf and data. Returns whether anything was found.
    fn remove_sword_module(&self, id: &str) -> Result<bool> {
        let Ok(rd) = fs::read_dir(self.sword_dir.join("mods.d")) else {
            return Ok(false);
        };
        for entry in rd.flatten() {
            let path = entry.path();
            if !path
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("conf"))
            {
                continue;
            }
            let Some(text) = read_conf(&path) else {
                continue;
            };
            let sections = conf_sections(&text);
            if !sections.iter().any(|s| s.eq_ignore_ascii_case(id)) {
                continue;
            }
            if let Some(dp) = conf_value(&text, "DataPath") {
                match data_path_under(&self.sword_dir, &dp) {
                    Some(target) if target.is_dir() => fs::remove_dir_all(&target)?,
                    Some(target) => {
                        if let (Some(dir), Some(prefix)) =
                            (target.parent(), target.file_name().and_then(|n| n.to_str()))
                        {
                            if let Ok(files) = fs::read_dir(dir) {
                                for f in files.flatten() {
                                    if f.file_name().to_string_lossy().starts_with(prefix) {
                                        fs::remove_file(f.path())?;
                                    }
                                }
                            }
                        }
                    }
                    None => {
                        return Err(BibleError::Engine(format!(
                            "refusing unsafe DataPath '{dp}'"
                        )))
                    }
                }
            }
            fs::remove_file(&path)?;
            return Ok(true);
        }
        Ok(false)
    }
}

/// Extract every entry, refusing any whose path escapes the destination.
fn extract_checked<R: Read + Seek>(archive: &mut zip::ZipArchive<R>, dest: &Path) -> Result<()> {
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(engine_err)?;
        let Some(rel) = file.enclosed_name() else {
            return Err(BibleError::Engine(format!(
                "unsafe path in archive: {}",
                file.name()
            )));
        };
        let out = dest.join(rel);
        if file.is_dir() {
            fs::create_dir_all(&out)?;
        } else {
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut f = fs::File::create(&out)?;
            std::io::copy(&mut file, &mut f).map_err(engine_err)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn tmp(label: &str) -> PathBuf {
        let d = std::env::temp_dir().join("vera_manager_tests").join(label);
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn zip_of(files: &[(&str, &str)]) -> Vec<u8> {
        let mut buf = Cursor::new(Vec::new());
        {
            let mut w = zip::ZipWriter::new(&mut buf);
            let opts = zip::write::SimpleFileOptions::default();
            for (name, body) in files {
                w.start_file(*name, opts).unwrap();
                w.write_all(body.as_bytes()).unwrap();
            }
            w.finish().unwrap();
        }
        buf.into_inner()
    }

    fn mgr(label: &str) -> (ModuleManager, PathBuf) {
        let base = tmp(label);
        (
            ModuleManager::new(base.join("modules"), base.join("sword")),
            base,
        )
    }

    const CONF: &str = "[Demo]\nDataPath=./modules/texts/rawtext/demo/\nModDrv=RawText\n";

    fn sword_zip() -> Vec<u8> {
        zip_of(&[
            ("mods.d/demo.conf", CONF),
            ("modules/texts/rawtext/demo/ot.vss", "x"),
        ])
    }

    #[test]
    fn rejects_unsafe_ids() {
        for bad in ["", "..", ".", "a/b", "../x", "a b", "a\\b", &"x".repeat(65)] {
            assert!(validate_module_id(bad).is_err(), "{bad:?}");
        }
        for good in ["KJV", "my-mod_1.2"] {
            assert!(validate_module_id(good).is_ok());
        }
    }

    #[test]
    fn sword_archive_installs_into_sword_dir_and_uninstalls() {
        let (m, base) = mgr("sword_ok");
        m.install_from_bytes("Demo", sword_zip()).unwrap();
        assert!(base.join("sword/mods.d/demo.conf").exists());
        assert!(base
            .join("sword/modules/texts/rawtext/demo/ot.vss")
            .exists());
        assert!(
            !base.join("modules/Demo").exists(),
            "must not land in the XML dir"
        );

        m.uninstall("Demo").unwrap();
        assert!(!base.join("sword/mods.d/demo.conf").exists());
        assert!(!base.join("sword/modules/texts/rawtext/demo").exists());
    }

    #[test]
    fn uninstalling_one_sword_module_keeps_the_other() {
        let (m, base) = mgr("sword_two");
        m.install_from_bytes("Demo", sword_zip()).unwrap();
        let other = zip_of(&[
            (
                "mods.d/other.conf",
                "[Other]\nDataPath=./modules/texts/rawtext/other/\nModDrv=RawText\n",
            ),
            ("modules/texts/rawtext/other/ot.vss", "y"),
        ]);
        m.install_from_bytes("Other", other).unwrap();
        m.uninstall("Demo").unwrap();
        assert!(base.join("sword/mods.d/other.conf").exists());
        assert!(base
            .join("sword/modules/texts/rawtext/other/ot.vss")
            .exists());
    }

    #[test]
    fn sword_archive_with_missing_data_installs_nothing() {
        let (m, base) = mgr("sword_missing_data");
        let bad = zip_of(&[("mods.d/demo.conf", CONF)]);
        assert!(m.install_from_bytes("Demo", bad).is_err());
        assert!(!base.join("sword/mods.d/demo.conf").exists());
    }

    #[test]
    fn archive_for_a_different_module_is_rejected() {
        let (m, base) = mgr("sword_wrong_id");
        assert!(m.install_from_bytes("Other", sword_zip()).is_err());
        assert!(
            !base.join("sword/mods.d").exists()
                || fs::read_dir(base.join("sword/mods.d"))
                    .unwrap()
                    .next()
                    .is_none()
        );
    }

    #[test]
    fn corrupt_zip_is_rejected_and_leaves_no_staging() {
        let (m, base) = mgr("corrupt");
        assert!(m.install_from_bytes("Demo", b"not a zip".to_vec()).is_err());
        let leftovers: Vec<_> = fs::read_dir(&base)
            .unwrap()
            .flatten()
            .map(|e| e.file_name())
            .collect();
        assert!(
            leftovers
                .iter()
                .all(|n| !n.to_string_lossy().starts_with(".staging")),
            "{leftovers:?}"
        );
    }

    #[test]
    fn zip_slip_entry_is_rejected() {
        let (m, base) = mgr("zip_slip");
        let evil = zip_of(&[
            ("../evil.txt", "x"),
            ("module.json", "{}"),
            ("text.osis", "<osis/>"),
        ]);
        assert!(m.install_from_bytes("Demo", evil).is_err());
        assert!(!base.join("evil.txt").exists());
        assert!(!base.parent().unwrap().join("evil.txt").exists());
    }

    #[test]
    fn xml_archive_installs_to_xml_dir_and_reinstall_replaces() {
        let (m, base) = mgr("xml");
        let z = |t: &str| zip_of(&[("module.json", r#"{"id":"X"}"#), ("text.osis", t)]);
        m.install_from_bytes("X", z("one")).unwrap();
        m.install_from_bytes("X", z("two")).unwrap();
        assert_eq!(
            fs::read_to_string(base.join("modules/X/text.osis")).unwrap(),
            "two"
        );
        m.uninstall("X").unwrap();
        assert!(!base.join("modules/X").exists());
    }

    #[test]
    fn xml_archive_without_text_is_rejected() {
        let (m, base) = mgr("xml_bad");
        assert!(m
            .install_from_bytes("X", zip_of(&[("module.json", "{}")]))
            .is_err());
        assert!(!base.join("modules/X").exists());
    }

    #[test]
    fn uninstall_unknown_module_errors() {
        let (m, _base) = mgr("unknown");
        assert!(matches!(
            m.uninstall("Nope"),
            Err(BibleError::ModuleNotFound(_))
        ));
        assert!(m.uninstall("../etc").is_err());
    }
}
