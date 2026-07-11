//! Checked-in `.grida.xml` examples are executable canonical source, not
//! illustrative pseudocode. Keeping them at the writer fixpoint prevents the
//! documentation corpus from drifting back to retired spellings. Each source
//! is also resolved and painted once with its checked-in resources.

use anchor_engine::frame;
use anchor_engine::paint::PaintCtx;
use anchor_lab::grida_xml;
use anchor_lab::math::Affine;
use anchor_lab::model::{Document, Paint, Payload, ResourceRef};
use anchor_lab::resolve::{Report, ResolveOptions};
use skia_safe::{surfaces, Color};
use std::path::Path;

type Example = (&'static str, &'static str, &'static str, (i32, i32));

const CANONICAL_EXAMPLES: [Example; 7] = [
    (
        "nested-rects",
        "rig/fixtures/nested-rects.grida.xml",
        include_str!("../rig/fixtures/nested-rects.grida.xml"),
        (96, 80),
    ),
    (
        "dynamic-slide",
        "rig/examples/dynamic-slide.grida.xml",
        include_str!("../rig/examples/dynamic-slide.grida.xml"),
        (1280, 720),
    ),
    (
        "rich-fills",
        "rig/examples/rich-fills.grida.xml",
        include_str!("../rig/examples/rich-fills.grida.xml"),
        (720, 300),
    ),
    (
        "rich-strokes",
        "rig/examples/rich-strokes.grida.xml",
        include_str!("../rig/examples/rich-strokes.grida.xml"),
        (720, 320),
    ),
    (
        "source-becomes-surface",
        "rig/examples/source-becomes-surface.grida.xml",
        include_str!("../rig/examples/source-becomes-surface.grida.xml"),
        (1600, 1000),
    ),
    (
        "rounded-surfaces",
        "rig/examples/rounded-surfaces.grida.xml",
        include_str!("../rig/examples/rounded-surfaces.grida.xml"),
        (1440, 900),
    ),
    (
        "per-side-strokes",
        "rig/examples/per-side-strokes.grida.xml",
        include_str!("../rig/examples/per-side-strokes.grida.xml"),
        (1200, 760),
    ),
];

// These remain in natural authored form on purpose. They prove the strict
// reader accepts useful, non-writer-normalized source and that ambitious
// compositions materialize through the same engine path. The three
// `rfc-only-*` files began as RFD-only drafts without implementation or
// example access; the dashboard makes three parent axes explicit to work
// around the current flex/descendant-binding resolver seam. The other three
// are curated product-quality demonstrations.
const AUTHORED_SHOWCASES: [Example; 7] = [
    (
        "rich-text",
        "rig/examples/rich-text.grida.xml",
        include_str!("../rig/examples/rich-text.grida.xml"),
        (1280, 800),
    ),
    (
        "prism-launch",
        "rig/examples/prism-launch.grida.xml",
        include_str!("../rig/examples/prism-launch.grida.xml"),
        (1440, 900),
    ),
    (
        "pulse-analytics",
        "rig/examples/pulse-analytics.grida.xml",
        include_str!("../rig/examples/pulse-analytics.grida.xml"),
        (1440, 960),
    ),
    (
        "nocturne-transit",
        "rig/examples/nocturne-transit.grida.xml",
        include_str!("../rig/examples/nocturne-transit.grida.xml"),
        (1400, 900),
    ),
    (
        "rfc-only-keynote",
        "rig/examples/rfc-only-keynote.grida.xml",
        include_str!("../rig/examples/rfc-only-keynote.grida.xml"),
        (960, 540),
    ),
    (
        "rfc-only-dashboard",
        "rig/examples/rfc-only-dashboard.grida.xml",
        include_str!("../rig/examples/rfc-only-dashboard.grida.xml"),
        (960, 640),
    ),
    (
        "rfc-only-transit",
        "rig/examples/rfc-only-transit.grida.xml",
        include_str!("../rig/examples/rfc-only-transit.grida.xml"),
        (1000, 620),
    ),
];

fn load_resources(doc: &Document, source_path: &Path, ctx: &mut PaintCtx) {
    let base = source_path
        .parent()
        .expect("example has a parent directory");
    for id in 0..doc.capacity() as u32 {
        let Some(node) = doc.get_opt(id) else {
            continue;
        };
        let mut paints = node
            .fills
            .iter()
            .chain(node.strokes.iter().flat_map(|stroke| stroke.paints.iter()))
            .collect::<Vec<_>>();
        if let Payload::AttributedText {
            attributed_string, ..
        } = &node.payload
        {
            paints.extend(
                attributed_string
                    .runs
                    .iter()
                    .filter_map(|run| run.fills.as_ref())
                    .flat_map(|fills| fills.iter()),
            );
        }
        for paint in paints.into_iter().filter(|paint| paint.visible()) {
            let Paint::Image(image) = paint else {
                continue;
            };
            let ResourceRef::Rid(rid) = &image.image else {
                panic!("checked-in examples use RID image resources");
            };
            if ctx.contains_image(rid) {
                continue;
            }
            let path = base.join(rid);
            let bytes =
                std::fs::read(&path).unwrap_or_else(|error| panic!("{}: {error}", path.display()));
            ctx.insert_encoded(rid.clone(), &bytes)
                .unwrap_or_else(|error| panic!("{}: {error}", path.display()));
        }
    }
}

#[test]
fn checked_in_examples_are_canonical_writer_fixpoints() {
    for (name, _, source, _) in CANONICAL_EXAMPLES {
        let doc = grida_xml::parse(source).unwrap_or_else(|error| panic!("{name}: {error}"));
        let printed = grida_xml::print(&doc).unwrap_or_else(|error| panic!("{name}: {error}"));
        assert_eq!(printed, source, "{name} is not canonical Draft 0 source");
    }
}

#[test]
fn checked_in_examples_resolve_resources_and_render() {
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    for (name, relative_path, source, (width, height)) in
        CANONICAL_EXAMPLES.into_iter().chain(AUTHORED_SHOWCASES)
    {
        let doc = grida_xml::parse(source).unwrap_or_else(|error| panic!("{name}: {error}"));
        let mut ctx = PaintCtx::new(None);
        load_resources(&doc, &manifest.join(relative_path), &mut ctx);
        let mut surface = surfaces::raster_n32_premul((width, height))
            .unwrap_or_else(|| panic!("{name}: raster allocation failed"));
        surface.canvas().clear(Color::WHITE);
        let options = ResolveOptions {
            viewport: (width as f32, height as f32),
            ..Default::default()
        };
        let (resolved, drawlist, _) =
            frame::render(surface.canvas(), &doc, &options, &Affine::IDENTITY, &ctx);
        assert!(
            !resolved.reports.iter().any(|report| matches!(
                report,
                Report::IgnoredByRule { .. } | Report::ErrorByRule { .. }
            )),
            "{name}: unresolved intent: {:?}",
            resolved.reports
        );
        assert!(!drawlist.items.is_empty(), "{name}: empty drawlist");
        assert_eq!(
            surface.canvas().save_count(),
            1,
            "{name}: leaked canvas state"
        );
    }
}
