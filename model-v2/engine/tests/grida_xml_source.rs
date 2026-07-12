//! Engine integration proof for linked Grida XML source programs.
//!
//! Component syntax is consumed before the engine boundary. The resolver,
//! display-list builder, and frame entry receive only the ordinary `Document`
//! produced by the source materializer.

#[allow(dead_code)]
mod support;

use anchor_engine::drawlist::{build_glyphless, Item, ItemKind};
use anchor_engine::frame;
use anchor_engine::paint::PaintCtx;
use anchor_lab::grida_xml_source::{self, SourceProvider, SourceSnapshot, ValueSelection};
use anchor_lab::math::Affine;
use anchor_lab::model::{
    Color as ModelColor, CornerSmoothing, Paints, Payload, RectangularCornerRadius,
};
use anchor_lab::resolve::{resolve, ResolveOptions};
use skia_safe::{surfaces, Color};

const ENTRY_SOURCE: &str = include_str!("../rig/fixtures/component-program/entry.grida.xml");
const COMPONENT_SOURCE: &str = include_str!("../rig/fixtures/component-program/swatch.grida.xml");
const ENTRY_ID: &str = "fixture:component-program/entry";
const COMPONENT_ID: &str = "fixture:component-program/swatch";
const SOURCE_BASE: &str = "fixture:/component-program/";
const WIDTH: i32 = 96;
const HEIGHT: i32 = 40;

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
        if containing.identity() != ENTRY_ID || location != "./swatch.grida.xml" {
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

fn assert_rect_fill(item: &Item, node: u32, world: Affine, width: f32, color: u32) {
    assert_eq!(item.node, node);
    assert_eq!(item.world, world);
    assert_eq!(
        item.kind,
        ItemKind::RectFill {
            w: width,
            h: 24.0,
            corner_radius: RectangularCornerRadius::default(),
            corner_smoothing: CornerSmoothing::default(),
            paints: Paints::solid(ModelColor(color)),
        }
    );
}

#[test]
fn version2_component_program_materializes_before_the_component_blind_frame() {
    let mut sources = FixtureSources::default();
    let output = grida_xml_source::materialize(
        SourceSnapshot::new(ENTRY_ID, SOURCE_BASE, ENTRY_SOURCE),
        &mut sources,
    )
    .expect("external Version 2 component program materializes");

    assert_eq!(
        sources.requests, 1,
        "one external source snapshot is reused"
    );
    assert_eq!(output.program.units().len(), 2);
    assert!(output.resources.is_empty());

    // The ordinary model needs no component/use/prop/arg variants. This
    // fixture lowers to the implicit document root, one scene container, and
    // two independent ordinary component containers.
    assert_eq!(output.document.len(), 4);
    for id in 0..output.document.capacity() as u32 {
        let Some(node) = output.document.get_opt(id) else {
            continue;
        };
        assert!(matches!(node.payload, Payload::Frame { .. }), "node {id}");
    }

    let scene = output.document.get(output.document.root).children[0];
    let instances = &output.document.get(scene).children;
    assert_eq!(instances.len(), 2);
    assert_ne!(instances[0], instances[1]);

    let expected_names = ["red-instance", "blue-instance"];
    for (&instance, expected_name) in instances.iter().zip(expected_names) {
        let provenance = output.provenance.get(&instance).unwrap();
        let component = provenance.component.as_ref().unwrap();
        assert_eq!(component.source, COMPONENT_ID);
        assert_eq!(component.id, "swatch");
        assert_eq!(provenance.use_chain.len(), 1);
        assert_eq!(provenance.use_chain[0].name.as_deref(), Some(expected_name));
    }

    assert_eq!(output.specializations.len(), 2);
    let expected_tones = ["#FF0000", "#0000FF"];
    for (((specialization, &instance), expected_name), expected_tone) in output
        .specializations
        .iter()
        .zip(instances)
        .zip(expected_names)
        .zip(expected_tones)
    {
        assert_eq!(specialization.component.source, COMPONENT_ID);
        assert_eq!(specialization.component.id, "swatch");
        assert_eq!(
            specialization.use_chain[0].name.as_deref(),
            Some(expected_name)
        );
        assert_eq!(specialization.props.len(), 1);
        let tone = &specialization.props[0];
        assert_eq!(tone.name, "tone");
        assert_eq!(tone.value, expected_tone);
        assert!(matches!(tone.selection, ValueSelection::Supplied { .. }));
        assert_eq!(tone.materialized_occurrences.len(), 1);
        assert_eq!(tone.materialized_occurrences[0].node, instance);
    }

    // From this point onward, only the ordinary document crosses the engine
    // boundary. Resolve and display-list order prove the two specializations
    // remain independent before the pixel observation.
    let resolved = resolve(&output.document, &options());
    assert_eq!(resolved.xywh(instances[0]), (8.0, 8.0, 40.0, 24.0));
    assert_eq!(resolved.xywh(instances[1]), (40.0, 8.0, 40.0, 24.0));
    let list = build_glyphless(&output.document, &resolved);
    assert_eq!(list.items.len(), 3);
    assert_eq!(list.items[0].node, scene);
    assert_rect_fill(
        &list.items[1],
        instances[0],
        Affine::translate(8.0, 8.0),
        40.0,
        0xFFFF_0000,
    );
    assert_rect_fill(
        &list.items[2],
        instances[1],
        Affine::translate(40.0, 8.0),
        40.0,
        0xFF00_00FF,
    );

    let paint_ctx = PaintCtx::new(None);
    let mut surface = surfaces::raster_n32_premul((WIDTH, HEIGHT)).expect("raster surface");
    surface.canvas().clear(Color::BLACK);
    let (_, frame_list, _) = frame::render(
        surface.canvas(),
        &output.document,
        &options(),
        &Affine::IDENTITY,
        &paint_ctx,
    );
    assert_eq!(frame_list, list);
    assert_eq!(surface.canvas().save_count(), 1, "canvas state leaked");

    let image = support::RgbaImage::from_image(&surface.image_snapshot());
    assert_eq!(image.at(4, 20), [255, 255, 255, 255]);
    assert_eq!(image.at(16, 20), [255, 0, 0, 255]);
    assert_eq!(image.at(44, 20), [0, 0, 255, 255]);
    assert_eq!(image.at(72, 20), [0, 0, 255, 255]);
    assert_eq!(image.at(44, 36), [255, 255, 255, 255]);
}
