use cg::cg::prelude::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::resources::{load_font, FontMessage};
use cg::window;
use cg::window::application::HostEvent;
use math2::transform::AffineTransform;

#[path = "../tests/fonts.rs"]
mod fonts;

const LOREM: &str = r#"Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum sed leo quis orci porta auctor eget nec dui. Nullam egestas tempus sapien quis venenatis. Nullam placerat, elit eu aliquet luctus, risus elit sodales elit, eu iaculis ante lacus nec lacus. Vestibulum eget dolor at orci iaculis malesuada. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Quisque cursus tincidunt accumsan. In hac habitasse platea dictumst. Etiam ultricies laoreet ipsum id pulvinar. Aenean fermentum gravida nisi, et congue lectus interdum et. Cras pellentesque scelerisque quam, ut mollis ligula aliquet ut.

Maecenas convallis nisl non porta consectetur. Nulla scelerisque urna ut massa condimentum hendrerit. Cras eu orci malesuada, ornare est ut, viverra libero. Praesent at turpis ultrices, eleifend leo id, gravida lorem. Aenean eu nunc ac orci aliquam ultricies. Suspendisse mi est, convallis et tincidunt nec, iaculis nec metus. Vestibulum vitae metus nisi. Etiam felis mauris, ullamcorper sed aliquet eu, porttitor eu magna. Vestibulum vel mattis purus, vitae semper tortor. Etiam vestibulum ex id risus viverra vulputate. Aenean euismod lectus tortor, vitae interdum erat blandit sed. Vestibulum accumsan massa vehicula tellus efficitur vehicula. Donec accumsan eget purus sed condimentum. Nunc tempor imperdiet odio a molestie. Phasellus velit nulla, volutpat ac ipsum id, iaculis pretium ipsum.

Cras ac justo iaculis, sollicitudin nisl vel, maximus turpis. Nulla sed nunc elit. Maecenas ultricies auctor mi quis semper. Suspendisse eget rhoncus enim. Morbi tincidunt, urna sed dapibus consequat, ex lorem scelerisque risus, vel auctor libero dui eu diam. Aliquam a rutrum risus. Nunc facilisis, est a rutrum commodo, eros ipsum pulvinar enim, sit amet elementum est dolor quis mi. Nam aliquet, massa eget vestibulum tincidunt, tortor leo dictum arcu, quis eleifend felis ligula in odio. Nullam pharetra mauris ac tortor pharetra ultricies. Aenean in dictum lorem, eu vestibulum libero. Praesent efficitur pretium magna, nec tristique urna condimentum vitae. Aliquam eu nibh quis urna rhoncus porta. Duis lacus leo, tempus ut urna sit amet, dignissim consectetur lorem. Duis luctus scelerisque ultricies. Quisque pharetra feugiat metus in tempor."#;

const LOREM_SHORT: &str = r#"Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum sed leo quis orci porta auctor eget nec dui. Nullam egestas tempus sapien quis venenatis. Nullam placerat, elit eu aliquet luctus, risus elit sodales elit, eu iaculis ante lacus nec lacus. Vestibulum eget dolor at orci iaculis malesuada. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Quisque cursus tincidunt accumsan. In hac habitasse platea dictumst. Etiam ultricies laoreet ipsum id pulvinar. Aenean fermentum gravida nisi, et congue lectus interdum et. Cras pellentesque scelerisque quam, ut mollis ligula aliquet ut."#;

fn write_temp_font(name: &str, data: &[u8]) -> String {
    let path = std::env::temp_dir().join(format!("{}_fixture.ttf", name));
    std::fs::write(&path, data).expect("write temp font");
    path.to_string_lossy().into_owned()
}

async fn demo_texts() -> Scene {
    let nf = NodeFactory::new();

    // Create a single word text span
    let mut word_text_node = nf.create_text_span_node();
    word_text_node.transform = AffineTransform::new(50.0, 50.0, 0.0);
    word_text_node.text = "Grida Canvas".to_string();
    word_text_node.text_style = TextStyleRec {
        text_decoration: None,
        font_family: "Geist".to_string(),
        font_size: 48.0,
        font_style_italic: false, // TODO: add italic to text style
        font_weight: FontWeight::BOLD700,
        font_width: None,
        font_kerning: true,
        font_features: None,
        font_variations: None,
        font_optical_sizing: Default::default(),
        letter_spacing: Default::default(),
        word_spacing: Default::default(),
        line_height: Default::default(),
        text_transform: TextTransform::Uppercase,
    };
    word_text_node.strokes = Paints::new([Paint::from(CGColor(255, 255, 255, 255))]);
    word_text_node.fills = Paints::new([Paint::LinearGradient(LinearGradientPaint::from_colors(
        vec![CGColor(255, 255, 255, 255), CGColor(0, 0, 0, 255)],
    ))]);
    word_text_node.stroke_width = 1.0;
    word_text_node.text_align = TextAlign::Left;
    word_text_node.text_align_vertical = TextAlignVertical::Top;

    // Create a sentence text span
    let mut sentence_text_node = nf.create_text_span_node();
    sentence_text_node.transform = AffineTransform::new(50.0, 150.0, 0.0);
    sentence_text_node.text =
        "Grida Canvas Skia Backend provides\nAccurate rendering of Texts and Text layouts"
            .to_string();
    sentence_text_node.text_style = TextStyleRec::from_font("Caveat", 32.0);
    sentence_text_node.text_align = TextAlign::Left;
    sentence_text_node.text_align_vertical = TextAlignVertical::Center;

    // Create a paragraph text span
    let mut paragraph_text_node = nf.create_text_span_node();
    paragraph_text_node.transform = AffineTransform::new(50.0, 250.0, 0.0);
    paragraph_text_node.width = Some(800.0);
    paragraph_text_node.max_lines = Some(14);
    paragraph_text_node.text = LOREM.to_string();
    paragraph_text_node.text_style = TextStyleRec::from_font("Caveat", 16.0);
    paragraph_text_node.text_align = TextAlign::Left;
    paragraph_text_node.text_align_vertical = TextAlignVertical::Top;

    // Create a second paragraph text span with different color
    let mut second_paragraph_text_node = nf.create_text_span_node();
    second_paragraph_text_node.transform = AffineTransform::new(50.0, 800.0, 0.0);
    second_paragraph_text_node.width = Some(800.0);
    second_paragraph_text_node.text = LOREM_SHORT.to_string();
    second_paragraph_text_node.text_style = TextStyleRec::from_font("VT323", 16.0);
    second_paragraph_text_node.text_align = TextAlign::Left;
    second_paragraph_text_node.text_align_vertical = TextAlignVertical::Top;
    second_paragraph_text_node.fills = Paints::new([Paint::from(CGColor(70, 130, 180, 255))]);

    // Create a blurry text span with the commented style
    let mut blurry_text_node = nf.create_text_span_node();
    blurry_text_node.transform = AffineTransform::new(50.0, 1000.0, 0.0);
    blurry_text_node.text = "This text has a blur effect applied".to_string();
    blurry_text_node.text_style = TextStyleRec::from_font("Geist", 40.0);
    blurry_text_node.text_align = TextAlign::Left;
    blurry_text_node.text_align_vertical = TextAlignVertical::Top;
    blurry_text_node.fills = Paints::new([Paint::from(CGColor(100, 100, 100, 255))]);
    blurry_text_node.effects = LayerEffects::new().blur(4.0f32);

    // Create a root container node
    let mut root_container_node = nf.create_container_node();
    root_container_node.layout_dimensions.width = Some(1080.0);
    root_container_node.layout_dimensions.height = Some(1080.0);

    // Create a node repository and add all nodes
    let mut graph = SceneGraph::new();

    // Add root container first
    let root_container_id = graph.append_child(Node::Container(root_container_node), Parent::Root);

    // Add all text nodes to the root container
    graph.append_children(
        vec![
            Node::TextSpan(word_text_node),
            Node::TextSpan(sentence_text_node),
            Node::TextSpan(paragraph_text_node),
            Node::TextSpan(second_paragraph_text_node),
            Node::TextSpan(blurry_text_node),
        ],
        Parent::NodeId(root_container_id),
    );

    Scene {
        name: "Text Demo".to_string(),
        background_color: Some(CGColor(250, 250, 250, 255)),
        graph,
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_texts().await;
    let caveat_font_path = write_temp_font("Caveat", fonts::CAVEAT_VF);
    let vt323_font_path = write_temp_font("VT323", fonts::VT323_REGULAR);

    window::run_demo_window_with(scene, move |_renderer, _img_tx, font_tx, proxy| {
        println!("📝 Loading fonts asynchronously...");
        let caveat_path = caveat_font_path.clone();
        let vt323_path = vt323_font_path.clone();
        tokio::spawn(async move {
            if let Ok(data) = load_font(&caveat_path).await {
                let msg = FontMessage {
                    family: "Caveat".to_string(),
                    style: None,
                    data: data.clone(),
                };
                let _ = font_tx.unbounded_send(msg.clone());
                let _ = proxy.send_event(HostEvent::FontLoaded(msg));
                println!("✅ Font loaded: Caveat");
            }
            if let Ok(data) = load_font(&vt323_path).await {
                let msg = FontMessage {
                    family: "VT323".to_string(),
                    style: None,
                    data: data.clone(),
                };
                let _ = font_tx.unbounded_send(msg.clone());
                let _ = proxy.send_event(HostEvent::FontLoaded(msg));
                println!("✅ Font loaded: VT323");
            }
        });
    })
    .await;
}
