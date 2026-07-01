//! A/B test bench for image sampling (grida #900) vs pixel preview (#509).
//!
//! Renders a **photo** (image-filled rectangle) next to a **circle** (solid
//! ellipse) so the two features can be told apart interactively:
//!
//! - **Cmd+R** — toggle render intent `Design` (interactive sampling) ↔
//!   `Render` (export/refig, best). Affects the **photo only** — image
//!   sampling. The circle is unchanged.
//! - **Cmd+P** — cycle pixel preview 0 → 1x → 2x → 0. Affects **everything**
//!   (photo *and* circle edges) — this is the orthogonal #509 feature.
//!
//! Zoom out (Cmd+-) to force heavy downscale of the 8k photo (the refig case);
//! zoom in (Cmd+=) to see upscale / pixel-preview blockiness.
//!
//! Run: `cargo run -p grida_dev --example grida_sampling_ab`

use grida::cg::{types::*, *};
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::*;
use grida::resources::{hash_bytes, load_image};
use grida_dev::platform::native_demo;
use math2::{box_fit::BoxFit, transform::AffineTransform};

async fn demo() -> (Scene, Vec<u8>) {
    let nf = NodeFactory::new();

    // Load a real photo (8070x5196) so downscale sampling is exercised.
    // Anchored to the crate dir so it resolves regardless of `cargo run` cwd.
    let photo_path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../fixtures/images/8k.jpg");
    let bytes = load_image(photo_path).await.unwrap();
    let hash_str = format!("{:016x}", hash_bytes(&bytes));
    let url = format!("res://images/{hash_str}");

    // Photo box: display the 8k source in a ~900-wide box (heavy downscale).
    let photo_w = 900.0;
    let photo_h = photo_w * (5196.0 / 8070.0); // preserve aspect

    let mut root = nf.create_container_node();
    root.layout_dimensions.layout_target_width = Some(2000.0);
    root.layout_dimensions.layout_target_height = Some(1000.0);

    // --- Photo (image-filled rectangle) — affected by render intent (Cmd+R) ---
    let mut photo = nf.create_rectangle_node();
    photo.transform = AffineTransform::new(80.0, 80.0, 0.0);
    photo.size = Size {
        width: photo_w,
        height: photo_h,
    };
    photo.set_fill(Paint::Image(ImagePaint {
        image: ResourceRef::RID(url.clone()),
        quarter_turns: 0,
        opacity: 1.0,
        alignement: Alignment::CENTER,
        fit: ImagePaintFit::Fit(BoxFit::Cover),
        blend_mode: BlendMode::Normal,
        active: true,
        filters: ImageFilters::default(),
    }));

    // --- Circle (solid ellipse) — unaffected by intent, affected by preview ---
    let mut circle = nf.create_ellipse_node();
    circle.transform = AffineTransform::new(80.0 + photo_w + 80.0, 80.0, 0.0);
    circle.size = Size {
        width: photo_h,
        height: photo_h,
    };
    circle.fills = Paints::new([Paint::from(CGColor::from_rgba(40, 90, 200, 255))]);

    let mut graph = SceneGraph::new();
    let root_id = graph.append_child(Node::Container(root), Parent::Root);
    graph.append_child(Node::Rectangle(photo), Parent::NodeId(root_id.clone()));
    graph.append_child(Node::Ellipse(circle), Parent::NodeId(root_id));

    let scene = Scene {
        name: "Sampling A/B (photo + circle)".to_string(),
        graph,
        background_color: Some(CGColor::from_rgba(250, 250, 250, 255)),
    };

    (scene, bytes)
}

#[tokio::main]
async fn main() {
    println!("[grida] Cmd+R = render intent (photo only)  |  Cmd+P = pixel preview (all content)");
    let (scene, bytes) = demo().await;
    native_demo::run_demo_window_with(scene, move |renderer, _, _, _| {
        renderer.add_image(&bytes);
    })
    .await;
}
