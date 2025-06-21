use cg::font_loader::FontLoader;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;

const LOREM: &str = r#"
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum sed leo quis orci porta auctor eget nec dui. Nullam egestas tempus sapien quis venenatis. Nullam placerat, elit eu aliquet luctus, risus elit sodales elit, eu iaculis ante lacus nec lacus. Vestibulum eget dolor at orci iaculis malesuada. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Quisque cursus tincidunt accumsan. In hac habitasse platea dictumst. Etiam ultricies laoreet ipsum id pulvinar. Aenean fermentum gravida nisi, et congue lectus interdum et. Cras pellentesque scelerisque quam, ut mollis ligula aliquet ut.

Maecenas convallis nisl non porta consectetur. Nulla scelerisque urna ut massa condimentum hendrerit. Cras eu orci malesuada, ornare est ut, viverra libero. Praesent at turpis ultrices, eleifend leo id, gravida lorem. Aenean eu nunc ac orci aliquam ultricies. Suspendisse mi est, convallis et tincidunt nec, iaculis nec metus. Vestibulum vitae metus nisi. Etiam felis mauris, ullamcorper sed aliquet eu, porttitor eu magna. Vestibulum vel mattis purus, vitae semper tortor. Etiam vestibulum ex id risus viverra vulputate. Aenean euismod lectus tortor, vitae interdum erat blandit sed. Vestibulum accumsan massa vehicula tellus efficitur vehicula. Donec accumsan eget purus sed condimentum. Nunc tempor imperdiet odio a molestie. Phasellus velit nulla, volutpat ac ipsum id, iaculis pretium ipsum.

Cras ac justo iaculis, sollicitudin nisl vel, maximus turpis. Nulla sed nunc elit. Maecenas ultricies auctor mi quis semper. Suspendisse eget rhoncus enim. Morbi tincidunt, urna sed dapibus consequat, ex lorem scelerisque risus, vel auctor libero dui eu diam. Aliquam a rutrum risus. Nunc facilisis, est a rutrum commodo, eros ipsum pulvinar enim, sit amet elementum est dolor quis mi. Nam aliquet, massa eget vestibulum tincidunt, tortor leo dictum arcu, quis eleifend felis ligula in odio. Nullam pharetra mauris ac tortor pharetra ultricies. Aenean in dictum lorem, eu vestibulum libero. Praesent efficitur pretium magna, nec tristique urna condimentum vitae. Aliquam eu nibh quis urna rhoncus porta. Duis lacus leo, tempus ut urna sit amet, dignissim consectetur lorem. Duis luctus scelerisque ultricies. Quisque pharetra feugiat metus in tempor.
"#;

const LOREM_SHORT: &str = r#"Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum sed leo quis orci porta auctor eget nec dui. Nullam egestas tempus sapien quis venenatis. Nullam placerat, elit eu aliquet luctus, risus elit sodales elit, eu iaculis ante lacus nec lacus. Vestibulum eget dolor at orci iaculis malesuada. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Quisque cursus tincidunt accumsan. In hac habitasse platea dictumst. Etiam ultricies laoreet ipsum id pulvinar. Aenean fermentum gravida nisi, et congue lectus interdum et. Cras pellentesque scelerisque quam, ut mollis ligula aliquet ut."#;

async fn demo_texts() -> Scene {
    let nf = NodeFactory::new();

    // Create a single word text span
    let mut word_text_node = nf.create_text_span_node();
    word_text_node.base.name = "Word Text".to_string();
    word_text_node.transform = AffineTransform::new(50.0, 50.0, 0.0);
    word_text_node.size = Size {
        width: 400.0,
        height: 100.0,
    };
    word_text_node.text = "Grida Canvas".to_string();
    word_text_node.text_style = TextStyle {
        text_decoration: TextDecoration::None,
        font_family: "Arial".to_string(),
        font_size: 48.0,
        italic: false,                     // TODO: add italic to text style
        font_weight: FontWeight::new(700), // Bold
        letter_spacing: None,
        line_height: None,
        text_transform: TextTransform::Uppercase,
    };
    word_text_node.stroke = Some(Paint::Solid(SolidPaint {
        color: Color(255, 255, 255, 255),
        opacity: 1.0,
    }));
    word_text_node.stroke_width = Some(1.0);
    word_text_node.text_align = TextAlign::Left;
    word_text_node.text_align_vertical = TextAlignVertical::Top;

    // Create a sentence text span
    let mut sentence_text_node = nf.create_text_span_node();
    sentence_text_node.base.name = "Sentence Text".to_string();
    sentence_text_node.transform = AffineTransform::new(50.0, 150.0, 0.0);
    sentence_text_node.size = Size {
        width: 500.0,
        height: 100.0,
    };
    sentence_text_node.text =
        "Grida Canvas Skia Backend provides accurate rendering of Texts and Text layouts"
            .to_string();
    sentence_text_node.text_style = TextStyle {
        text_decoration: TextDecoration::Underline,
        font_family: "Caveat".to_string(),
        font_size: 32.0,
        italic: false,                     // TODO: add italic to text style
        font_weight: FontWeight::new(400), // Regular
        letter_spacing: None,
        line_height: None,
        text_transform: TextTransform::None,
    };
    sentence_text_node.text_align = TextAlign::Left;
    sentence_text_node.text_align_vertical = TextAlignVertical::Center;

    // Create a paragraph text span
    let mut paragraph_text_node = nf.create_text_span_node();
    paragraph_text_node.base.name = "Paragraph Text".to_string();
    paragraph_text_node.transform = AffineTransform::new(50.0, 250.0, 0.0);
    paragraph_text_node.size = Size {
        width: 800.0,
        height: 300.0,
    };
    paragraph_text_node.text = LOREM.to_string();
    paragraph_text_node.text_style = TextStyle {
        text_decoration: TextDecoration::None,
        font_family: "Arial".to_string(),
        font_size: 16.0,
        italic: false,                     // TODO: add italic to text style
        font_weight: FontWeight::new(400), // Regular
        letter_spacing: None,
        line_height: Some(1.5), // 1.5 line height for better readability
        text_transform: TextTransform::None,
    };
    paragraph_text_node.text_align = TextAlign::Left;
    paragraph_text_node.text_align_vertical = TextAlignVertical::Top;

    // Create a second paragraph text span with different color
    let mut second_paragraph_text_node = nf.create_text_span_node();
    second_paragraph_text_node.base.name = "Second Paragraph Text".to_string();
    second_paragraph_text_node.transform = AffineTransform::new(50.0, 800.0, 0.0);
    second_paragraph_text_node.size = Size {
        width: 800.0,
        height: 300.0,
    };
    second_paragraph_text_node.text = LOREM_SHORT.to_string();
    second_paragraph_text_node.text_style = TextStyle {
        text_decoration: TextDecoration::None,
        font_family: "VT323".to_string(),
        font_size: 16.0,
        italic: false,                     // TODO: add italic to text style
        font_weight: FontWeight::new(400), // Regular
        letter_spacing: None,
        line_height: Some(1.5), // 1.5 line height for better readability
        text_transform: TextTransform::None,
    };
    second_paragraph_text_node.text_align = TextAlign::Left;
    second_paragraph_text_node.text_align_vertical = TextAlignVertical::Top;
    second_paragraph_text_node.fill = Paint::Solid(SolidPaint {
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
    let word_text_id = word_text_node.base.id.clone();
    let sentence_text_id = sentence_text_node.base.id.clone();
    let paragraph_text_id = paragraph_text_node.base.id.clone();
    let second_paragraph_text_id = second_paragraph_text_node.base.id.clone();

    // Add all nodes to the repository
    repository.insert(Node::TextSpan(word_text_node));
    repository.insert(Node::TextSpan(sentence_text_node));
    repository.insert(Node::TextSpan(paragraph_text_node));
    repository.insert(Node::TextSpan(second_paragraph_text_node));

    // Set up the root container with all IDs
    root_container_node.children = vec![
        word_text_id,
        sentence_text_id,
        paragraph_text_id,
        second_paragraph_text_id,
    ];
    let root_container_id = root_container_node.base.id.clone();
    repository.insert(Node::Container(root_container_node));

    Scene {
        id: "scene".to_string(),
        name: "Text Demo".to_string(),
        transform: AffineTransform::identity(),
        children: vec![root_container_id],
        nodes: repository,
        background_color: Some(Color(250, 250, 250, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_texts().await;
    let caveat_font_path = "resources/Caveat-VariableFont_wght.ttf".to_string();
    let vt323_font_path = "resources/VT323-Regular.ttf".to_string();

    window::run_demo_window_with(scene, move |_renderer, _img_tx, font_tx, proxy| {
        println!("📝 Loading fonts asynchronously...");
        let caveat_path = caveat_font_path.clone();
        let vt323_path = vt323_font_path.clone();
        tokio::spawn(async move {
            let mut loader = FontLoader::new_lifecycle(font_tx, proxy);
            loader.load_font("Caveat", &caveat_path).await;
            println!("✅ Font loaded: Caveat");
            loader.load_font("VT323", &vt323_path).await;
            println!("✅ Font loaded: VT323");
        });
    })
    .await;
}
