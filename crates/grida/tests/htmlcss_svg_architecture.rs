//! Architectural tests for the `htmlcss::svg` module.
//!
//! Enforces the phase-boundary rules from
//! `docs/wg/feat-2d/htmlcss-svg.md`:
//!
//! - **Skia operation types are paint-only.** `Canvas`, `Shader`,
//!   `ImageFilter`, `Picture`, `Paint` (the Skia type) may only be
//!   imported by `paint/`. `resources/` may *produce* them as outputs
//!   but never accept a `&Canvas` parameter.
//! - **Phase dependency direction.** `dom/` and `style/` know nothing
//!   of `paint/`, `resources/`, or `layout/`. `geometry/` is
//!   phase-neutral but consumes nothing else. `layout/` may import
//!   `dom/` and `geometry/`. `paint/` may import everything.
//!
//! When this test fails, do not loosen the rule. Either move the
//! offending file to the right module, or restructure the import so
//! the type doesn't cross the boundary.
//!
//! Companion docs:
//! - `docs/wg/research/chromium/svg/module-structure.md` — Blink's
//!   layout that this test mirrors.
//! - `docs/wg/feat-2d/htmlcss-svg.md` — the design study.

use std::fs;
use std::path::{Path, PathBuf};

const SVG_ROOT_REL: &str = "src/htmlcss/svg";

/// Skia operation types — files importing any of these are doing
/// paint-time work and belong in `paint/` (or, as outputs, in
/// `resources/`).
const SKIA_OPS: &[&str] = &[
    "skia_safe::Canvas",
    "skia_safe::canvas::",
    "skia_safe::Shader",
    "skia_safe::ImageFilter",
    "skia_safe::image_filters",
    "skia_safe::Picture",
    "skia_safe::PictureRecorder",
];

/// `Canvas` specifically — even resources/ shouldn't import this
/// (resources may use `PictureRecorder` internally to produce a
/// `Picture` output, but a `&Canvas` argument is paint-time).
const CANVAS_TYPES: &[&str] = &["skia_safe::Canvas", "skia_safe::canvas::"];

fn svg_root() -> PathBuf {
    let manifest = env!("CARGO_MANIFEST_DIR");
    Path::new(manifest).join(SVG_ROOT_REL)
}

fn rs_files_under(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return out;
    };
    for ent in entries.flatten() {
        let p = ent.path();
        if p.is_dir() {
            out.extend(rs_files_under(&p));
        } else if p.extension().and_then(|s| s.to_str()) == Some("rs") {
            out.push(p);
        }
    }
    out
}

fn read(path: &Path) -> String {
    fs::read_to_string(path).unwrap_or_default()
}

/// Known follow-ups: file-relative paths (under `src/htmlcss/svg/`)
/// where a phase-boundary violation is acknowledged but not yet
/// fixed. Each entry should reference an issue/comment that explains
/// why it's deferred. Keep this list **shrinking, not growing**.
const ALLOWLIST: &[(&str, &str)] = &[
    // geometry/basic_shape.rs needs the SVG `d=` path parser to
    // implement CSS `path(...)`. The right long-term home for that
    // parser is geometry/, but moving it requires updating dom/'s
    // own call sites. Tracked as a follow-up.
    ("geometry/basic_shape.rs", "crate::htmlcss::svg::dom"),
];

fn is_allowlisted(file_rel: &str, forbidden: &str) -> bool {
    ALLOWLIST
        .iter()
        .any(|&(f, n)| file_rel.ends_with(f) && n == forbidden)
}

fn assert_no_imports(submodule: &str, forbidden: &[&str]) {
    let dir = svg_root().join(submodule);
    let files = rs_files_under(&dir);
    let mut violations: Vec<String> = Vec::new();
    for file in files {
        let content = read(&file);
        let rel = file
            .strip_prefix(svg_root())
            .unwrap_or(&file)
            .to_string_lossy()
            .to_string();
        for f in forbidden {
            if content.contains(f) && !is_allowlisted(&rel, f) {
                violations.push(format!(
                    "{}: imports `{}` (forbidden in `{}/`)",
                    rel, f, submodule,
                ));
            }
        }
    }
    if !violations.is_empty() {
        panic!(
            "architectural rule violated for `{}/`:\n  {}\n\n\
             See docs/wg/feat-2d/htmlcss-svg.md and \
             tests/htmlcss_svg_architecture.rs for the rules.\n\
             To allow a known temporary violation, add it to ALLOWLIST \
             with a comment explaining why and when it will be removed.",
            submodule,
            violations.join("\n  ")
        );
    }
}

#[test]
fn dom_does_not_import_skia_operation_types() {
    assert_no_imports("dom", SKIA_OPS);
}

#[test]
fn style_does_not_import_skia_operation_types() {
    assert_no_imports("style", SKIA_OPS);
}

#[test]
fn geometry_does_not_import_skia_operation_types() {
    assert_no_imports("geometry", SKIA_OPS);
}

#[test]
fn layout_does_not_import_skia_operation_types() {
    assert_no_imports("layout", SKIA_OPS);
}

#[test]
fn resources_does_not_accept_canvas_argument() {
    // resources/ may construct PictureRecorder / Picture / Shader /
    // ImageFilter as outputs, but accepting a `&Canvas` parameter
    // is paint-time work. This is a lighter rule than the
    // SKIA_OPS-everywhere ban.
    assert_no_imports("resources", CANVAS_TYPES);
}

#[test]
fn dom_does_not_depend_on_paint_or_resources_or_layout() {
    let forbidden: &[&str] = &[
        "crate::htmlcss::svg::paint",
        "crate::htmlcss::svg::resources",
        "crate::htmlcss::svg::layout",
        "super::super::paint",
        "super::super::resources",
        "super::super::layout",
    ];
    assert_no_imports("dom", forbidden);
}

#[test]
fn style_does_not_depend_on_paint_or_resources_or_layout() {
    let forbidden: &[&str] = &[
        "crate::htmlcss::svg::paint",
        "crate::htmlcss::svg::resources",
        "crate::htmlcss::svg::layout",
        "super::super::paint",
        "super::super::resources",
        "super::super::layout",
    ];
    assert_no_imports("style", forbidden);
}

#[test]
fn geometry_is_phase_neutral() {
    // geometry/ is consumed by every other phase but consumes
    // nothing from sibling phases. It may use Skia value types
    // (Path, Matrix, Rect) but not operation types (above test).
    let forbidden: &[&str] = &[
        "crate::htmlcss::svg::paint",
        "crate::htmlcss::svg::resources",
        "crate::htmlcss::svg::layout",
        "crate::htmlcss::svg::dom",
        "crate::htmlcss::svg::style",
        "super::super::paint",
        "super::super::resources",
        "super::super::layout",
        "super::super::dom",
        "super::super::style",
    ];
    assert_no_imports("geometry", forbidden);
}
