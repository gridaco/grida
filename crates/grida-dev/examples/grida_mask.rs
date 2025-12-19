use cg::cg::prelude::*; // import style per repo convention [[memory:8559399]]
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use grida_dev::platform::native_demo;
use math2::transform::AffineTransform;

fn build_demo_content(
    nf: &NodeFactory,
    graph: &mut SceneGraph,
    origin: (f32, f32),
    size: (f32, f32),
    parent: Parent,
) -> Vec<NodeId> {
    let (ox, oy) = origin;
    let (w, h) = size;

    // Content A
    let mut a = nf.create_rectangle_node();
    a.transform = AffineTransform::new(ox + 10.0, oy + 10.0, 0.0);
    a.size = Size {
        width: w * 0.6,
        height: h * 0.6,
    };
    a.corner_radius = RectangularCornerRadius::circular(12.0);
    a.set_fill(CGColor::from_rgba(255, 99, 71, 255).into());
    let a_id = graph.append_child(Node::Rectangle(a), parent.clone());

    // Content B
    let mut b = nf.create_rectangle_node();
    b.transform = AffineTransform::new(ox + w * 0.3, oy + h * 0.3, 0.0);
    b.size = Size {
        width: w * 0.6,
        height: h * 0.6,
    };
    b.corner_radius = RectangularCornerRadius::circular(12.0);
    b.set_fill(CGColor::from_rgba(65, 105, 225, 255).into());
    let b_id = graph.append_child(Node::Rectangle(b), parent.clone());

    // Diagonal band (thin rotated rectangle)
    let mut band = nf.create_rectangle_node();
    let band_x = ox + w * 0.05;
    let band_y = oy + h * 0.15;
    let band_w = w * 0.95;
    let band_h = h * 0.2;
    band.transform = AffineTransform::new(band_x + band_w * 0.5, band_y + band_h * 0.5, -10.0);
    band.size = Size {
        width: band_w,
        height: band_h,
    };
    band.corner_radius = RectangularCornerRadius::circular(8.0);
    band.set_fill(CGColor::from_rgba(60, 179, 113, 200).into());
    let band_id = graph.append_child(Node::Rectangle(band), parent.clone());

    vec![a_id, b_id, band_id]
}

fn build_geometry_mask(
    nf: &NodeFactory,
    graph: &mut SceneGraph,
    origin: (f32, f32),
    size: (f32, f32),
    parent: Parent,
) -> NodeId {
    let (ox, oy) = origin;
    let (w, h) = size;
    let radius = (w.min(h)) * 0.4;
    let mut mask = nf.create_ellipse_node();
    mask.transform = AffineTransform::new(ox + w * 0.5 - radius, oy + h * 0.5 - radius, 0.0);
    mask.size = Size {
        width: radius * 2.0,
        height: radius * 2.0,
    };
    mask.set_fill(CGColor::BLACK.into());
    mask.mask = Some(LayerMaskType::Geometry);
    graph.append_child(Node::Ellipse(mask), parent)
}

fn build_alpha_mask(
    nf: &NodeFactory,
    graph: &mut SceneGraph,
    origin: (f32, f32),
    size: (f32, f32),
    parent: Parent,
) -> NodeId {
    let (ox, oy) = origin;
    let (w, h) = size;
    let mut mask = nf.create_rectangle_node();
    mask.transform = AffineTransform::new(ox, oy, 0.0);
    mask.size = Size {
        width: w,
        height: h,
    };
    mask.corner_radius = RectangularCornerRadius::circular(8.0);
    mask.fills = Paints::new([Paint::RadialGradient(RadialGradientPaint {
        transform: AffineTransform::identity(),
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: CGColor::from_rgba(128, 128, 128, 255),
            },
            GradientStop {
                offset: 1.0,
                color: CGColor::from_rgba(128, 128, 128, 0),
            },
        ],
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        active: true,
        ..Default::default()
    })]);
    mask.mask = Some(LayerMaskType::Image(ImageMaskType::Alpha));
    graph.append_child(Node::Rectangle(mask), parent)
}

fn build_luminance_mask(
    nf: &NodeFactory,
    graph: &mut SceneGraph,
    origin: (f32, f32),
    size: (f32, f32),
    parent: Parent,
) -> NodeId {
    let (ox, oy) = origin;
    let (w, h) = size;
    let mut mask = nf.create_rectangle_node();
    mask.transform = AffineTransform::new(ox, oy, 0.0);
    mask.size = Size {
        width: w,
        height: h,
    };
    mask.corner_radius = RectangularCornerRadius::circular(8.0);
    mask.fills = Paints::new([Paint::RadialGradient(RadialGradientPaint {
        transform: AffineTransform::identity(),
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: CGColor::from_rgba(220, 220, 220, 255),
            },
            GradientStop {
                offset: 1.0,
                color: CGColor::from_rgba(40, 40, 40, 255),
            },
        ],
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        active: true,
        ..Default::default()
    })]);
    mask.mask = Some(LayerMaskType::Image(ImageMaskType::Luminance));
    graph.append_child(Node::Rectangle(mask), parent)
}

async fn demo_mask_panels() -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    // Root container
    let mut root = nf.create_container_node();
    let width = 1400.0;
    let height = 400.0;
    root.layout_dimensions.layout_target_width = Some(width);
    root.layout_dimensions.layout_target_height = Some(height);
    root.clip = false;
    root.set_fill(CGColor::WHITE.into());

    let root_id = graph.append_child(Node::Container(root), Parent::Root);

    // Panel layout
    let margin = 20.0;
    let panel_w = (width - 5.0 * margin) / 4.0;
    let panel_h = height - 2.0 * margin;
    let top = margin;
    let mut left = margin;

    let kinds: Vec<Option<LayerMaskType>> = vec![
        None,
        Some(LayerMaskType::Geometry),
        Some(LayerMaskType::Image(ImageMaskType::Alpha)),
        Some(LayerMaskType::Image(ImageMaskType::Luminance)),
    ];

    for kind in kinds {
        // Panel container per kind
        let mut panel = nf.create_container_node();
        panel.position = CGPoint::new(left, top).into();
        panel.rotation = 0.0;
        panel.layout_dimensions.layout_target_width = Some(panel_w);
        panel.layout_dimensions.layout_target_height = Some(panel_h);
        panel.corner_radius = RectangularCornerRadius::circular(6.0);
        panel.set_fill(CGColor::from_rgba(245, 245, 245, 255).into());

        // Add panel to root first
        let panel_id = graph.append_child(Node::Container(panel), Parent::NodeId(root_id.clone()));

        // Build content inside panel
        let _content_ids: Vec<NodeId> = build_demo_content(
            &nf,
            &mut graph,
            (0.0, 0.0),
            (panel_w, panel_h),
            Parent::NodeId(panel_id.clone()),
        );

        // Mask last (topmost) — flat list model: mask consumes preceding siblings
        if let Some(k) = kind {
            let _mask_id = match k {
                LayerMaskType::Geometry => build_geometry_mask(
                    &nf,
                    &mut graph,
                    (0.0, 0.0),
                    (panel_w, panel_h),
                    Parent::NodeId(panel_id.clone()),
                ),
                LayerMaskType::Image(ImageMaskType::Alpha) => build_alpha_mask(
                    &nf,
                    &mut graph,
                    (0.0, 0.0),
                    (panel_w, panel_h),
                    Parent::NodeId(panel_id.clone()),
                ),
                LayerMaskType::Image(ImageMaskType::Luminance) => build_luminance_mask(
                    &nf,
                    &mut graph,
                    (0.0, 0.0),
                    (panel_w, panel_h),
                    Parent::NodeId(panel_id.clone()),
                ),
            };
        }

        left += panel_w + margin;
    }

    Scene {
        name: "Mask Modes Demo".to_string(),
        background_color: None,
        graph,
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_mask_panels().await;
    native_demo::run_demo_window(scene).await; // launches a simple windowed preview [[memory:8559399]]
}
