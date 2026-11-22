//! Embed the reviewed Desktop packages and only the skills each declares.

use serde::Deserialize;
use std::collections::BTreeSet;
use std::fmt::Write;
use std::fs;
use std::path::PathBuf;

#[derive(Deserialize)]
struct Manifest {
    id: String,
    description: String,
    skills: Vec<String>,
}

fn main() {
    let mut catalog = String::from("&[\n");
    for package in ["browser", "desktop-fx"] {
        let root = format!("../../extensions/{package}");
        let manifest = format!("{root}/extension.json");
        println!("cargo::rerun-if-changed={manifest}");
        let bytes = fs::read(&manifest).unwrap_or_else(|error| panic!("{manifest}: {error}"));
        let Manifest {
            id,
            description,
            skills,
        } = serde_json::from_slice(&bytes).unwrap_or_else(|error| panic!("{manifest}: {error}"));
        assert_eq!(id, package, "extension ID must match its package directory");
        assert!(
            !description.trim().is_empty()
                && description.len() <= 160
                && !description
                    .chars()
                    .any(|c| c.is_control() || matches!(c, '\u{2028}' | '\u{2029}')),
            "{id}: invalid summary"
        );
        writeln!(
            catalog,
            "Extension {{ id: {id:?}, description: {description:?}, skills: &["
        )
        .unwrap();
        let mut names = BTreeSet::new();
        for name in &skills {
            assert!(
                name.len() <= 64
                    && name.starts_with(|c: char| c.is_ascii_lowercase())
                    && name
                        .bytes()
                        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
                    && names.insert(name),
                "{id}: invalid or duplicate skill {name:?}"
            );
            let document = format!("{root}/skills/{name}/SKILL.md");
            writeln!(catalog, "({name:?}, include_str!(concat!(env!(\"CARGO_MANIFEST_DIR\"), \"/\", {document:?}))),").unwrap();
        }
        catalog.push_str("] },\n");
    }
    catalog.push(']');
    let out = PathBuf::from(std::env::var_os("OUT_DIR").expect("Cargo output directory"));
    fs::write(out.join("extension_skills.rs"), catalog).expect("write extension skill catalog");
}
