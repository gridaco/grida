use cg::cg::prelude::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::resources::hash_bytes;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer, RendererOptions};
use math2::{box_fit::BoxFit, rect::Rectangle, transform::AffineTransform};
use skia_safe as sk;

const IMAGE_DATA: &[u8] = include_bytes!("../../../fixtures/images/4k.jpg");

/// Demonstrates film grain / noise texture applied to an image
///
/// Shows a realistic use case of applying fine grain texture to a photograph,
/// simulating analog film characteristics.
fn main() {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    // Decode the image to get its dimensions
    let image =
        sk::Image::from_encoded(sk::Data::new_copy(IMAGE_DATA)).expect("Failed to decode image");
    let img_width = image.width() as f32;
    let img_height = image.height() as f32;

    // Generate hash for the image
    let hash = hash_bytes(IMAGE_DATA);
    let hash_str = format!("{:016x}", hash);
    let url = format!("res://images/{}", hash_str);

    // Left: Original image (no noise) - left-aligned to show left portion
    let mut rect_original = nf.create_rectangle_node();
    rect_original.transform = AffineTransform::new(0.0, 0.0, 0.0);
    rect_original.size = Size {
        width: img_width / 2.0,
        height: img_height,
    };
    rect_original.fills = Paints::new([Paint::Image(ImagePaint {
        active: true,
        image: ResourceRef::RID(url.clone()),
        quarter_turns: 0,
        alignement: Alignment::CENTER_LEFT, // Left-aligned
        fit: ImagePaintFit::Fit(BoxFit::Cover),
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        filters: ImageFilters::default(),
    })]);

    // Right: Image with film grain - right-aligned to show right portion
    let mut rect_grain = nf.create_rectangle_node();
    rect_grain.transform = AffineTransform::new(img_width / 2.0, 0.0, 0.0);
    rect_grain.size = Size {
        width: img_width / 2.0,
        height: img_height,
    };
    rect_grain.fills = Paints::new([Paint::Image(ImagePaint {
        active: true,
        image: ResourceRef::RID(url.clone()),
        quarter_turns: 0,
        alignement: Alignment::CENTER_RIGHT, // Right-aligned
        fit: ImagePaintFit::Fit(BoxFit::Cover),
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        filters: ImageFilters::default(),
    })]);

    // Apply fine film grain with small size and high density
    rect_grain.effects.noises.push(NoiseEffect {
        noise_size: 2.0, // Very small grain size for fine texture
        density: 1.0,    // High density for prominent grain
        num_octaves: 6,  // Many octaves for detailed texture
        seed: 42.0,
        coloring: NoiseEffectColors::Mono {
            color: CGColor(0, 0, 0, 100),
        },
        active: true,
        blend_mode: BlendMode::Normal,
    });

    graph.append_children(
        vec![Node::Rectangle(rect_original), Node::Rectangle(rect_grain)],
        Parent::Root,
    );

    let scene = Scene {
        name: "Film Grain Effect".into(),
        graph,
        background_color: Some(CGColor(255, 255, 255, 255)),
    };

    // Render the scene
    let width = img_width;
    let height = img_height;

    let mut renderer = Renderer::new_with_options(
        Backend::new_from_raster(width as i32, height as i32),
        None,
        Camera2D::new_from_bounds(Rectangle::from_xywh(0.0, 0.0, width, height)),
        RendererOptions {
            use_embedded_fonts: true,
        },
    );

    // Add the image to the renderer
    renderer.add_image(IMAGE_DATA);

    renderer.load_scene(scene);

    let surface = unsafe { &mut *renderer.backend.get_surface() };
    let canvas = surface.canvas();
    renderer.render_to_canvas(canvas, width, height);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, sk::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write(
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/goldens/grain_noise_effect.png"
        ),
        data.as_bytes(),
    )
    .unwrap();

    println!("✓ Generated film grain before/after comparison");
    println!("  - Left: Original image (no grain)");
    println!("  - Right: With film grain (noise_size: 0.3, density: 0.8, 6 octaves)");
    println!("✓ Saved: goldens/grain_noise_effect.png");

    renderer.free();
}
