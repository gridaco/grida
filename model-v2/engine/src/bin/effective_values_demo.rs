//! Visual proof of the pre-animation value seam.
//!
//! One Version 4 Grida XML source program is materialized once, then painted
//! twice: first from authored values and then from an immutable `ValueView`.
//! There is deliberately no clock, timeline, keyframe, or playback state.

use anchor_engine::damage::diff_frame;
use anchor_engine::frame;
use anchor_engine::paint::PaintCtx;
use anchor_lab::grida_xml_source::{
    self, AuthoredMemberId, MaterializedProgram, SourceProvider, SourceSnapshot,
};
use anchor_lab::math::Affine;
use anchor_lab::model::{
    Alignment, Color, GradientStop, LinearGradientPaint, Paint, Paints, Payload,
    RadialGradientPaint, RectangularCornerRadius, Stroke, StrokeAlign, StrokeWidth,
};
use anchor_lab::properties::{
    PropertyKey, PropertyTarget, PropertyValue, PropertyValues, ValueView,
};
use anchor_lab::resolve::ResolveOptions;
use skia_safe::{surfaces, EncodedImageFormat, Font, Paint as SkPaint};

const SOURCE: &str = include_str!("../../rig/fixtures/durable-addressing.grida.xml");
const INTER: &[u8] =
    include_bytes!("../../../../fixtures/fonts/Inter/Inter-VariableFont_opsz,wght.ttf");
const SCENE_WIDTH: f32 = 352.0;
const SCENE_HEIGHT: f32 = 224.0;
const SCALE: f32 = 1.45;

struct NoDependencies;

impl SourceProvider for NoDependencies {
    fn resolve(
        &mut self,
        _containing: &SourceSnapshot,
        location: &str,
    ) -> Result<SourceSnapshot, String> {
        Err(format!("unexpected external source `{location}`"))
    }
}

fn color(hex: &str) -> Color {
    Color::from_hex(hex).expect("demo colors are valid")
}

fn linear(from: &str, to: &str) -> Paints {
    Paints::new([Paint::LinearGradient(LinearGradientPaint {
        xy1: Alignment::from_uv(0.0, 0.0),
        xy2: Alignment::from_uv(1.0, 1.0),
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: color(from),
            },
            GradientStop {
                offset: 1.0,
                color: color(to),
            },
        ],
        ..Default::default()
    })])
}

fn radial(inner: &str, outer: &str) -> Paints {
    Paints::new([Paint::RadialGradient(RadialGradientPaint {
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: color(inner),
            },
            GradientStop {
                offset: 1.0,
                color: color(outer),
            },
        ],
        ..Default::default()
    })])
}

fn box_stroke(hex: &str, width: f32, align: StrokeAlign) -> Stroke {
    let payload = Payload::Frame {
        layout: Default::default(),
        clips_content: false,
    };
    let mut stroke = Stroke::default_for(&payload).expect("frames accept strokes");
    stroke.paints = Paints::solid(color(hex));
    stroke.width = StrokeWidth::Uniform(width);
    stroke.align = align;
    stroke
}

fn node(
    program: &MaterializedProgram,
    member: AuthoredMemberId,
    use_id: Option<&str>,
) -> anchor_lab::model::NodeKey {
    program
        .addresses()
        .find(|(address, _)| {
            address.member.id == member
                && match use_id {
                    Some(id) => address
                        .use_path
                        .iter()
                        .any(|occurrence| occurrence.id == id),
                    None => true,
                }
        })
        .map(|(_, node)| node)
        .expect("fixture member occurrence exists")
}

fn target(
    node: anchor_lab::model::NodeKey,
    property: PropertyKey,
    value: PropertyValue,
) -> (PropertyTarget, PropertyValue) {
    (PropertyTarget::new(node, property), value)
}

fn effective_values(program: &MaterializedProgram) -> PropertyValues {
    let directory = node(program, AuthoredMemberId::Id("directory".into()), None);
    let first_card = node(program, AuthoredMemberId::ComponentRoot, Some("first-card"));
    let second_card = node(
        program,
        AuthoredMemberId::ComponentRoot,
        Some("second-card"),
    );
    let first_avatar = node(
        program,
        AuthoredMemberId::Id("avatar".into()),
        Some("first-card"),
    );
    let second_avatar = node(
        program,
        AuthoredMemberId::Id("avatar".into()),
        Some("second-card"),
    );
    let first_name = node(
        program,
        AuthoredMemberId::Id("display-name".into()),
        Some("first-card"),
    );
    let second_name = node(
        program,
        AuthoredMemberId::Id("display-name".into()),
        Some("second-card"),
    );
    let first_action = node(program, AuthoredMemberId::Id("first-action".into()), None);
    let second_action = node(program, AuthoredMemberId::Id("second-action".into()), None);

    let mut layout = match program.document.get(directory.id()).payload {
        Payload::Frame { layout, .. } => layout,
        _ => unreachable!("directory is a frame"),
    };
    layout.gap_main = 8.0;

    PropertyValues::new(
        &program.document,
        [
            target(
                directory,
                PropertyKey::Fills,
                PropertyValue::Paints(Paints::solid(color("#090E1A"))),
            ),
            target(
                directory,
                PropertyKey::Layout,
                PropertyValue::Layout(layout),
            ),
            target(
                directory,
                PropertyKey::CornerRadius,
                PropertyValue::CornerRadius(RectangularCornerRadius::circular(28.0)),
            ),
            target(
                directory,
                PropertyKey::CornerSmoothing,
                PropertyValue::Number(0.72),
            ),
            target(
                directory,
                PropertyKey::Strokes,
                PropertyValue::Strokes(vec![box_stroke("#334155", 2.0, StrokeAlign::Inside)]),
            ),
            target(
                first_card,
                PropertyKey::Fills,
                PropertyValue::Paints(linear("#4338CA", "#7E22CE")),
            ),
            target(
                first_card,
                PropertyKey::CornerRadius,
                PropertyValue::CornerRadius(RectangularCornerRadius::circular(22.0)),
            ),
            target(
                first_card,
                PropertyKey::CornerSmoothing,
                PropertyValue::Number(0.68),
            ),
            target(
                first_card,
                PropertyKey::Strokes,
                PropertyValue::Strokes(vec![
                    box_stroke("#A78BFA", 3.0, StrokeAlign::Outside),
                    box_stroke("#EDE9FE", 1.0, StrokeAlign::Inside),
                ]),
            ),
            target(
                first_card,
                PropertyKey::Rotation,
                PropertyValue::Number(-1.4),
            ),
            target(
                second_card,
                PropertyKey::Fills,
                PropertyValue::Paints(linear("#0F172A", "#1E293B")),
            ),
            target(
                second_card,
                PropertyKey::CornerRadius,
                PropertyValue::CornerRadius(RectangularCornerRadius::circular(22.0)),
            ),
            target(
                second_card,
                PropertyKey::CornerSmoothing,
                PropertyValue::Number(0.68),
            ),
            target(
                second_card,
                PropertyKey::Strokes,
                PropertyValue::Strokes(vec![box_stroke("#22D3EE", 2.0, StrokeAlign::Inside)]),
            ),
            target(
                second_card,
                PropertyKey::Rotation,
                PropertyValue::Number(1.2),
            ),
            target(
                second_card,
                PropertyKey::Opacity,
                PropertyValue::Number(0.9),
            ),
            target(
                first_avatar,
                PropertyKey::Fills,
                PropertyValue::Paints(radial("#FDE68A", "#F97316")),
            ),
            target(
                second_avatar,
                PropertyKey::Fills,
                PropertyValue::Paints(linear("#22D3EE", "#2563EB")),
            ),
            target(
                first_name,
                PropertyKey::Fills,
                PropertyValue::Paints(Paints::solid(color("#FFFFFF"))),
            ),
            target(
                second_name,
                PropertyKey::Fills,
                PropertyValue::Paints(Paints::solid(color("#F8FAFC"))),
            ),
            target(
                first_action,
                PropertyKey::Fills,
                PropertyValue::Paints(Paints::solid(color("#FDE68A"))),
            ),
            target(
                second_action,
                PropertyKey::Fills,
                PropertyValue::Paints(Paints::solid(color("#67E8F9"))),
            ),
            target(
                second_name,
                PropertyKey::Width,
                PropertyValue::SizeIntent(anchor_lab::model::SizeIntent::Fixed(128.0)),
            ),
            target(
                second_action,
                PropertyKey::Width,
                PropertyValue::SizeIntent(anchor_lab::model::SizeIntent::Fixed(64.0)),
            ),
        ],
    )
    .expect("demo effective state is valid")
}

fn label(
    canvas: &skia_safe::Canvas,
    font: &Font,
    text: &str,
    x: f32,
    y: f32,
    color: skia_safe::Color,
) {
    let mut paint = SkPaint::default();
    paint.set_anti_alias(true);
    paint.set_color(color);
    canvas.draw_str(text, (x, y), font, &paint);
}

fn main() {
    let output = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "target/grida-effective-values-demo.png".into());
    let mut provider = NoDependencies;
    let program = grida_xml_source::materialize(
        SourceSnapshot::new("demo:durable-addressing", "demo:/", SOURCE),
        &mut provider,
    )
    .expect("Version 4 demo materializes");
    let values = effective_values(&program);
    let value_view = ValueView::new(&program.document, &values).expect("validated value view");

    let typeface = skia_safe::FontMgr::new()
        .new_from_data(INTER, None)
        .expect("bundled Inter typeface");
    let context = PaintCtx::new(Some(typeface.clone()));
    let options = ResolveOptions {
        viewport: (SCENE_WIDTH, SCENE_HEIGHT),
        ..Default::default()
    };
    let (width, height) = (1240, 560);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("raster surface");
    let canvas = surface.canvas();
    canvas.clear(skia_safe::Color::from_argb(255, 0xF5, 0xF7, 0xFB));

    let heading = Font::new(typeface.clone(), 28.0);
    let caption = Font::new(typeface.clone(), 15.0);
    let detail = Font::new(typeface, 13.0);
    label(
        canvas,
        &heading,
        "One source document, two immutable reads",
        56.0,
        48.0,
        skia_safe::Color::from_argb(255, 0x0F, 0x17, 0x2A),
    );
    label(
        canvas,
        &caption,
        "AUTHORED BASE",
        56.0,
        94.0,
        skia_safe::Color::from_argb(255, 0x47, 0x55, 0x69),
    );
    label(
        canvas,
        &caption,
        "EFFECTIVE SNAPSHOT",
        676.0,
        94.0,
        skia_safe::Color::from_argb(255, 0x6D, 0x28, 0xD9),
    );

    let left = Affine::translate(56.0, 120.0).then(&Affine::scale(SCALE, SCALE));
    let right = Affine::translate(676.0, 120.0).then(&Affine::scale(SCALE, SCALE));
    let (base, _) = frame::render(canvas, &program.document, &options, &left, &context)
        .expect("authored frame renders");
    let (effective, _) = frame::render_view(canvas, &value_view, &options, &right, &context)
        .expect("effective frame renders");

    let unchanged = frame::resolve_and_build(&program.document, &options, &context)
        .expect("authored state still renders");
    assert_eq!(
        base.drawlist(),
        unchanged.drawlist(),
        "source was not mutated"
    );
    let damage = diff_frame(&base, &effective);

    label(
        canvas,
        &detail,
        "PropertyValues = empty",
        56.0,
        486.0,
        skia_safe::Color::from_argb(255, 0x64, 0x74, 0x8B),
    );
    label(
        canvas,
        &detail,
        &format!(
            "{} typed overrides • {} changed nodes • authored source untouched",
            values.len(),
            damage.changed.len()
        ),
        676.0,
        486.0,
        skia_safe::Color::from_argb(255, 0x64, 0x74, 0x8B),
    );
    label(
        canvas,
        &detail,
        "V4 address → NodeKey → PropertyTarget → ValueView → Resolved → frame",
        676.0,
        516.0,
        skia_safe::Color::from_argb(255, 0x7C, 0x3A, 0xED),
    );

    let image = surface.image_snapshot();
    let png = image
        .encode(None, EncodedImageFormat::PNG, None)
        .expect("PNG encode");
    std::fs::write(&output, png.as_bytes()).expect("write visual proof");
    println!(
        "wrote {output} ({} overrides, {} changed nodes, {} bytes)",
        values.len(),
        damage.changed.len(),
        png.len()
    );
}
