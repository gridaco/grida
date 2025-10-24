use cg::cg::types::*;
use cg::helpers::webfont_helper::{find_font_files_by_family, load_webfonts_metadata};
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::resources::{load_font, FontMessage};
use cg::window;
use cg::window::application::HostEvent;
use futures::future::join_all;
use math2::transform::AffineTransform;

const PARAGRAPH: &str = r#"
This demo showcases how multiple static TTF font files—each representing a different weight or style—can be loaded under the same font family name. It verifies that our system can correctly resolve and apply the appropriate font file when rendering text spans with varying font weights and styles. Each text line uses the same font family (“Albert Sans”) but specifies a different combination of weight and italic flag. If the system behaves correctly, the rendered output should match the intended visual style for each variant, demonstrating accurate font resolution and fallback handling within the shared family context.
"#;

async fn demo_webfonts() -> Scene {
    let nf = NodeFactory::new();

    // Create a heading with Playfair Display
    let mut heading_node = nf.create_text_span_node();
    heading_node.transform = AffineTransform::new(50.0, 50.0, 0.0);
    heading_node.width = Some(800.0);
    heading_node.text = "Web fonts demo".to_string();
    heading_node.text_style = TextStyleRec {
        text_decoration: None,
        font_family: "Playfair Display".to_string(),
        font_size: 64.0,
        font_weight: FontWeight::BOLD700,
        font_width: None,
        font_kerning: true,
        font_features: None,
        font_variations: None,
        font_optical_sizing: Default::default(),
        letter_spacing: Default::default(),
        word_spacing: Default::default(),
        font_style_italic: false,
        line_height: Default::default(),
        text_transform: TextTransform::None,
    };
    heading_node.text_align = TextAlign::Left;
    heading_node.text_align_vertical = TextAlignVertical::Top;

    // Create a description paragraph with Playfair Display
    let mut description_node = nf.create_text_span_node();
    description_node.transform = AffineTransform::new(50.0, 120.0, 0.0);
    description_node.width = Some(800.0);
    description_node.text = PARAGRAPH.to_string();
    description_node.text_style = TextStyleRec {
        text_decoration: None,
        font_family: "Playfair Display".to_string(),
        font_size: 14.0,
        font_weight: Default::default(),
        font_width: None,
        font_kerning: true,
        font_features: None,
        font_variations: None,
        font_optical_sizing: Default::default(),
        letter_spacing: Default::default(),
        word_spacing: Default::default(),
        font_style_italic: false,
        line_height: TextLineHeight::Factor(1.5),
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
        text_node.transform = AffineTransform::new(50.0, 280.0 + (i as f32 * 40.0), 0.0);
        text_node.width = Some(800.0);
        text_node.text = format!("AlbertSans {}", variant);
        text_node.text_style = TextStyleRec {
            text_decoration: None,
            font_family: "Albert Sans".to_string(),
            font_size: 24.0,
            font_weight: FontWeight::new(*weight),
            font_width: None,
            font_kerning: true,
            font_features: None,
            font_variations: None,
            font_optical_sizing: Default::default(),
            letter_spacing: Default::default(),
            word_spacing: Default::default(),
            font_style_italic: *is_italic,
            line_height: Default::default(),
            text_transform: TextTransform::None,
        };
        text_node.text_align = TextAlign::Left;
        text_node.text_align_vertical = TextAlignVertical::Top;
        albert_text_nodes.push(text_node);
    }

    // Create a root container node
    let mut root_container_node = nf.create_container_node();
    root_container_node.layout_dimensions.width = Some(1080.0);
    root_container_node.layout_dimensions.height = Some(1080.0);

    // Create a node repository and add all nodes
    let mut graph = SceneGraph::new();

    // Add root container first
    let root_container_id = graph.append_child(Node::Container(root_container_node), Parent::Root);

    // Add all text nodes to root container
    graph.append_child(
        Node::TextSpan(heading_node),
        Parent::NodeId(root_container_id.clone()),
    );
    graph.append_child(
        Node::TextSpan(description_node),
        Parent::NodeId(root_container_id.clone()),
    );
    for text_node in albert_text_nodes {
        graph.append_child(
            Node::TextSpan(text_node),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    Scene {
        name: "Webfonts Demo".to_string(),
        background_color: Some(CGColor(250, 250, 250, 255)),
        graph,
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
            println!("🔄 Starting to load scene fonts in background...");
            let font_files = font_files_clone.clone();
            let font_tx = font_tx.clone();
            let proxy = proxy.clone();
            tokio::spawn(async move {
                let futures: Vec<_> = font_files
                    .into_iter()
                    .map(|font_file| {
                        let font_tx = font_tx.clone();
                        let proxy = proxy.clone();
                        async move {
                            let family = font_file.family;
                            let style = font_file.style;
                            let url = font_file.url;
                            let postscript_name = font_file.postscript_name;
                            println!("Loading font: {} ({})", family, postscript_name);
                            if let Ok(data) = load_font(&url).await {
                                let msg = FontMessage {
                                    family: family.clone(),
                                    style: Some(style.clone()),
                                    data: data.clone(),
                                };
                                let _ = font_tx.unbounded_send(msg.clone());
                                let _ = proxy.send_event(HostEvent::FontLoaded(msg));
                                println!("✅ Font loaded: {} ({})", family, postscript_name);
                            }
                        }
                    })
                    .collect();
                join_all(futures).await;
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
