use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;

async fn demo_lines() -> Scene {
    let nf = NodeFactory::new();

    let mut root = nf.create_container_node();
    root.name = Some("Lines Demo".to_string());
    root.size = Size {
        width: 1000.0,
        height: 600.0,
    };

    let mut repo = NodeRepository::new();
    let mut ids = Vec::new();

    let start_x = 100.0;
    let start_y = 100.0;
    let spacing = 80.0;
    let length = 300.0;

    // Basic horizontal line
    let mut line_basic = nf.create_line_node();
    line_basic.name = Some("Basic".to_string());
    line_basic.transform = AffineTransform::new(start_x, start_y, 0.0);
    line_basic.size = Size {
        width: length,
        height: 0.0,
    };
    line_basic.strokes = vec![Paint::Solid(SolidPaint {
        color: Color(0, 0, 0, 255),
        opacity: 1.0,
    })];
    line_basic.stroke_width = 2.0;
    ids.push(line_basic.id.clone());
    repo.insert(Node::Line(line_basic));

    // Outside aligned thick line
    let mut line_outside = nf.create_line_node();
    line_outside.name = Some("Outside".to_string());
    line_outside.transform = AffineTransform::new(start_x, start_y + spacing, 0.0);
    line_outside.size = Size {
        width: length,
        height: 0.0,
    };
    line_outside.strokes = vec![Paint::Solid(SolidPaint {
        color: Color(255, 0, 0, 255),
        opacity: 1.0,
    })];
    line_outside.stroke_width = 8.0;
    line_outside._data_stroke_align = StrokeAlign::Outside;
    ids.push(line_outside.id.clone());
    repo.insert(Node::Line(line_outside));

    // Dashed line
    let mut line_dashed = nf.create_line_node();
    line_dashed.name = Some("Dashed".to_string());
    line_dashed.transform = AffineTransform::new(start_x, start_y + spacing * 2.0, 0.0);
    line_dashed.size = Size {
        width: length,
        height: 0.0,
    };
    line_dashed.strokes = vec![Paint::Solid(SolidPaint {
        color: Color(0, 0, 255, 255),
        opacity: 1.0,
    })];
    line_dashed.stroke_width = 4.0;
    line_dashed.stroke_dash_array = Some(vec![10.0, 5.0]);
    ids.push(line_dashed.id.clone());
    repo.insert(Node::Line(line_dashed));

    // Gradient stroke line
    let mut line_gradient = nf.create_line_node();
    line_gradient.name = Some("Gradient".to_string());
    line_gradient.transform = AffineTransform::new(start_x, start_y + spacing * 3.0, 0.0);
    line_gradient.size = Size {
        width: length,
        height: 0.0,
    };
    line_gradient.strokes = vec![Paint::LinearGradient(LinearGradientPaint {
        transform: AffineTransform::identity(),
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: Color(0, 255, 0, 255),
            },
            GradientStop {
                offset: 1.0,
                color: Color(255, 0, 255, 255),
            },
        ],
        opacity: 1.0,
    })];
    line_gradient.stroke_width = 6.0;
    ids.push(line_gradient.id.clone());
    repo.insert(Node::Line(line_gradient));

    // Rotated diagonal line
    let mut line_rotated = nf.create_line_node();
    line_rotated.name = Some("Rotated".to_string());
    line_rotated.transform =
        AffineTransform::new(start_x, start_y + spacing * 4.0, 45f32.to_radians());
    line_rotated.size = Size {
        width: length,
        height: 0.0,
    };
    line_rotated.strokes = vec![Paint::Solid(SolidPaint {
        color: Color(0, 128, 128, 255),
        opacity: 1.0,
    })];
    line_rotated.stroke_width = 4.0;
    ids.push(line_rotated.id.clone());
    repo.insert(Node::Line(line_rotated));

    // Set up root container
    root.children = ids;
    let root_id = root.id.clone();
    repo.insert(Node::Container(root));

    Scene {
        id: "scene".to_string(),
        name: "LineNode Demo".to_string(),
        children: vec![root_id],
        nodes: repo,
        background_color: Some(Color(250, 250, 250, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_lines().await;
    window::run_demo_window(scene).await;
}
