//! Engine integration proof for Version 3 render-slot projection.
//!
//! Slot declarations and assignments are consumed by the source materializer.
//! Resolution, display-list construction, and painting observe only the
//! resulting ordinary scene nodes.

#[allow(dead_code)]
mod support;

use anchor_engine::drawlist::build_glyphless_unchecked;
use anchor_engine::frame;
use anchor_engine::paint::PaintCtx;
use anchor_lab::grida_xml_source::{self, SourceProvider, SourceSnapshot};
use anchor_lab::math::Affine;
use anchor_lab::model::{Payload, ShapeDesc};
use anchor_lab::resolve::{resolve, ResolveOptions};
use skia_safe::{surfaces, Color};

const ENTRY_SOURCE: &str = include_str!("../rig/fixtures/slot-program/entry.grida.xml");
const COMPONENT_SOURCE: &str = include_str!("../rig/fixtures/slot-program/post-shell.grida.xml");
const ENTRY_ID: &str = "fixture:slot-program/entry";
const COMPONENT_ID: &str = "fixture:slot-program/post-shell";
const SOURCE_BASE: &str = "fixture:/slot-program/";
const WIDTH: i32 = 112;
const HEIGHT: i32 = 48;

#[derive(Default)]
struct FixtureSources {
    requests: usize,
}

impl SourceProvider for FixtureSources {
    fn resolve(
        &mut self,
        containing: &SourceSnapshot,
        location: &str,
    ) -> Result<SourceSnapshot, String> {
        self.requests += 1;
        if containing.identity() != ENTRY_ID || location != "./post-shell.grida.xml" {
            return Err(format!(
                "unexpected fixture reference from {} to {location}",
                containing.identity()
            ));
        }
        Ok(SourceSnapshot::new(
            COMPONENT_ID,
            SOURCE_BASE,
            COMPONENT_SOURCE,
        ))
    }
}

fn options() -> ResolveOptions {
    ResolveOptions {
        viewport: (WIDTH as f32, HEIGHT as f32),
        ..Default::default()
    }
}

#[test]
fn version3_slots_materialize_before_the_component_blind_frame() {
    let mut sources = FixtureSources::default();
    let output = grida_xml_source::materialize(
        SourceSnapshot::new(ENTRY_ID, SOURCE_BASE, ENTRY_SOURCE),
        &mut sources,
    )
    .expect("external Version 3 slot program materializes");

    assert_eq!(
        sources.requests, 1,
        "one external source snapshot is reused"
    );
    assert_eq!(output.program.units().len(), 2);
    assert!(output.resources.is_empty());

    // No component, use, or slot kind crosses the source boundary. The
    // concrete document contains only ordinary containers and rectangles.
    assert_eq!(output.document.len(), 12);
    for id in 0..output.document.capacity() as u32 {
        let Some(node) = output.document.get_opt(id) else {
            continue;
        };
        assert!(
            matches!(
                node.payload,
                Payload::Frame { .. }
                    | Payload::Shape {
                        desc: ShapeDesc::Rect
                    }
            ),
            "unexpected ordinary payload at node {id}: {:?}",
            node.payload
        );
    }

    let scene = output.document.get(output.document.root).children[0];
    let instances = &output.document.get(scene).children;
    assert_eq!(instances.len(), 2);
    let filled = instances[0];
    let empty = instances[1];

    let filled_children = &output.document.get(filled).children;
    let empty_children = &output.document.get(empty).children;
    assert_eq!(filled_children.len(), 3);
    assert_eq!(empty_children.len(), 3);
    let (filled_header, filled_body, filled_footer) =
        (filled_children[0], filled_children[1], filled_children[2]);
    let (empty_header, empty_body, empty_footer) =
        (empty_children[0], empty_children[1], empty_children[2]);
    let assignments = &output.document.get(filled_body).children;
    assert_eq!(assignments.len(), 2);
    assert!(output.document.get(empty_body).children.is_empty());
    let green = assignments[0];
    let blue = assignments[1];

    assert_eq!(output.slot_projections.len(), 2);
    let filled_projection = output
        .slot_projections
        .iter()
        .find(|projection| {
            projection
                .use_chain
                .last()
                .and_then(|site| site.name.as_deref())
                == Some("filled")
        })
        .expect("filled slot projection");
    let empty_projection = output
        .slot_projections
        .iter()
        .find(|projection| {
            projection
                .use_chain
                .last()
                .and_then(|site| site.name.as_deref())
                == Some("empty")
        })
        .expect("empty slot projection");
    for projection in [filled_projection, empty_projection] {
        assert_eq!(projection.definition.source, COMPONENT_ID);
        assert_eq!(projection.definition.component.source, COMPONENT_ID);
        assert_eq!(projection.definition.component.id, "post-shell");
        assert_eq!(projection.definition.name, "content");
        assert!(projection.definition.span.end > projection.definition.span.start);
    }
    assert_eq!(
        filled_projection
            .assignments
            .iter()
            .map(|assignment| assignment.node)
            .collect::<Vec<_>>(),
        [green, blue]
    );
    assert!(filled_projection.assignments.iter().all(|assignment| {
        assignment.site.source == ENTRY_ID
            && assignment.site.component.is_none()
            && assignment.site.name == "content"
            && assignment.site.span.end > assignment.site.span.start
    }));
    assert!(empty_projection.assignments.is_empty());

    for assigned in [green, blue] {
        let provenance = &output.provenance[&assigned];
        assert_eq!(provenance.source, ENTRY_ID);
        assert!(provenance.component.is_none());
        assert_eq!(provenance.use_chain.len(), 1);
        assert_eq!(provenance.use_chain[0].target.source, COMPONENT_ID);
        assert_eq!(provenance.use_chain[0].target.id, "post-shell");
    }
    for definition_node in [filled_header, filled_footer, empty_header, empty_footer] {
        let provenance = &output.provenance[&definition_node];
        assert_eq!(provenance.source, COMPONENT_ID);
        assert_eq!(provenance.component.as_ref().unwrap().id, "post-shell");
    }

    let resolved = resolve(&output.document, &options());
    assert!(resolved.reports.is_empty(), "{:?}", resolved.reports);
    assert_eq!(resolved.xywh(filled), (4.0, 4.0, 48.0, 40.0));
    assert_eq!(resolved.xywh(empty), (60.0, 4.0, 48.0, 40.0));
    assert_eq!(resolved.xywh(filled_header), (0.0, 0.0, 48.0, 8.0));
    assert_eq!(resolved.xywh(filled_body), (0.0, 8.0, 48.0, 24.0));
    assert_eq!(resolved.xywh(green), (0.0, 0.0, 32.0, 24.0));
    assert_eq!(resolved.xywh(blue), (16.0, 0.0, 32.0, 24.0));
    assert_eq!(resolved.xywh(filled_footer), (0.0, 32.0, 48.0, 8.0));
    assert_eq!(resolved.world_of(green), Affine::translate(4.0, 12.0));
    assert_eq!(resolved.world_of(blue), Affine::translate(20.0, 12.0));
    assert_eq!(resolved.world_of(empty_body), Affine::translate(60.0, 12.0));

    // The display list is already slot-blind. Its ordinary painter order is
    // definition header, caller roots in assignment order, then definition
    // footer, followed by the empty instance's header and footer.
    let list = build_glyphless_unchecked(&output.document, &resolved);
    assert_eq!(
        list.items.iter().map(|item| item.node).collect::<Vec<_>>(),
        [
            filled_header,
            green,
            blue,
            filled_footer,
            empty_header,
            empty_footer,
        ]
    );

    let paint_ctx = PaintCtx::new(None);
    let mut surface = surfaces::raster_n32_premul((WIDTH, HEIGHT)).expect("raster surface");
    surface.canvas().clear(Color::BLACK);
    let (product, _) = frame::render(
        surface.canvas(),
        &output.document,
        &options(),
        &Affine::IDENTITY,
        &paint_ctx,
    )
    .expect("valid slot-program frame");
    assert_eq!(product.drawlist(), &list);
    assert_eq!(surface.canvas().save_count(), 1, "canvas state leaked");

    let image = support::RgbaImage::from_image(&surface.image_snapshot());
    assert_eq!(image.at(1, 1), [0, 0, 0, 255]);
    assert_eq!(image.at(8, 8), [225, 29, 72, 255]);
    assert_eq!(image.at(8, 24), [34, 197, 94, 255]);
    assert_eq!(image.at(24, 24), [37, 99, 235, 255]);
    assert_eq!(image.at(8, 40), [225, 29, 72, 255]);
    assert_eq!(image.at(64, 8), [225, 29, 72, 255]);
    assert_eq!(image.at(84, 24), [0, 0, 0, 255]);
    assert_eq!(image.at(64, 40), [225, 29, 72, 255]);
}
