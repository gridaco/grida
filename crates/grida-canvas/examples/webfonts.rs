use cg::font_loader::FontLoader;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::repository::ResourceRepository;
use cg::webfont_helper::{find_font_files_by_family, load_webfonts_metadata};
use cg::window;
use math2::transform::AffineTransform;

const PARAGRAPH: &str = r#"
This demo showcases how multiple static TTF font files—each representing a different weight or style—can be loaded under the same font family name. It verifies that our system can correctly resolve and apply the appropriate font file when rendering text spans with varying font weights and styles. Each text line uses the same font family (“Albert Sans”) but specifies a different combination of weight and italic flag. If the system behaves correctly, the rendered output should match the intended visual style for each variant, demonstrating accurate font resolution and fallback handling within the shared family context.
"#;

async fn demo_webfonts() -> Scene {
    let nf = NodeFactory::new();

    // Create a heading with Playfair Display
    let mut heading_node = nf.create_text_span_node();
    heading_node.base.name = "Heading".to_string();
    heading_node.transform = AffineTransform::new(50.0, 50.0, 0.0);
    heading_node.size = Size {
        width: 800.0,
        height: 100.0,
    };
    heading_node.text = "Web fonts demo".to_string();
    heading_node.text_style = TextStyle {
        text_decoration: TextDecoration::None,
        font_family: "Playfair Display".to_string(),
        font_size: 64.0,
        font_weight: FontWeight::new(700), // Bold
        letter_spacing: None,
        italic: false,
        line_height: None,
        text_transform: TextTransform::None,
    };
    heading_node.text_align = TextAlign::Left;
    heading_node.text_align_vertical = TextAlignVertical::Top;

    // Create a description paragraph with Playfair Display
    let mut description_node = nf.create_text_span_node();
    description_node.base.name = "Description".to_string();
    description_node.transform = AffineTransform::new(50.0, 120.0, 0.0);
    description_node.size = Size {
        width: 800.0,
        height: 120.0,
    };
    description_node.text = PARAGRAPH.to_string();
    description_node.text_style = TextStyle {
        text_decoration: TextDecoration::None,
        font_family: "Playfair Display".to_string(),
        font_size: 14.0,
        font_weight: FontWeight::new(400), // Regular
        letter_spacing: None,
        italic: false,
        line_height: Some(1.5), // 1.5 line height for better readability
        text_transform: TextTransform::None,
    };
    description_node.text_align = TextAlign::Left;
    description_node.text_align_vertical = TextAlignVertical::Top;

    // Create text nodes for Albert Sans variants
    let mut albert_text_nodes = Vec::new();
    let variants = [
        ("Regular", 400, false),
        ("Thin", 100, false),
        ("ExtraLight", 200, false),
        ("Light", 300, false),
        ("Medium", 500, false),
        ("SemiBold", 600, false),
        ("Bold", 700, false),
        ("ExtraBold", 800, false),
        ("Black", 900, false),
        ("ThinItalic", 100, true),
        ("ExtraLightItalic", 200, true),
        ("LightItalic", 300, true),
        ("MediumItalic", 500, true),
        ("SemiBoldItalic", 600, true),
        ("BoldItalic", 700, true),
        ("ExtraBoldItalic", 800, true),
        ("BlackItalic", 900, true),
    ];

    for (i, (variant, weight, is_italic)) in variants.iter().enumerate() {
        let mut text_node = nf.create_text_span_node();
        text_node.base.name = format!("Albert Sans {}", variant);
        text_node.transform = AffineTransform::new(50.0, 280.0 + (i as f32 * 40.0), 0.0);
        text_node.size = Size {
            width: 800.0,
            height: 40.0,
        };
        text_node.text = format!("AlbertSans {}", variant);
        text_node.text_style = TextStyle {
            text_decoration: TextDecoration::None,
            font_family: "Albert Sans".to_string(),
            font_size: 24.0,
            font_weight: FontWeight::new(*weight),
            letter_spacing: None,
            italic: *is_italic,
            line_height: None,
            text_transform: TextTransform::None,
        };
        text_node.text_align = TextAlign::Left;
        text_node.text_align_vertical = TextAlignVertical::Top;
        albert_text_nodes.push(text_node);
    }

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
    let heading_id = heading_node.base.id.clone();
    let description_id = description_node.base.id.clone();
    let albert_text_ids: Vec<_> = albert_text_nodes
        .iter()
        .map(|n| n.base.id.clone())
        .collect();

    // Add all nodes to the repository
    repository.insert(Node::TextSpan(heading_node));
    repository.insert(Node::TextSpan(description_node));
    for text_node in albert_text_nodes {
        repository.insert(Node::TextSpan(text_node));
    }

    // Set up the root container with all IDs
    let mut children = vec![heading_id, description_id];
    children.extend(albert_text_ids);
    root_container_node.children = children;
    let root_container_id = root_container_node.base.id.clone();
    repository.insert(Node::Container(root_container_node));

    Scene {
        id: "scene".to_string(),
        name: "Webfonts Demo".to_string(),
        transform: AffineTransform::identity(),
        children: vec![root_container_id],
        nodes: repository,
        background_color: Some(Color(250, 250, 250, 255)),
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
    let required_fonts = vec!["Playfair Display", "Albert Sans"]
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
                        .load_font_with_style(
                            &font_file.family,
                            Some(&font_file.style),
                            &font_file.url,
                        )
                        .await;
                    println!(
                        "✅ Font loaded: {} ({})",
                        font_file.family, font_file.postscript_name
                    );
                }
                println!("✅ Scene fonts loading completed in background");
                println!("\n🔍 Font Repository Information:");
                println!("================================");
                println!("All fonts have been loaded and sent to the renderer.");
                println!("Check the console output above for registration messages.");
                println!("The renderer's font repository now contains the loaded fonts.");
            });
        },
    )
    .await;
}
