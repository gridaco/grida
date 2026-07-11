use std::sync::Arc;

use anchor_lab::grida_xml;
use anchor_lab::math::RectF;
use anchor_lab::model::{
    AxisBinding, Color, FillRule, Paints, Payload, ShapeDesc, SizeIntent, StrokeAlign, StrokeCap,
    StrokeJoin,
};
use anchor_lab::path::{self, PathCommand};
use anchor_lab::resolve::{resolve, ResolveOptions};
use anchor_lab::svgout::{self, SvgOptions};
use anchor_lab::textir;

fn source(path: &str) -> String {
    format!(
        "<grida version=\"0\"><container width=\"400\" height=\"300\">{path}</container></grida>"
    )
}

fn only_path(document: &anchor_lab::model::Document) -> anchor_lab::model::NodeId {
    let render_root = document.get(document.root).children[0];
    document.get(render_root).children[0]
}

#[test]
fn path_is_a_boxed_unit_reference_shape_with_one_shared_artifact() {
    let d = "M 0 1 L .5 0 L 1 1 Z";
    let document = grida_xml::parse(&source(&format!(
        "<path x=\"10\" y=\"20\" width=\"200\" height=\"100\" d=\"{d}\"/>"
    )))
    .unwrap();
    let id = only_path(&document);
    let node = document.get(id);
    let Payload::Shape {
        desc: ShapeDesc::Path(artifact),
    } = &node.payload
    else {
        panic!("expected path shape");
    };
    assert_eq!(artifact.d.as_ref(), d);
    assert_eq!(artifact.fill_rule, FillRule::NonZero);
    assert!(artifact.all_contours_closed);
    assert_eq!(
        artifact.unit_bounds,
        RectF {
            x: 0.0,
            y: 0.0,
            w: 1.0,
            h: 1.0
        }
    );
    assert_eq!(node.fills, Paints::solid(Color::BLACK));

    let resolved = resolve(&document, &ResolveOptions::default());
    let resolved_path = resolved.resolved_path_of(id);
    assert!(Arc::ptr_eq(artifact, &resolved_path.source));
    assert!(matches!(
        resolved_path.commands[0],
        PathCommand::MoveTo { x: 0.0, y: 100.0 }
    ));
    assert_eq!(
        resolved.aabb_of(id),
        RectF {
            x: 10.0,
            y: 20.0,
            w: 200.0,
            h: 100.0,
        }
    );
    assert!(resolved.resolved_path_opt(document.root).is_none());
}

#[test]
fn tight_path_geometry_not_the_layout_box_starts_visual_bounds() {
    let document = grida_xml::parse(&source(
        "<path x=\"10\" y=\"20\" width=\"200\" height=\"100\" d=\"M .25 .25 H .75 V .75 H .25 Z\"/>",
    ))
    .unwrap();
    let id = only_path(&document);
    let resolved = resolve(&document, &ResolveOptions::default());
    assert_eq!(resolved.xywh(id), (10.0, 20.0, 200.0, 100.0));
    assert_eq!(
        resolved.aabb_of(id),
        RectF {
            x: 60.0,
            y: 45.0,
            w: 100.0,
            h: 50.0,
        }
    );
}

#[test]
fn path_miter_strokes_expand_bounds_conservatively() {
    let document = grida_xml::parse(&source(
        "<path width=\"100\" height=\"100\" d=\"M .25 .25 L .75 .25 L .5 .75 Z\"><stroke width=\"2\" align=\"outside\" join=\"miter\" miter-limit=\"4\"><solid color=\"#000\"/></stroke></path>",
    ))
    .unwrap();
    let id = only_path(&document);
    let bounds = resolve(&document, &ResolveOptions::default()).aabb_of(id);
    assert_eq!(
        bounds,
        RectF {
            x: 17.0,
            y: 17.0,
            w: 66.0,
            h: 66.0,
        }
    );
}

#[test]
fn evenodd_and_source_spelling_round_trip_canonically() {
    let d = "m 0 0 l 1 0 0 1 -1 0 z";
    let document = grida_xml::parse(&source(&format!(
        "<path width=\"80\" height=\"40\" d=\"{d}\" fill-rule=\"evenodd\"/>"
    )))
    .unwrap();
    let printed = grida_xml::print(&document).unwrap();
    assert!(printed.contains(&format!("d=\"{d}\"")));
    assert!(printed.contains("fill-rule=\"evenodd\""));
    let reparsed = grida_xml::parse(&printed).unwrap();
    let Payload::Shape {
        desc: ShapeDesc::Path(path),
    } = &reparsed.get(only_path(&reparsed)).payload
    else {
        panic!("expected path");
    };
    assert_eq!(path.fill_rule, FillRule::EvenOdd);
    assert_eq!(path.d.as_ref(), d);
    assert!(textir::try_print(&document)
        .unwrap_err()
        .to_string()
        .contains("historical E3 TextIr cannot represent"));
}

#[test]
fn equivalent_path_spellings_share_visual_identity() {
    let absolute = path::analyze("M 0 0 L 1 0 L 1 1 Z", FillRule::NonZero).unwrap();
    let relative = path::analyze("m0 0h1v1z", FillRule::NonZero).unwrap();
    assert_ne!(absolute.d, relative.d);
    assert_ne!(
        absolute, relative,
        "source-tier equality retains authored d"
    );
    assert!(absolute.same_visual_geometry(&relative));

    let evenodd = path::analyze("m0 0h1v1z", FillRule::EvenOdd).unwrap();
    assert!(!absolute.same_visual_geometry(&evenodd));

    let arc_absolute = path::analyze("M .5 0 A .5 .5 0 0 1 1 .5", FillRule::NonZero).unwrap();
    let arc_relative = path::analyze("m .5 0 a .5 .5 360 0 1 .5 .5", FillRule::NonZero).unwrap();
    assert_ne!(arc_absolute.d, arc_relative.d);
    assert_ne!(arc_absolute, arc_relative);
    assert!(arc_absolute.same_visual_geometry(&arc_relative));
}

#[test]
fn curves_use_realized_extrema_and_arcs_become_bounded_rational_conics() {
    // The quadratic control point is outside the unit box, but the realized
    // curve only touches y=0 and is therefore valid.
    let quadratic = path::analyze("M 0 1 Q .5 -1 1 1", FillRule::NonZero).unwrap();
    assert_eq!(
        quadratic.unit_bounds,
        RectF {
            x: 0.0,
            y: 0.0,
            w: 1.0,
            h: 1.0,
        }
    );
    let overshoot = path::analyze("M 0 1 Q .5 -1.1 1 1", FillRule::NonZero)
        .unwrap_err()
        .to_string();
    assert!(overshoot.contains("unit reference box"), "{overshoot}");

    let circle = path::analyze(
        "M .5 0 A .5 .5 0 0 1 1 .5 A .5 .5 0 0 1 .5 1 A .5 .5 0 0 1 0 .5 A .5 .5 0 0 1 .5 0 Z",
        FillRule::NonZero,
    )
    .unwrap();
    let conics: Vec<_> = circle
        .commands
        .iter()
        .filter_map(|command| match command {
            PathCommand::ConicTo {
                x1,
                y1,
                x,
                y,
                weight,
            } => Some((*x1, *y1, *x, *y, *weight)),
            _ => None,
        })
        .collect();
    assert_eq!(conics.len(), 4);
    assert_eq!(conics[0].0, 1.0);
    assert_eq!(conics[0].1, 0.0);
    assert_eq!(conics[0].2, 1.0);
    assert_eq!(conics[0].3, 0.5);
    for (_, _, _, _, weight) in conics {
        assert!((weight - std::f32::consts::FRAC_1_SQRT_2).abs() < 1.0e-7);
    }
    assert!(circle.all_contours_closed);
    assert_eq!(
        circle.unit_bounds,
        RectF {
            x: 0.0,
            y: 0.0,
            w: 1.0,
            h: 1.0
        }
    );
    for rotation in [1, 89, 91, 180, 270, 359] {
        let rotated_circle = path::analyze(
            format!(
                "M .5 0 A .5 .5 {rotation} 0 1 1 .5 A .5 .5 {rotation} 0 1 .5 1 A .5 .5 {rotation} 0 1 0 .5 A .5 .5 {rotation} 0 1 .5 0 Z"
            ),
            FillRule::NonZero,
        )
        .unwrap();
        assert!(
            rotated_circle.same_visual_geometry(&circle),
            "circle rotation {rotation}"
        );
    }

    let rotated_ellipse = path::analyze(
        "M .5 0 A .5 .25 90 0 1 .75 .5 A .5 .25 90 0 1 .5 1 A .5 .25 90 0 1 .25 .5 A .5 .25 90 0 1 .5 0 Z",
        FillRule::NonZero,
    )
    .unwrap();
    assert_eq!(
        rotated_ellipse.unit_bounds,
        RectF {
            x: 0.25,
            y: 0.0,
            w: 0.5,
            h: 1.0,
        }
    );
    assert_eq!(
        rotated_ellipse
            .commands
            .iter()
            .filter(|command| matches!(command, PathCommand::ConicTo { .. }))
            .count(),
        4
    );

    let tiny = path::analyze(
        "M .5 .5 A .000001 .000001 0 0 1 .500001 .500001",
        FillRule::NonZero,
    )
    .unwrap();
    assert!(matches!(tiny.commands[1], PathCommand::ConicTo { .. }));

    let extreme_large_arc = path::analyze("M 0 0 A 1e-20 1e-20 37 1 1 1e-45 0", FillRule::NonZero)
        .unwrap_err()
        .to_string();
    assert!(
        extreme_large_arc.contains("unit reference box"),
        "{extreme_large_arc}"
    );
}

#[test]
fn path_reports_focused_source_errors() {
    let cases = [
        ("<path width=\"10\" height=\"10\"/>", "requires `d`"),
        (
            "<path width=\"10\" height=\"10\" d=\"\"/>",
            "must not be empty",
        ),
        (
            "<path width=\"10\" height=\"10\" d=\"M 0 0 L nope\"/>",
            "invalid SVG path data",
        ),
        (
            "<path width=\"10\" height=\"10\" d=\"M 0 0 L 2 1\"/>",
            "unit reference box",
        ),
        (
            "<path width=\"10\" height=\"10\" d=\"M -0.0000005 0 L 1 1\"/>",
            "unit reference box",
        ),
        (
            "<path width=\"10\" height=\"10\" d=\"M 0 0 L 1 1\" fill-rule=\"winding\"/>",
            "must be `nonzero` or `evenodd`",
        ),
        (
            "<path width=\"10\" height=\"10\" d=\"M 0 0 L 1 1\" fill-rule=\"nonzero\" fill-rule=\"evenodd\"/>",
            "duplicate `fill-rule`",
        ),
        (
            "<path width=\"10\" d=\"M 0 0 L 1 1\"/>",
            "requires both axes",
        ),
    ];
    for (path, expected) in cases {
        let error = grida_xml::parse(&source(path)).unwrap_err().to_string();
        assert!(
            error.contains(expected),
            "{error:?} did not contain {expected:?}"
        );
    }
}

#[test]
fn move_only_contours_and_coincident_arcs_do_not_invent_geometry_or_bounds() {
    let path = path::analyze("M 1 1 M 0 0 L 1 1", FillRule::NonZero).unwrap();
    assert_eq!(
        path.unit_bounds,
        RectF {
            x: 0.0,
            y: 0.0,
            w: 1.0,
            h: 1.0
        }
    );

    let error = path::analyze("M .5 .5 A .2 .2 0 0 1 .5 .5", FillRule::NonZero)
        .unwrap_err()
        .to_string();
    assert!(error.contains("at least one drawing segment"), "{error}");
}

#[test]
fn open_and_closed_path_stroke_contracts_are_explicit() {
    let open_error = grida_xml::parse(&source(
        "<path width=\"100\" height=\"100\" d=\"M 0 0 L 1 1\"><stroke align=\"inside\"><solid color=\"#000\"/></stroke></path>",
    ))
    .unwrap_err()
    .to_string();
    assert!(open_error.contains("every drawable contour is explicitly closed"));

    let document = grida_xml::parse(&source(
        "<path width=\"100\" height=\"100\" d=\"M 0 0 L 1 0 L 1 1 Z\"><stroke width=\"3\" align=\"outside\" cap=\"round\" join=\"bevel\" miter-limit=\"7\" dash-array=\"2 1\"><solid color=\"#000\"/></stroke></path>",
    ))
    .unwrap();
    let stroke = &document.get(only_path(&document)).strokes[0];
    assert_eq!(stroke.align, StrokeAlign::Outside);
    assert_eq!(stroke.cap, StrokeCap::Round);
    assert_eq!(stroke.join, StrokeJoin::Bevel);
    assert_eq!(stroke.miter_limit, 7.0);
    assert_eq!(stroke.dash_array.as_deref(), Some(&[2.0, 1.0][..]));

    let per_side = grida_xml::parse(&source(
        "<path width=\"100\" height=\"100\" d=\"M 0 0 L 1 0 L 1 1 Z\"><stroke width=\"1 2 3 4\"><solid color=\"#000\"/></stroke></path>",
    ))
    .unwrap_err()
    .to_string();
    assert!(per_side.contains("four-value stroke width is valid only"));
}

#[test]
fn path_accepts_render_children_in_its_declared_local_box() {
    let document = grida_xml::parse(&source(
        "<path width=\"200\" height=\"100\" d=\"M 0 0 L 1 0 L .5 1 Z\"><rect x=\"50\" y=\"20\" width=\"30\" height=\"10\"/></path>",
    ))
    .unwrap();
    let path = only_path(&document);
    let child = document.get(path).children[0];
    let resolved = resolve(&document, &ResolveOptions::default());
    assert_eq!(resolved.xywh(path), (0.0, 0.0, 200.0, 100.0));
    assert_eq!(resolved.xywh(child), (50.0, 20.0, 30.0, 10.0));
    assert!(matches!(
        resolved.resolved_path_of(path).commands.last(),
        Some(PathCommand::Close)
    ));
}

#[test]
fn svg_snapshot_maps_the_unit_path_through_its_resolved_box() {
    let document = grida_xml::parse(&source(
        "<path x=\"10\" y=\"20\" width=\"200\" height=\"100\" d=\"M 0 0 H 1 V 1 Z\" fill-rule=\"evenodd\" fill=\"#7C3AED\"/>",
    ))
    .unwrap();
    let resolved = resolve(&document, &ResolveOptions::default());
    let svg = svgout::render(
        &document,
        &resolved,
        &SvgOptions {
            show_aabb: false,
            width: 400.0,
            height: 300.0,
        },
    )
    .unwrap();
    assert!(svg.contains(
        "<path d=\"M 0 0 H 1 V 1 Z\" transform=\"matrix(200 0 0 100 10 20)\" fill-rule=\"evenodd\" fill=\"#7C3AED\"/>"
    ));

    let arc_document = grida_xml::parse(&source(
        "<path width=\"100\" height=\"100\" d=\"M .5 0 A .5 .5 0 0 1 1 .5\"/>",
    ))
    .unwrap();
    let arc_svg = svgout::render(
        &arc_document,
        &resolve(&arc_document, &ResolveOptions::default()),
        &SvgOptions {
            show_aabb: false,
            width: 400.0,
            height: 300.0,
        },
    )
    .unwrap();
    assert!(arc_svg.contains("d=\"M .5 0 A .5 .5 0 0 1 1 .5\""));
}

#[test]
fn writer_rejects_programmatic_path_box_states_the_reader_cannot_accept() {
    let base = grida_xml::parse(&source(
        "<path width=\"100\" height=\"50\" d=\"M 0 0 H 1 V 1 Z\"/>",
    ))
    .unwrap();
    let id = only_path(&base);
    let rejected = |mut document: anchor_lab::model::Document,
                    mutate: fn(&mut anchor_lab::model::Header),
                    expected: &str| {
        mutate(&mut document.get_mut(id).header);
        let error = grida_xml::print(&document).unwrap_err().to_string();
        assert!(
            error.contains(expected),
            "{error:?} did not contain {expected:?}"
        );
    };

    rejected(
        base.clone(),
        |header| {
            header.width = SizeIntent::Auto;
            header.height = SizeIntent::Auto;
        },
        "requires both axes",
    );
    rejected(
        base.clone(),
        |header| header.aspect_ratio = Some((2.0, 1.0)),
        "requires both axes",
    );
    rejected(
        base.clone(),
        |header| {
            header.x = AxisBinding::Span {
                start: 0.0,
                end: 0.0,
            }
        },
        "span x binding",
    );
    rejected(
        base.clone(),
        |header| header.min_width = Some(-1.0),
        "min-width must be a finite non-negative",
    );
    rejected(
        base.clone(),
        |header| header.aspect_ratio = Some((0.0, 1.0)),
        "aspect-ratio terms",
    );
    rejected(
        base.clone(),
        |header| header.x = AxisBinding::start(f32::NAN),
        "x binding must contain finite",
    );
    rejected(
        base,
        |header| header.width = SizeIntent::Fixed(-1.0),
        "width must be a finite non-negative",
    );
}

#[test]
fn programmatic_open_path_alignment_fails_closed_for_paint_and_bounds() {
    let mut document = grida_xml::parse(&source(
        "<path width=\"100\" height=\"100\" d=\"M .25 .25 L .75 .75\"><stroke width=\"20\"><solid color=\"#000\"/></stroke></path>",
    ))
    .unwrap();
    let id = only_path(&document);
    document.get_mut(id).strokes[0].align = StrokeAlign::Inside;
    let node = document.get(id);
    assert!(!node.strokes[0].renderable_for(&node.payload, node.corner_smoothing));
    assert_eq!(
        resolve(&document, &ResolveOptions::default()).aabb_of(id),
        RectF {
            x: 25.0,
            y: 25.0,
            w: 50.0,
            h: 50.0,
        }
    );
    assert!(grida_xml::print(&document)
        .unwrap_err()
        .to_string()
        .contains("every drawable contour is explicitly closed"));
}

#[test]
fn unit_and_huge_mapped_bounds_conservatively_contain_stored_commands() {
    let line = path::analyze(
        "M 0.45802047848701477 0 L 0.9617093205451965 0",
        FillRule::NonZero,
    )
    .unwrap();
    let PathCommand::LineTo { x: unit_end, .. } = line.commands[1] else {
        panic!("expected line endpoint");
    };
    assert!(line.unit_bounds.x + line.unit_bounds.w >= unit_end);

    let mapped = path::materialize(line, 30_270_271_994_254_590_000.0_f32, 1.0).unwrap();
    let PathCommand::LineTo { x: mapped_end, .. } = mapped.commands[1] else {
        panic!("expected mapped line endpoint");
    };
    assert!(mapped.local_bounds.x + mapped.local_bounds.w >= mapped_end);

    let circle = path::analyze(
        "M .5 0 A .5 .5 0 0 1 1 .5 A .5 .5 0 0 1 .5 1 A .5 .5 0 0 1 0 .5 A .5 .5 0 0 1 .5 0 Z",
        FillRule::NonZero,
    )
    .unwrap();
    let mapped = path::materialize(circle, 19_384_729_239_552.0, 7_193_847_234_560.0).unwrap();
    let rotated_circle = path::analyze(
        "M .5 0 A .5 .5 359 0 1 1 .5 A .5 .5 359 0 1 .5 1 A .5 .5 359 0 1 0 .5 A .5 .5 359 0 1 .5 0 Z",
        FillRule::NonZero,
    )
    .unwrap();
    let rotated_mapped =
        path::materialize(rotated_circle, 19_384_729_239_552.0, 7_193_847_234_560.0).unwrap();
    assert_eq!(rotated_mapped, mapped);
    let bounds = mapped.local_bounds;
    let left = f64::from(bounds.x);
    let top = f64::from(bounds.y);
    let right = f64::from(bounds.x + bounds.w);
    let bottom = f64::from(bounds.y + bounds.h);
    let mut current = (0.0_f32, 0.0_f32);
    for command in mapped.commands.iter() {
        match *command {
            PathCommand::MoveTo { x, y } | PathCommand::LineTo { x, y } => {
                current = (x, y);
            }
            PathCommand::ConicTo {
                x1,
                y1,
                x,
                y,
                weight,
            } => {
                for sample in 0..=1024 {
                    let t = sample as f64 / 1024.0;
                    let one_minus_t = 1.0 - t;
                    let a = one_minus_t * one_minus_t;
                    let b = 2.0 * f64::from(weight) * one_minus_t * t;
                    let c = t * t;
                    let denominator = a + b + c;
                    let px = (a * f64::from(current.0) + b * f64::from(x1) + c * f64::from(x))
                        / denominator;
                    let py = (a * f64::from(current.1) + b * f64::from(y1) + c * f64::from(y))
                        / denominator;
                    assert!(px >= left && px <= right, "x={px} outside {left}..{right}");
                    assert!(py >= top && py <= bottom, "y={py} outside {top}..{bottom}");
                }
                current = (x, y);
            }
            PathCommand::Close => {}
            PathCommand::QuadTo { .. } | PathCommand::CubicTo { .. } => {
                unreachable!("circle arc lowers only to conics")
            }
        }
    }
}

#[test]
fn resolved_control_overflow_fails_closed_without_losing_children() {
    let mut document = grida_xml::parse(&source(
        "<path width=\"1\" height=\"1\" d=\"M 0 .5 C .25 2 .75 -1 1 .5\"><rect width=\"1\" height=\"1\"/></path>",
    ))
    .unwrap();
    let id = only_path(&document);
    let child = document.get(id).children[0];
    document.get_mut(id).header.height = SizeIntent::Fixed(f32::MAX);

    let resolved = resolve(&document, &ResolveOptions::default());
    assert!(resolved.resolved_path_opt(id).is_none());
    assert!(resolved.reports.iter().any(|report| matches!(
        report,
        anchor_lab::resolve::Report::ErrorByRule {
            node,
            field: "path",
            rule: "resolved path coordinates exceed finite f32 geometry",
        } if *node == id
    )));
    assert_eq!(
        resolved.aabb_of(child),
        RectF {
            x: 0.0,
            y: 0.0,
            w: 1.0,
            h: 1.0,
        }
    );
    assert_eq!(resolved.aabb_of(id), resolved.aabb_of(child));
}
