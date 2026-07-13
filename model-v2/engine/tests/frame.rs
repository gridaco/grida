//! Complete-frame execution keeps the drawlist and paint environment coupled.

use anchor_engine::{
    frame::{self, FrameBuildError, FrameError, FrameExecutionError},
    paint::{GradientPreflightReason, ImagePreflightReason, PaintCtx, PaintUseContext},
};
use anchor_lab::grida_xml;
use anchor_lab::math::Affine;
use anchor_lab::model::*;
use anchor_lab::properties::{
    PropertyKey, PropertyTarget, PropertyValue, PropertyValues, ValueView,
};
use anchor_lab::resolve::ResolveOptions;
use skia_safe::{surfaces, Color, FontMgr};

fn scene() -> Document {
    let mut builder = DocBuilder::new();
    let rect = builder.add(
        0,
        Header::new(SizeIntent::Fixed(32.0), SizeIntent::Fixed(24.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    builder.node_mut(rect).fills = Paints::solid("#2563EB".into());
    builder.build()
}

fn gradient(scale: f32) -> Paint {
    Paint::LinearGradient(LinearGradientPaint {
        transform: Affine {
            a: scale,
            b: scale,
            c: 0.0,
            d: scale,
            e: 0.0,
            f: 0.0,
        },
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: anchor_lab::model::Color::BLACK,
            },
            GradientStop {
                offset: 1.0,
                color: anchor_lab::model::Color(0xFFFF_FFFF),
            },
        ],
        ..Default::default()
    })
}

fn gradient_failure(
    result: Result<frame::FrameProduct, FrameBuildError>,
) -> anchor_engine::paint::GradientPreflightError {
    let FrameBuildError::Gradient(error) = result.expect_err("frame must fail gradient preflight");
    error
}

#[test]
fn complete_product_rejects_another_paint_context_before_drawing() {
    let document = scene();
    let expected_context = PaintCtx::new(None);
    let other_context = PaintCtx::new(None);
    let product = frame::resolve_and_build(
        &document,
        &ResolveOptions {
            viewport: (64.0, 48.0),
            ..Default::default()
        },
        &expected_context,
    )
    .expect("valid frame");
    let mut surface = surfaces::raster_n32_premul((64, 48)).unwrap();
    surface.canvas().clear(Color::WHITE);

    let error = product
        .execute(surface.canvas(), &Affine::IDENTITY, &other_context)
        .unwrap_err();
    let FrameExecutionError::Environment(error) = error else {
        panic!("expected environment mismatch");
    };
    assert_eq!(error.expected, product.environment());
    assert_eq!(error.actual, other_context.environment_key());
}

#[test]
fn complete_product_rejects_a_resource_revision_after_build() {
    const IMAGE: &[u8] = include_bytes!("../../../fixtures/images/checker.png");

    let document = scene();
    let mut context = PaintCtx::new(None);
    let product = frame::resolve_and_build(
        &document,
        &ResolveOptions {
            viewport: (64.0, 48.0),
            ..Default::default()
        },
        &context,
    )
    .expect("valid frame");
    let captured = product.environment();
    context.insert_encoded("asset", IMAGE).unwrap();

    let error = product
        .raster_to_bytes(&Affine::IDENTITY, 64, 48, &context)
        .unwrap_err();
    let FrameExecutionError::Environment(error) = error else {
        panic!("expected environment mismatch");
    };
    assert_eq!(error.expected, captured);
    assert_eq!(error.actual, context.environment_key());
}

#[test]
fn complete_product_executes_under_its_captured_environment() {
    let document = scene();
    let context = PaintCtx::new(None);
    let product = frame::resolve_and_build(
        &document,
        &ResolveOptions {
            viewport: (64.0, 48.0),
            ..Default::default()
        },
        &context,
    )
    .expect("valid frame");

    let pixels = product
        .raster_to_bytes(&Affine::IDENTITY, 64, 48, &context)
        .unwrap();
    assert!(
        pixels
            .chunks_exact(4)
            .any(|pixel| pixel != [255, 255, 255, 255]),
        "the unchanged environment replays the frame"
    );
}

#[test]
fn parsed_subnormal_gradient_is_box_dependent_at_frame_build() {
    let ordinary = grida_xml::parse(
        r##"<grida version="0"><container><rect width="100" height="100"><fill><gradient kind="linear" transform="1e-20 1e-20 0 1e-20 0 0"><stop offset="0" color="#000000"/><stop offset="1" color="#FFFFFF"/></gradient></fill></rect></container></grida>"##,
    )
    .expect("a finite transform with an exact nonzero f64 determinant parses");
    let error = gradient_failure(frame::resolve_and_build(
        &ordinary,
        &ResolveOptions::default(),
        &PaintCtx::new(None),
    ));
    assert_eq!(error.context, PaintUseContext::Fill);
    assert_eq!(error.visible_paint_index, 0);
    assert_eq!(
        error.reason,
        GradientPreflightReason::BackendMatrixNotInvertible
    );

    let rescued = grida_xml::parse(
        r##"<grida version="0"><container><rect width="1e20" height="1e20"><fill><gradient kind="linear" transform="1e-20 1e-20 0 1e-20 0 0"><stop offset="0" color="#000000"/><stop offset="1" color="#FFFFFF"/></gradient></fill></rect></container></grida>"##,
    )
    .expect("the same mathematically invertible transform parses");
    frame::resolve_and_build(&rescued, &ResolveOptions::default(), &PaintCtx::new(None))
        .expect("the resolved paint box rescues backend matrix conditioning");
}

#[test]
fn effective_overflowing_determinant_is_accepted_then_box_preflighted() {
    let document_with_size = |size: f32| {
        let mut builder = DocBuilder::new();
        let rect = builder.add(
            0,
            Header::new(SizeIntent::Fixed(size), SizeIntent::Fixed(size)),
            Payload::Shape {
                desc: ShapeDesc::Rect,
            },
        );
        (builder.build(), rect)
    };
    let values_for = |document: &Document, rect: NodeId| {
        PropertyValues::new(
            document,
            [(
                PropertyTarget::new(document.key_of(rect).unwrap(), PropertyKey::Fills),
                PropertyValue::Paints(Paints::new([gradient(1e38)])),
            )],
        )
        .expect("effective values retain a finite transform whose f32 determinant overflows")
    };

    let (rescued, rescued_rect) = document_with_size(1e-30);
    let rescued_values = values_for(&rescued, rescued_rect);
    let rescued_view = ValueView::new(&rescued, &rescued_values).unwrap();
    frame::resolve_and_build_view(
        &rescued_view,
        &ResolveOptions::default(),
        &PaintCtx::new(None),
    )
    .expect("a tiny resolved paint box rescues the large transform");

    let (ordinary, ordinary_rect) = document_with_size(100.0);
    let ordinary_values = values_for(&ordinary, ordinary_rect);
    let ordinary_view = ValueView::new(&ordinary, &ordinary_values).unwrap();
    let error = gradient_failure(frame::resolve_and_build_view(
        &ordinary_view,
        &ResolveOptions::default(),
        &PaintCtx::new(None),
    ));
    assert_eq!(error.context, PaintUseContext::Fill);
    assert_eq!(
        error.reason,
        GradientPreflightReason::BackendMatrixNotInvertible
    );
}

#[test]
fn frame_build_error_identifies_stroke_and_text_run_contexts() {
    let mut builder = DocBuilder::new();
    let rect = builder.add(
        0,
        Header::new(SizeIntent::Fixed(100.0), SizeIntent::Fixed(80.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let mut stroke = Stroke::default_for(&Payload::Shape {
        desc: ShapeDesc::Rect,
    })
    .unwrap();
    stroke.width = StrokeWidth::Uniform(4.0);
    stroke.paints = Paints::new([gradient(1e-20)]);
    builder.node_mut(rect).strokes.push(stroke);
    let stroke_doc = builder.build();
    let stroke_error = gradient_failure(frame::resolve_and_build(
        &stroke_doc,
        &ResolveOptions::default(),
        &PaintCtx::new(None),
    ));
    assert_eq!(stroke_error.node, rect);
    assert_eq!(stroke_error.context, PaintUseContext::Stroke);

    let mut builder = DocBuilder::new();
    let text = builder.add(
        0,
        Header::new(SizeIntent::Fixed(100.0), SizeIntent::Auto),
        Payload::AttributedText {
            attributed_string: AttributedString::from_runs(
                "Hi",
                vec![StyledTextRun {
                    start: 0,
                    end: 2,
                    style: TextStyleRec::default(),
                    fills: Some(Paints::new([gradient(1e-20)])),
                }],
            )
            .unwrap(),
            default_style: TextStyleRec::default(),
        },
    );
    let text_doc = builder.build();
    const INTER: &[u8] =
        include_bytes!("../../../fixtures/fonts/Inter/Inter-VariableFont_opsz,wght.ttf");
    let typeface = FontMgr::new()
        .new_from_data(INTER, None)
        .expect("bundled Inter typeface");
    let text_error = gradient_failure(frame::resolve_and_build(
        &text_doc,
        &ResolveOptions::default(),
        &PaintCtx::new(Some(typeface)),
    ));
    assert_eq!(text_error.node, text);
    assert_eq!(
        text_error.context,
        PaintUseContext::TextRun {
            source_run: Some(0)
        }
    );
}

#[test]
fn render_rejects_before_mutating_the_destination_canvas() {
    let document = grida_xml::parse(
        r##"<grida version="0"><container><rect width="100" height="100"><fill><gradient kind="linear" transform="1e-20 1e-20 0 1e-20 0 0"><stop offset="0" color="#000000"/><stop offset="1" color="#FFFFFF"/></gradient></fill></rect></container></grida>"##,
    )
    .unwrap();
    let mut surface = surfaces::raster_n32_premul((32, 32)).unwrap();
    surface.canvas().clear(Color::MAGENTA);
    let before = anchor_engine::paint::read_pixels(&mut surface, 32, 32);
    let save_count = surface.canvas().save_count();

    let error = frame::render(
        surface.canvas(),
        &document,
        &ResolveOptions::default(),
        &Affine::IDENTITY,
        &PaintCtx::new(None),
    )
    .expect_err("unrepresentable gradient must fail frame construction");
    assert!(matches!(
        error,
        FrameError::Build(FrameBuildError::Gradient(_))
    ));
    assert_eq!(surface.canvas().save_count(), save_count);
    let after = anchor_engine::paint::read_pixels(&mut surface, 32, 32);
    assert_eq!(before, after);
}

#[test]
fn ordinary_gradient_frame_still_rasters() {
    let mut builder = DocBuilder::new();
    let rect = builder.add(
        0,
        Header::new(SizeIntent::Fixed(32.0), SizeIntent::Fixed(24.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    builder.node_mut(rect).fills = Paints::new([gradient(1.0)]);
    let document = builder.build();
    let context = PaintCtx::new(None);
    let product = frame::resolve_and_build(
        &document,
        &ResolveOptions {
            viewport: (64.0, 48.0),
            ..Default::default()
        },
        &context,
    )
    .expect("ordinary gradient passes frame preflight");
    let pixels = product
        .raster_to_bytes(&Affine::IDENTITY, 64, 48, &context)
        .unwrap();
    assert!(pixels
        .chunks_exact(4)
        .any(|pixel| pixel != [255, 255, 255, 255]));
}

#[test]
fn programmatic_invalid_gradient_is_a_build_error_not_a_painter_panic() {
    let mut builder = DocBuilder::new();
    let rect = builder.add(
        0,
        Header::new(SizeIntent::Fixed(32.0), SizeIntent::Fixed(24.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    builder.node_mut(rect).fills =
        Paints::new([Paint::LinearGradient(LinearGradientPaint::default())]);
    let document = builder.build();
    let error = gradient_failure(frame::resolve_and_build(
        &document,
        &ResolveOptions::default(),
        &PaintCtx::new(None),
    ));
    assert_eq!(error.node, rect);
    assert_eq!(error.context, PaintUseContext::Fill);
    assert!(matches!(
        error.reason,
        GradientPreflightReason::InvalidPaint(_)
    ));
    assert!(error.to_string().contains("requires at least two stops"));
}

fn image_document(size: f32) -> Document {
    let mut builder = DocBuilder::new();
    let rect = builder.add(
        0,
        Header::new(SizeIntent::Fixed(size), SizeIntent::Fixed(size)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let mut image = ImagePaint::from_rid("asset");
    image.fit = ImagePaintFit::Fit(BoxFit::Fill);
    builder.node_mut(rect).fills = Paints::new([Paint::Image(image)]);
    builder.build()
}

#[test]
fn missing_image_resource_fails_checked_execution_before_canvas_mutation() {
    let document = image_document(32.0);
    let context = PaintCtx::new(None);
    let product = frame::resolve_and_build(&document, &ResolveOptions::default(), &context)
        .expect("resource readiness is an execution input");
    let mut surface = surfaces::raster_n32_premul((32, 32)).unwrap();
    surface.canvas().clear(Color::MAGENTA);
    let before = anchor_engine::paint::read_pixels(&mut surface, 32, 32);

    let FrameExecutionError::Image(error) = product
        .execute(surface.canvas(), &Affine::IDENTITY, &context)
        .expect_err("missing image must fail checked execution")
    else {
        panic!("expected image preflight failure");
    };
    assert_eq!(error.context, PaintUseContext::Fill);
    assert_eq!(error.rid, "asset");
    assert_eq!(error.reason, ImagePreflightReason::MissingResource);
    assert_eq!(
        anchor_engine::paint::read_pixels(&mut surface, 32, 32),
        before
    );
}

#[test]
fn image_total_matrix_failure_is_view_dependent_and_rescuable() {
    const CHECKER: &[u8] = include_bytes!("../../../fixtures/images/checker.png");
    let document = image_document(1e-40);
    let mut context = PaintCtx::new(None);
    context.insert_encoded("asset", CHECKER).unwrap();
    let product = frame::resolve_and_build(&document, &ResolveOptions::default(), &context)
        .expect("tiny image geometry remains valid frame data");
    let mut surface = surfaces::raster_n32_premul((32, 32)).unwrap();
    surface.canvas().clear(Color::MAGENTA);

    let FrameExecutionError::Image(error) = product
        .execute(surface.canvas(), &Affine::IDENTITY, &context)
        .expect_err("identity view leaves the image total matrix unrepresentable")
    else {
        panic!("expected image matrix failure");
    };
    assert_eq!(error.reason, ImagePreflightReason::TotalMatrixNotInvertible);

    product
        .execute(surface.canvas(), &Affine::scale(1e30, 1e30), &context)
        .expect("the final view rescues total-matrix representability");
}

#[test]
fn collapsed_image_geometry_remains_a_valid_blank_execution() {
    const CHECKER: &[u8] = include_bytes!("../../../fixtures/images/checker.png");
    let document = image_document(32.0);
    let mut context = PaintCtx::new(None);
    context.insert_encoded("asset", CHECKER).unwrap();
    let product = frame::resolve_and_build(&document, &ResolveOptions::default(), &context)
        .expect("ordinary image frame");
    let mut surface = surfaces::raster_n32_premul((32, 32)).unwrap();
    surface.canvas().clear(Color::MAGENTA);
    let before = anchor_engine::paint::read_pixels(&mut surface, 32, 32);
    product
        .execute(surface.canvas(), &Affine::scale(0.0, 0.0), &context)
        .expect("a singular geometry CTM is collapsed coverage, not an image failure");
    assert_eq!(
        anchor_engine::paint::read_pixels(&mut surface, 32, 32),
        before,
        "collapsed image geometry must emit no pixels"
    );
}

#[test]
fn empty_text_stroke_does_not_evaluate_its_paints() {
    let mut builder = DocBuilder::new();
    let text = builder.add(
        0,
        Header::new(SizeIntent::Fixed(100.0), SizeIntent::Auto),
        Payload::Text {
            content: String::new(),
            font_size: 16.0,
        },
    );
    let mut stroke = Stroke::default_for(&Payload::Text {
        content: String::new(),
        font_size: 16.0,
    })
    .unwrap();
    stroke.width = StrokeWidth::Uniform(2.0);
    stroke.paints = Paints::new([gradient(1e-20)]);
    builder.node_mut(text).strokes.push(stroke);
    let document = builder.build();
    frame::resolve_and_build(&document, &ResolveOptions::default(), &PaintCtx::new(None))
        .expect("empty text has no glyph geometry on which to evaluate stroke paint");
}
