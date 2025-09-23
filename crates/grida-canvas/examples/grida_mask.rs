use cg::cg::types::*; // import style per repo convention [[memory:8559399]]
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;

fn build_demo_content(
    nf: &NodeFactory,
    repository: &mut NodeRepository,
    origin: (f32, f32),
    size: (f32, f32),
) -> Vec<NodeId> {
    let (ox, oy) = origin;
    let (w, h) = size;

    // Content A
    let mut a = nf.create_rectangle_node();
    a.name = Some("A".to_string());
    a.transform = AffineTransform::new(ox + 10.0, oy + 10.0, 0.0);
    a.size = Size {
        width: w * 0.6,
        height: h * 0.6,
    };
    a.corner_radius = RectangularCornerRadius::circular(12.0);
    a.set_fill(CGColor(255, 99, 71, 255).into());
    let a_id = a.id.clone();
    repository.insert(Node::Rectangle(a));

    // Content B
    let mut b = nf.create_rectangle_node();
    b.name = Some("B".to_string());
    b.transform = AffineTransform::new(ox + w * 0.3, oy + h * 0.3, 0.0);
    b.size = Size {
        width: w * 0.6,
        height: h * 0.6,
    };
    b.corner_radius = RectangularCornerRadius::circular(12.0);
    b.set_fill(CGColor(65, 105, 225, 255).into());
    let b_id = b.id.clone();
    repository.insert(Node::Rectangle(b));

    // Diagonal band (thin rotated rectangle)
    let mut band = nf.create_rectangle_node();
    band.name = Some("Band".to_string());
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
    band.set_fill(CGColor(60, 179, 113, 200).into());
    let band_id = band.id.clone();
    repository.insert(Node::Rectangle(band));

    vec![a_id, b_id, band_id]
}

fn build_geometry_mask(
    nf: &NodeFactory,
    repository: &mut NodeRepository,
    origin: (f32, f32),
    size: (f32, f32),
) -> NodeId {
    let (ox, oy) = origin;
    let (w, h) = size;
    let radius = (w.min(h)) * 0.4;
    let mut mask = nf.create_ellipse_node();
    mask.name = Some("Mask Geometry".to_string());
    mask.transform = AffineTransform::new(ox + w * 0.5 - radius, oy + h * 0.5 - radius, 0.0);
    mask.size = Size {
        width: radius * 2.0,
        height: radius * 2.0,
    };
    mask.set_fill(CGColor(0, 0, 0, 255).into());
    mask.mask = Some(LayerMaskType::Geometry);
    let id = mask.id.clone();
    repository.insert(Node::Ellipse(mask));
    id
}

fn build_alpha_mask(
    nf: &NodeFactory,
    repository: &mut NodeRepository,
    origin: (f32, f32),
    size: (f32, f32),
) -> NodeId {
    let (ox, oy) = origin;
    let (w, h) = size;
    let mut mask = nf.create_rectangle_node();
    mask.name = Some("Mask Alpha".to_string());
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
                color: CGColor(128, 128, 128, 255),
            },
            GradientStop {
                offset: 1.0,
                color: CGColor(128, 128, 128, 0),
            },
        ],
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        active: true,
    })]);
    mask.mask = Some(LayerMaskType::Image(ImageMaskType::Alpha));
    let id = mask.id.clone();
    repository.insert(Node::Rectangle(mask));
    id
}

fn build_luminance_mask(
    nf: &NodeFactory,
    repository: &mut NodeRepository,
    origin: (f32, f32),
    size: (f32, f32),
) -> NodeId {
    let (ox, oy) = origin;
    let (w, h) = size;
    let mut mask = nf.create_rectangle_node();
    mask.name = Some("Mask Luminance".to_string());
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
                color: CGColor(220, 220, 220, 255),
            },
            GradientStop {
                offset: 1.0,
                color: CGColor(40, 40, 40, 255),
            },
        ],
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        active: true,
    })]);
    mask.mask = Some(LayerMaskType::Image(ImageMaskType::Luminance));
    let id = mask.id.clone();
    repository.insert(Node::Rectangle(mask));
    id
}

async fn demo_mask_panels() -> Scene {
    let nf = NodeFactory::new();
    let mut repository = NodeRepository::new();

    // Root container
    let mut root = nf.create_container_node();
    root.name = Some("Mask Modes Demo".to_string());
    let width = 1400.0;
    let height = 400.0;
    root.size = Size { width, height };
    root.clip = false;
    root.set_fill(CGColor(255, 255, 255, 255).into());

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

    let mut root_children = Vec::new();

    for kind in kinds {
        // Panel container per kind
        let mut panel = nf.create_container_node();
        panel.name = Some("Panel".to_string());
        panel.transform = AffineTransform::new(left, top, 0.0);
        panel.size = Size {
            width: panel_w,
            height: panel_h,
        };
        panel.corner_radius = RectangularCornerRadius::circular(6.0);
        panel.set_fill(CGColor(245, 245, 245, 255).into());

        // Build children inside panel
        let mut children: Vec<NodeId> = Vec::new();

        // Content first
        let mut content_ids =
            build_demo_content(&nf, &mut repository, (0.0, 0.0), (panel_w, panel_h));
        children.append(&mut content_ids);

        // Mask last (topmost) — flat list model: mask consumes preceding siblings
        if let Some(k) = kind {
            let mask_id = match k {
                LayerMaskType::Geometry => {
                    build_geometry_mask(&nf, &mut repository, (0.0, 0.0), (panel_w, panel_h))
                }
                LayerMaskType::Image(ImageMaskType::Alpha) => {
                    build_alpha_mask(&nf, &mut repository, (0.0, 0.0), (panel_w, panel_h))
                }
                LayerMaskType::Image(ImageMaskType::Luminance) => {
                    build_luminance_mask(&nf, &mut repository, (0.0, 0.0), (panel_w, panel_h))
                }
            };
            children.push(mask_id);
        }

        panel.children = children;
        let panel_id = panel.id.clone();
        repository.insert(Node::Container(panel));
        root_children.push(panel_id);

        left += panel_w + margin;
    }

    root.children = root_children;
    let root_id = root.id.clone();
    repository.insert(Node::Container(root));

    Scene {
        id: "scene".to_string(),
        name: "Mask Modes Demo".to_string(),
        children: vec![root_id],
        nodes: repository,
        background_color: None,
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_mask_panels().await;
    window::run_demo_window(scene).await; // launches a simple windowed preview [[memory:8559399]]
}
