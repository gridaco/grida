//! Thin file host for the Draft 0 `.grida.xml` proof.
//!
//! The format parser remains a pure `&str -> Document` boundary. This binary
//! owns path I/O, a platform typeface, the raster surface, and PNG encoding;
//! the scene itself still runs through the engine's one frame entry.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use anchor_engine::frame;
use anchor_engine::paint::PaintCtx;
use anchor_lab::grida_xml;
use anchor_lab::math::Affine;
use anchor_lab::model::{Document, NodeId, Paint, ResourceRef};
use anchor_lab::resolve::{Report, ResolveOptions, Resolved};
use skia_safe::{surfaces, Color, EncodedImageFormat, FontMgr, FontStyle};

const DEFAULT_WIDTH: i32 = 1280;
const DEFAULT_HEIGHT: i32 = 720;
const USAGE: &str = "usage: grida_xml_render <input.grida.xml> <output.png> [width height]";

fn parse_extent(value: &str, label: &str) -> Result<i32, String> {
    let extent = value
        .parse::<i32>()
        .map_err(|_| format!("{label} must be a positive integer, got `{value}`"))?;
    if extent <= 0 {
        return Err(format!("{label} must be positive, got `{value}`"));
    }
    Ok(extent)
}

fn dimensions(args: &[String]) -> Result<(i32, i32), String> {
    match args {
        [] => Ok((DEFAULT_WIDTH, DEFAULT_HEIGHT)),
        [width, height] => Ok((
            parse_extent(width, "width")?,
            parse_extent(height, "height")?,
        )),
        _ => Err(USAGE.into()),
    }
}

fn node_label(doc: &Document, id: NodeId) -> String {
    doc.get(id)
        .header
        .name
        .as_deref()
        .map(|name| format!("`{name}`"))
        .unwrap_or_else(|| format!("node {id}"))
}

fn collect_visible_image_resources(
    doc: &Document,
    id: NodeId,
    out: &mut Vec<(NodeId, ResourceRef)>,
) {
    let node = doc.get(id);
    if !node.header.active {
        return;
    }
    for paint in node.fills.iter().filter(|paint| paint.visible()) {
        if let Paint::Image(image) = paint {
            out.push((id, image.image.clone()));
        }
    }
    for stroke in node.strokes.iter().filter(|stroke| stroke.visible()) {
        for paint in stroke.paints.iter().filter(|paint| paint.visible()) {
            if let Paint::Image(image) = paint {
                out.push((id, image.image.clone()));
            }
        }
    }
    for &child in &node.children {
        collect_visible_image_resources(doc, child, out);
    }
}

fn local_resource_path(base: &Path, rid: &str) -> Result<PathBuf, String> {
    if rid.contains("://") || rid.starts_with("data:") {
        return Err(format!(
            "non-file image resource `{rid}` is not supported by this file host"
        ));
    }
    let path = Path::new(rid);
    Ok(if path.is_absolute() {
        path.to_path_buf()
    } else {
        base.join(path)
    })
}

/// Resolve and decode every image that can contribute to the frame before any
/// paint command runs. Relative RIDs are based at the source document, never
/// the process working directory; duplicate RIDs share one decoded image.
fn load_image_resources(
    input: &Path,
    doc: &Document,
    paint_ctx: &mut PaintCtx,
) -> Result<(), String> {
    let base = input.parent().unwrap_or_else(|| Path::new("."));
    let mut refs = vec![];
    collect_visible_image_resources(doc, doc.root, &mut refs);
    let mut loaded = BTreeSet::new();
    for (node, resource) in refs {
        let rid = match resource {
            ResourceRef::Rid(rid) => rid,
            ResourceRef::Hash(hash) => {
                return Err(format!(
                    "{} content-hash image resource `{hash}` is not supported by this file host",
                    node_label(doc, node)
                ));
            }
        };
        if !loaded.insert(rid.clone()) || paint_ctx.contains_image(&rid) {
            continue;
        }
        let resolved = local_resource_path(base, &rid)
            .map_err(|error| format!("{} image `{rid}`: {error}", node_label(doc, node)))?;
        let bytes = std::fs::read(&resolved).map_err(|error| {
            format!(
                "{} image `{rid}` resolved to {}: {error}",
                node_label(doc, node),
                resolved.display()
            )
        })?;
        paint_ctx
            .insert_encoded(rid.clone(), &bytes)
            .map_err(|error| {
                format!(
                    "{} image `{rid}` resolved to {}: {error}",
                    node_label(doc, node),
                    resolved.display()
                )
            })?;
    }
    Ok(())
}

/// A resolver report that says intent was ignored or underdetermined is a
/// failed file render, not a warning the CLI may discard. Ordinary min/max
/// and span clamps remain valid resolved output.
fn ensure_resolved_without_errors(doc: &Document, resolved: &Resolved) -> Result<(), String> {
    for report in &resolved.reports {
        let (node, field, rule) = match report {
            Report::IgnoredByRule { node, field, rule }
            | Report::ErrorByRule { node, field, rule } => (*node, *field, *rule),
            Report::Clamped { .. } => continue,
        };
        return Err(format!(
            "{} could not resolve `{field}`: {rule}",
            node_label(doc, node)
        ));
    }
    Ok(())
}

fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [input, output, rest @ ..] = args.as_slice() else {
        return Err(USAGE.into());
    };
    let (width, height) = dimensions(rest)?;

    let source = std::fs::read_to_string(input)
        .map_err(|error| format!("read {}: {error}", Path::new(input).display()))?;
    let doc = grida_xml::parse(&source)
        .map_err(|error| format!("parse {}: {error}", Path::new(input).display()))?;

    let mut surface = surfaces::raster_n32_premul((width, height))
        .ok_or_else(|| format!("could not allocate {width}x{height} raster surface"))?;
    surface.canvas().clear(Color::WHITE);

    let options = ResolveOptions {
        viewport: (width as f32, height as f32),
        ..Default::default()
    };
    let font = FontMgr::new()
        .legacy_make_typeface(None, FontStyle::default())
        .ok_or_else(|| "no platform-default typeface is available".to_string())?;
    let mut paint_ctx = PaintCtx::new(Some(font));
    load_image_resources(Path::new(input), &doc, &mut paint_ctx)?;
    let (resolved, _, _) = frame::render(
        surface.canvas(),
        &doc,
        &options,
        &Affine::IDENTITY,
        &paint_ctx,
    );
    ensure_resolved_without_errors(&doc, &resolved)?;

    let image = surface.image_snapshot();
    let png = image
        .encode(None, EncodedImageFormat::PNG, None)
        .ok_or_else(|| "PNG encoding failed".to_string())?;
    std::fs::write(output, png.as_bytes())
        .map_err(|error| format!("write {}: {error}", Path::new(output).display()))?;

    println!(
        "rendered {} -> {} ({}x{})",
        Path::new(input).display(),
        Path::new(output).display(),
        width,
        height
    );
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("grida_xml_render: {error}");
        std::process::exit(2);
    }
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use super::{ensure_resolved_without_errors, load_image_resources, local_resource_path};
    use anchor_engine::paint::PaintCtx;
    use anchor_lab::grida_xml;
    use anchor_lab::resolve::{resolve, ResolveOptions};

    fn fixture_input() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("rig/fixtures/nested-rects.grida.xml")
    }

    #[test]
    fn probe_fixture_resolves_without_errors() {
        let doc =
            grida_xml::parse(include_str!("../../rig/fixtures/nested-rects.grida.xml")).unwrap();
        let resolved = resolve(&doc, &ResolveOptions::default());
        assert_eq!(ensure_resolved_without_errors(&doc, &resolved), Ok(()));
    }

    #[test]
    fn resolution_guard_rejects_underdetermined_intent() {
        let doc = grida_xml::parse(
            r#"<grida version="0"><container width="auto" height="100"><rect name="centered" x="center" width="10" height="10"/></container></grida>"#,
        )
        .unwrap();
        let resolved = resolve(&doc, &ResolveOptions::default());
        let error = ensure_resolved_without_errors(&doc, &resolved).unwrap_err();
        assert!(
            error.contains("`centered` could not resolve `x`: End/Center pin underdetermined"),
            "{error}"
        );
    }

    #[test]
    fn image_resources_resolve_from_the_document_directory() {
        let rid = "../../../../fixtures/images/border-diamonds.png";
        let source = format!(
            r#"<grida version="0"><container><rect name="image-card" width="90" height="90"><fill><image src="{rid}"/></fill></rect></container></grida>"#
        );
        let doc = grida_xml::parse(&source).unwrap();
        let mut ctx = PaintCtx::new(None);
        load_image_resources(&fixture_input(), &doc, &mut ctx).unwrap();
        assert!(ctx.contains_image(rid));
    }

    #[test]
    fn image_resources_are_discovered_in_authored_strokes() {
        let rid = "../../../../fixtures/images/border-diamonds.png";
        let source = format!(
            r#"<grida version="0"><container><rect width="90" height="90"><stroke width="8" align="inside"><image src="{rid}" fit="fill"/></stroke></rect></container></grida>"#
        );
        let doc = grida_xml::parse(&source).unwrap();
        let mut ctx = PaintCtx::new(None);
        load_image_resources(&fixture_input(), &doc, &mut ctx).unwrap();
        assert!(ctx.contains_image(rid));
    }

    #[test]
    fn image_resource_errors_name_authored_and_resolved_locations() {
        let missing = grida_xml::parse(
            r#"<grida version="0"><container><rect name="missing" width="1" height="1"><fill><image src="./missing.png"/></fill></rect></container></grida>"#,
        )
        .unwrap();
        let mut ctx = PaintCtx::new(None);
        let error = load_image_resources(&fixture_input(), &missing, &mut ctx).unwrap_err();
        assert!(error.contains("`missing` image `./missing.png`"), "{error}");
        assert!(error.contains("rig/fixtures/./missing.png"), "{error}");

        let corrupt = grida_xml::parse(
            r#"<grida version="0"><container><rect name="corrupt" width="1" height="1"><fill><image src="./nested-rects.grida.xml"/></fill></rect></container></grida>"#,
        )
        .unwrap();
        let error = load_image_resources(&fixture_input(), &corrupt, &mut ctx).unwrap_err();
        assert!(
            error.contains("`corrupt` image `./nested-rects.grida.xml`"),
            "{error}"
        );
        assert!(error.contains("could not decode"), "{error}");
    }

    #[test]
    fn resource_id_shape_does_not_imply_a_hash_reference() {
        let base = Path::new("document");
        assert_eq!(
            local_resource_path(base, "hash:asset.png").unwrap(),
            base.join("hash:asset.png")
        );
    }
}
