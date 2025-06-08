use cg::factory::NodeFactory;
use cg::font_loader::FontLoader;
use cg::repository::NodeRepository;
use cg::schema::*;
use cg::webfont_helper::{find_font_files_by_family, load_webfonts_metadata};
use grida_cmath::transform::AffineTransform;

mod window;

const LOREM: &str = r#"
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum sed leo quis orci porta auctor eget nec dui. Nullam egestas tempus sapien quis venenatis. Nullam placerat, elit eu aliquet luctus, risus elit sodales elit, eu iaculis ante lacus nec lacus. Vestibulum eget dolor at orci iaculis malesuada. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Quisque cursus tincidunt accumsan. In hac habitasse platea dictumst. Etiam ultricies laoreet ipsum id pulvinar. Aenean fermentum gravida nisi, et congue lectus interdum et. Cras pellentesque scelerisque quam, ut mollis ligula aliquet ut.
"#;

async fn demo_webfonts() -> Scene {
    let nf = NodeFactory::new();

    // Create a background rectangle node
    let mut background_rect_node = nf.create_rectangle_node();
    background_rect_node.base.name = "Background Rect".to_string();
    background_rect_node.size = Size {
        width: 1080.0,
        height: 1080.0,
    };
    background_rect_node.fill = Paint::Solid(SolidPaint {
        color: Color(230, 240, 255, 255), // Light blue background
        opacity: 1.0,
    });

    // Create a text span with Playfair Display (elegant serif)
    let mut playfair_text_node = nf.create_text_span_node();
    playfair_text_node.base.name = "Playfair Display Text".to_string();
    playfair_text_node.transform = AffineTransform::new(50.0, 50.0, 0.0);
    playfair_text_node.size = Size {
        width: 400.0,
        height: 100.0,
    };
    playfair_text_node.text = "Playfair Display".to_string();
    playfair_text_node.text_style = TextStyle {
        text_decoration: TextDecoration::None,
        font_family: "Playfair Display".to_string(),
        font_size: 48.0,
        font_weight: FontWeight::new(700), // Bold
        letter_spacing: None,
        line_height: None,
        text_transform: TextTransform::None,
    };
    playfair_text_node.text_align = TextAlign::Left;
    playfair_text_node.text_align_vertical = TextAlignVertical::Top;

    // Create a text span with Space Mono (monospace)
    let mut spacemono_text_node = nf.create_text_span_node();
    spacemono_text_node.base.name = "Space Mono Text".to_string();
    spacemono_text_node.transform = AffineTransform::new(50.0, 150.0, 0.0);
    spacemono_text_node.size = Size {
        width: 500.0,
        height: 100.0,
    };
    spacemono_text_node.text = "Space Mono".to_string();
    spacemono_text_node.text_style = TextStyle {
        text_decoration: TextDecoration::Underline,
        font_family: "Space Mono".to_string(),
        font_size: 32.0,
        font_weight: FontWeight::new(400), // Regular
        letter_spacing: None,
        line_height: None,
        text_transform: TextTransform::None,
    };
    spacemono_text_node.text_align = TextAlign::Left;
    spacemono_text_node.text_align_vertical = TextAlignVertical::Center;

    // Create a text span with Dancing Script (handwriting)
    let mut dancing_text_node = nf.create_text_span_node();
    dancing_text_node.base.name = "Dancing Script Text".to_string();
    dancing_text_node.transform = AffineTransform::new(50.0, 250.0, 0.0);
    dancing_text_node.size = Size {
        width: 800.0,
        height: 300.0,
    };
    dancing_text_node.text = LOREM.to_string();
    dancing_text_node.text_style = TextStyle {
        text_decoration: TextDecoration::None,
        font_family: "Dancing Script".to_string(),
        font_size: 24.0,
        font_weight: FontWeight::new(400), // Regular
        letter_spacing: None,
        line_height: Some(1.5), // 1.5 line height for better readability
        text_transform: TextTransform::None,
    };
    dancing_text_node.text_align = TextAlign::Left;
    dancing_text_node.text_align_vertical = TextAlignVertical::Top;

    // Create a text span with Montserrat (modern sans-serif)
    let mut montserrat_text_node = nf.create_text_span_node();
    montserrat_text_node.base.name = "Montserrat Text".to_string();
    montserrat_text_node.transform = AffineTransform::new(50.0, 600.0, 0.0);
    montserrat_text_node.size = Size {
        width: 800.0,
        height: 300.0,
    };
    montserrat_text_node.text = LOREM.to_string();
    montserrat_text_node.text_style = TextStyle {
        text_decoration: TextDecoration::None,
        font_family: "Montserrat".to_string(),
        font_size: 16.0,
        font_weight: FontWeight::new(400), // Regular
        letter_spacing: None,
        line_height: Some(1.5), // 1.5 line height for better readability
        text_transform: TextTransform::None,
    };
    montserrat_text_node.text_align = TextAlign::Left;
    montserrat_text_node.text_align_vertical = TextAlignVertical::Top;
    montserrat_text_node.fill = Paint::Solid(SolidPaint {
        color: Color(70, 130, 180, 255), // Steel blue color
        opacity: 1.0,
    });

    // Create a root container node
    let mut root_container_node = nf.create_container_node();
    root_container_node.base.name = "Root Container".to_string();
    root_container_node.size = Size {
        width: 1080.0,
        height: 1080.0,
    };

    // Create a node repository and add all nodes
    let mut repository = NodeRepository::new();

    // Collect all the IDs
    let background_rect_id = background_rect_node.base.id.clone();
    let playfair_text_id = playfair_text_node.base.id.clone();
    let spacemono_text_id = spacemono_text_node.base.id.clone();
    let dancing_text_id = dancing_text_node.base.id.clone();
    let montserrat_text_id = montserrat_text_node.base.id.clone();

    // Add all nodes to the repository
    repository.insert(Node::Rectangle(background_rect_node));
    repository.insert(Node::TextSpan(playfair_text_node));
    repository.insert(Node::TextSpan(spacemono_text_node));
    repository.insert(Node::TextSpan(dancing_text_node));
    repository.insert(Node::TextSpan(montserrat_text_node));

    // Set up the root container with all IDs
    root_container_node.children = vec![
        background_rect_id,
        playfair_text_id,
        spacemono_text_id,
        dancing_text_id,
        montserrat_text_id,
    ];
    let root_container_id = root_container_node.base.id.clone();
    repository.insert(Node::Container(root_container_node));

    Scene {
        id: "scene".to_string(),
        name: "Webfonts Demo".to_string(),
        transform: AffineTransform::identity(),
        children: vec![root_container_id],
        nodes: repository,
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_webfonts().await;

    // Load webfonts metadata and find matching font files
    let webfonts_metadata = load_webfonts_metadata()
        .await
        .expect("Failed to load webfonts metadata");

    // Get the fonts we need for this demo
    let required_fonts = vec![
        "Playfair Display",
        "Space Mono",
        "Dancing Script",
        "Montserrat",
    ]
    .into_iter()
    .map(|s| s.to_string())
    .collect::<Vec<String>>();
    let font_files = find_font_files_by_family(&webfonts_metadata, &required_fonts);

    println!("\nFound {} matching font files:", font_files.len());
    for font_file in &font_files {
        println!("Font: {} ({})", font_file.family, font_file.postscript_name);
        println!("  Style: {}", font_file.style);
        println!("  URL: {}", font_file.url);
        println!();
    }

    // Clone the scene before passing it to run_demo_window_with
    let scene_for_window = scene.clone();
    let font_files_clone = font_files.clone();

    window::run_demo_window_with(
        scene_for_window,
        move |_renderer, _img_tx, font_tx, proxy| {
            println!("📝 Initializing font loader...");
            let mut font_loader = FontLoader::new_lifecycle(font_tx, proxy);

            // Load all fonts in the scene - non-blocking
            println!("🔄 Starting to load scene fonts in background...");
            let font_files = font_files_clone.clone();
            tokio::spawn(async move {
                for font_file in font_files {
                    println!(
                        "Loading font: {} ({})",
                        font_file.family, font_file.postscript_name
                    );
                    font_loader
                        .load_font(&font_file.family, &font_file.url)
                        .await;
                    println!(
                        "✅ Font loaded: {} ({})",
                        font_file.family, font_file.postscript_name
                    );
                }
                println!("✅ Scene fonts loading completed in background");
            });
        },
    )
    .await;
}
