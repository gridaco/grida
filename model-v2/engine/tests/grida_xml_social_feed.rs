//! Executable smoke proof for the Version 3 social-feed showcase.
//!
//! The rich example is not a reftest or a probe fixture. Structural and
//! resolved-layout assertions keep the authored demo executable; the focused
//! solid-color slot fixture owns deterministic pixel observations.

use anchor_engine::drawlist::ItemKind;
use anchor_engine::frame;
use anchor_engine::paint::PaintCtx;
use anchor_lab::grida_xml_source::{self, SourceProvider, SourceSnapshot};
use anchor_lab::math::Affine;
use anchor_lab::model::{Paint, ResourceRef};
use anchor_lab::resolve::{resolve, ResolveOptions};
use skia_safe::{surfaces, Color};
use std::collections::BTreeSet;

const ENTRY_SOURCE: &str = include_str!("../rig/examples/social-feed/entry.grida.xml");
const COMPONENT_SOURCE: &str = include_str!("../rig/examples/social-feed/post-card.grida.xml");
const ENTRY_ID: &str = "example:social-feed/entry";
const COMPONENT_ID: &str = "example:social-feed/post-card";
const SOURCE_BASE: &str = "example:/social-feed/";
const COASTAL_IMAGE: &[u8] =
    include_bytes!("../rig/examples/social-feed/assets/post-coastal-cabin.webp");
const STUDIO_IMAGE: &[u8] =
    include_bytes!("../rig/examples/social-feed/assets/post-orange-studio.webp");
const WIDTH: i32 = 1920;
const HEIGHT: i32 = 1080;

#[derive(Default)]
struct SocialFeedSources {
    requests: usize,
}

impl SourceProvider for SocialFeedSources {
    fn resolve(
        &mut self,
        containing: &SourceSnapshot,
        location: &str,
    ) -> Result<SourceSnapshot, String> {
        self.requests += 1;
        if containing.identity() != ENTRY_ID || location != "./post-card.grida.xml" {
            return Err(format!(
                "unexpected social-feed reference from {} to {location}",
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
    options_for(WIDTH as f32, HEIGHT as f32)
}

fn options_for(width: f32, height: f32) -> ResolveOptions {
    ResolveOptions {
        viewport: (width, height),
        ..Default::default()
    }
}

#[test]
fn desktop_social_feed_keeps_shared_shells_caller_media_and_loaded_resources() {
    let mut sources = SocialFeedSources::default();
    let output = grida_xml_source::materialize(
        SourceSnapshot::new(ENTRY_ID, SOURCE_BASE, ENTRY_SOURCE),
        &mut sources,
    )
    .expect("the Version 3 social feed materializes");

    assert_eq!(sources.requests, 1);
    assert_eq!(output.program.units().len(), 2);
    assert_eq!(
        output.specializations.len(),
        13,
        "six stories, five suggestions, and two posts are specialized"
    );
    assert_eq!(output.slot_projections.len(), 2);
    assert!(output.slot_projections.iter().all(|projection| {
        projection.definition.source == COMPONENT_ID
            && projection.definition.component.id == "post-card"
            && projection.definition.name == "media"
            && projection.assignments.len() == 1
            && projection.assignments[0].site.source == ENTRY_ID
    }));
    let mut authored_resources = output
        .resources
        .iter()
        .map(|resource| resource.authored.as_str())
        .collect::<Vec<_>>();
    assert!(output
        .resources
        .iter()
        .all(|resource| { resource.source == ENTRY_ID && resource.base == SOURCE_BASE }));
    authored_resources.sort_unstable();
    assert_eq!(
        authored_resources,
        [
            "./assets/post-coastal-cabin.webp",
            "./assets/post-orange-studio.webp",
        ]
    );
    let expected_image_rids = output
        .resources
        .iter()
        .map(|resource| resource.runtime_rid.clone())
        .collect::<BTreeSet<_>>();

    let scene = output.document.get(output.document.root).children[0];
    let scene_children = &output.document.get(scene).children;
    assert_eq!(scene_children.len(), 5);
    let timeline = scene_children[2];
    let posts = &output.document.get(timeline).children;
    assert_eq!(posts.len(), 2);
    let first_media = output.document.get(posts[0]).children[1];
    let second_media = output.document.get(posts[1]).children[1];
    let first_art = output.document.get(first_media).children[0];
    let second_art = output.document.get(second_media).children[0];
    assert_eq!(output.provenance[&first_art].source, ENTRY_ID);
    assert_eq!(output.provenance[&second_art].source, ENTRY_ID);

    let resolved = resolve(&output.document, &options());
    assert!(resolved.reports.is_empty(), "{:?}", resolved.reports);
    assert_eq!(resolved.xywh(posts[0]), (0.0, 0.0, 468.0, 780.0));
    assert_eq!(resolved.xywh(posts[1]), (0.0, 800.0, 468.0, 780.0));
    assert_eq!(resolved.world_of(posts[0]), Affine::translate(620.0, 166.0));
    assert_eq!(resolved.world_of(posts[1]), Affine::translate(620.0, 966.0));
    assert_eq!(resolved.xywh(first_media), (0.0, 52.0, 468.0, 585.0));
    assert_eq!(resolved.xywh(second_media), (0.0, 52.0, 468.0, 585.0));
    assert_eq!(
        resolved.world_of(first_art),
        Affine::translate(620.0, 218.0)
    );
    assert_eq!(
        resolved.world_of(second_art),
        Affine::translate(620.0, 1018.0)
    );

    let mut surface = surfaces::raster_n32_premul((WIDTH, HEIGHT)).expect("raster surface");
    surface.canvas().clear(Color::WHITE);
    let mut paint_ctx = PaintCtx::new(None);
    for resource in &output.resources {
        let encoded = match resource.authored.as_str() {
            "./assets/post-coastal-cabin.webp" => COASTAL_IMAGE,
            "./assets/post-orange-studio.webp" => STUDIO_IMAGE,
            authored => panic!("unexpected social-feed resource {authored}"),
        };
        paint_ctx
            .insert_encoded(resource.runtime_rid.clone(), encoded)
            .expect("checked-in social media asset decodes");
        assert!(paint_ctx.contains_image(&resource.runtime_rid));
    }
    let (product, _) = frame::render(
        surface.canvas(),
        &output.document,
        &options(),
        &Affine::IDENTITY,
        &paint_ctx,
    )
    .expect("valid social-feed frame");
    assert!(!product.drawlist().items.is_empty());
    let mut drawn_image_rids = BTreeSet::new();
    for item in &product.drawlist().items {
        let ItemKind::RectFill { paints, .. } = &item.kind else {
            continue;
        };
        for paint in paints.iter() {
            let Paint::Image(image) = paint else {
                continue;
            };
            let ResourceRef::Rid(rid) = &image.image else {
                panic!("social-feed image paint did not retain a runtime RID");
            };
            drawn_image_rids.insert(rid.clone());
        }
    }
    assert_eq!(drawn_image_rids, expected_image_rids);
    assert_eq!(surface.canvas().save_count(), 1, "canvas state leaked");
}

/// This is a layout data test, not a visual reftest. One materialized source
/// program is resolved against each viewport; fixed-size post content is
/// expected to clip once the viewport becomes narrower than its anchors.
#[test]
fn social_feed_resolves_one_document_across_the_viewport_matrix() {
    let mut sources = SocialFeedSources::default();
    let output = grida_xml_source::materialize(
        SourceSnapshot::new(ENTRY_ID, SOURCE_BASE, ENTRY_SOURCE),
        &mut sources,
    )
    .expect("the responsive Version 3 social feed materializes once");
    assert_eq!(sources.requests, 1);

    let scene = output.document.get(output.document.root).children[0];
    let [left_rail, stories, timeline, suggestions, messages] =
        output.document.get(scene).children.as_slice()
    else {
        panic!("expected the five responsive scene regions")
    };
    let [_, navigation, rail_footer] = output.document.get(*left_rail).children.as_slice() else {
        panic!("expected the left rail mark, navigation, and footer")
    };
    let posts = &output.document.get(*timeline).children;
    let first_media = output.document.get(posts[0]).children[1];
    let second_media = output.document.get(posts[1]).children[1];
    let first_art = output.document.get(first_media).children[0];
    let second_art = output.document.get(second_media).children[0];

    for (width, height) in [
        (1920.0, 1080.0),
        (1440.0, 900.0),
        (1280.0, 800.0),
        (1024.0, 768.0),
        (768.0, 1024.0),
        (390.0, 844.0),
    ] {
        let resolved = resolve(&output.document, &options_for(width, height));
        assert!(
            resolved.reports.is_empty(),
            "{width}x{height}: {:?}",
            resolved.reports
        );

        let feed_x = width / 2.0 - 340.0;
        assert_eq!(resolved.xywh(scene), (0.0, 0.0, width, height));
        assert_eq!(resolved.xywh(*left_rail), (0.0, 0.0, 480.0, height));
        assert_eq!(
            resolved.xywh(*navigation),
            (24.0, (height - 430.0) / 2.0 - 1.0, 30.0, 430.0)
        );
        assert_eq!(
            resolved.xywh(*rail_footer),
            (24.0, height - 76.0, 30.0, 52.0)
        );
        assert_eq!(
            resolved.xywh(*stories),
            (width / 2.0 - 412.0, 30.0, 612.0, 108.0)
        );
        assert_eq!(resolved.xywh(*timeline), (feed_x, 166.0, 468.0, 1640.0));
        assert_eq!(
            resolved.xywh(*suggestions),
            (width / 2.0 + 300.0, 32.0, 320.0, 500.0)
        );
        assert_eq!(
            resolved.xywh(*messages),
            (width - 260.0, height - 70.0, 220.0, 48.0)
        );

        assert_eq!(resolved.xywh(posts[0]), (0.0, 0.0, 468.0, 780.0));
        assert_eq!(resolved.xywh(posts[1]), (0.0, 800.0, 468.0, 780.0));
        assert_eq!(resolved.xywh(first_media), (0.0, 52.0, 468.0, 585.0));
        assert_eq!(resolved.xywh(second_media), (0.0, 52.0, 468.0, 585.0));
        assert_eq!(
            resolved.world_of(first_art),
            Affine::translate(feed_x, 218.0)
        );
        assert_eq!(
            resolved.world_of(second_art),
            Affine::translate(feed_x, 1018.0)
        );
    }
}
