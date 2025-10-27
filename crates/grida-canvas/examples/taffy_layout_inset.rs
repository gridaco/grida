use skia_safe::{surfaces, Color, Font, FontMgr, Paint, Rect as SkRect};
use taffy::prelude::*;
use taffy::{Overflow, Point};

fn main() {
    // Create a surface to draw on
    let (width, height) = (1400, 2000);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Load font for labels
    let font_mgr = FontMgr::new();
    let typeface = font_mgr
        .match_family_style("Arial", skia_safe::FontStyle::default())
        .unwrap_or_else(|| {
            font_mgr
                .legacy_make_typeface(None, skia_safe::FontStyle::default())
                .unwrap()
        });
    let label_font = Font::new(typeface.clone(), 14.0);
    let title_font = Font::new(typeface.clone(), 28.0);
    let desc_font = Font::new(typeface.clone(), 12.0);

    let start_x = 50.0;
    let mut current_y = 120.0;
    let scenario_spacing = 100.0;

    // Draw title
    let mut title_paint = Paint::default();
    title_paint.set_anti_alias(true);
    title_paint.set_color(Color::BLACK);
    canvas.draw_str(
        "Inset Layout Model - Over-Constrained Scenarios (Taffy + Skia + Relative)",
        skia_safe::Point::new(start_x, 50.0),
        &title_font,
        &title_paint,
    );

    // Draw subtitle
    let mut desc_paint = Paint::default();
    desc_paint.set_anti_alias(true);
    desc_paint.set_color(Color::from_argb(160, 0, 0, 0));
    canvas.draw_str(
        "Demonstrates what happens when left + width + right is set and parent size changes",
        skia_safe::Point::new(start_x, 80.0),
        &desc_font,
        &desc_paint,
    );

    // Scenario 1: Wide parent (300px) - Plenty of space
    // left: 20, right: 20, width: 200 = needs 240px, has 300px
    {
        let layout = compute_layout(
            Some(200.0),
            Some(80.0),
            Some(lpa_length(20.0)),
            Some(lpa_length(20.0)),
            300.0,
            150.0,
        );

        let height_used = render_scenario(
            canvas,
            &layout,
            start_x,
            current_y,
            "Scenario 1: Wide Parent (300px)",
            "left: 20px, width: 200px, right: 20px (needs 240px total)",
            "✓ Plenty of space - all constraints satisfied",
            &label_font,
            &desc_font,
            300.0,
            150.0,
        );

        current_y += height_used + scenario_spacing;
    }

    // Scenario 2: Exact fit parent (240px)
    // left: 20, right: 20, width: 200 = needs 240px, has 240px
    {
        let layout = compute_layout(
            Some(200.0),
            Some(80.0),
            Some(lpa_length(20.0)),
            Some(lpa_length(20.0)),
            240.0,
            150.0,
        );

        let height_used = render_scenario(
            canvas,
            &layout,
            start_x,
            current_y,
            "Scenario 2: Exact Fit Parent (240px)",
            "left: 20px, width: 200px, right: 20px (needs 240px total)",
            "✓ Exact fit - all constraints satisfied",
            &label_font,
            &desc_font,
            240.0,
            150.0,
        );

        current_y += height_used + scenario_spacing;
    }

    // Scenario 3: Slightly tight parent (220px)
    // left: 20, right: 20, width: 200 = needs 240px, has 220px (20px short)
    {
        let layout = compute_layout(
            Some(200.0),
            Some(80.0),
            Some(lpa_length(20.0)),
            Some(lpa_length(20.0)),
            220.0,
            150.0,
        );

        let height_used = render_scenario(
            canvas,
            &layout,
            start_x,
            current_y,
            "Scenario 3: Slightly Tight Parent (220px)",
            "left: 20px, width: 200px, right: 20px (needs 240px, short by 20px)",
            "⚠ Over-constrained - Taffy ignores 'right' constraint",
            &label_font,
            &desc_font,
            220.0,
            150.0,
        );

        current_y += height_used + scenario_spacing;
    }

    // Scenario 4: Tight parent (200px)
    // left: 20, right: 20, width: 200 = needs 240px, has 200px (40px short)
    {
        let layout = compute_layout(
            Some(200.0),
            Some(80.0),
            Some(lpa_length(20.0)),
            Some(lpa_length(20.0)),
            200.0,
            150.0,
        );

        let height_used = render_scenario(
            canvas,
            &layout,
            start_x,
            current_y,
            "Scenario 4: Tight Parent (200px)",
            "left: 20px, width: 200px, right: 20px (needs 240px, short by 40px)",
            "⚠ Over-constrained - Taffy ignores 'right' constraint",
            &label_font,
            &desc_font,
            200.0,
            150.0,
        );

        current_y += height_used + scenario_spacing;
    }

    // Scenario 5: Very tight parent (150px)
    // left: 20, right: 20, width: 200 = needs 240px, has 150px (90px short)
    {
        let layout = compute_layout(
            Some(200.0),
            Some(80.0),
            Some(lpa_length(20.0)),
            Some(lpa_length(20.0)),
            150.0,
            150.0,
        );

        let height_used = render_scenario(
            canvas,
            &layout,
            start_x,
            current_y,
            "Scenario 5: Very Tight Parent (150px)",
            "left: 20px, width: 200px, right: 20px (needs 240px, short by 90px)",
            "⚠ Over-constrained - Taffy ignores 'right' and child overflows",
            &label_font,
            &desc_font,
            150.0,
            150.0,
        );

        current_y += height_used + scenario_spacing;
    }

    // Scenario 6: Comparing different inset combinations
    {
        let container_width = 200.0;
        let container_height = 350.0;

        // Draw label
        let mut label_paint = Paint::default();
        label_paint.set_anti_alias(true);
        label_paint.set_color(Color::from_argb(180, 0, 0, 0));
        canvas.draw_str(
            "Scenario 6: Comparing Different Inset Patterns (parent: 200px × 350px)",
            skia_safe::Point::new(start_x, current_y - 10.0),
            &label_font,
            &label_paint,
        );

        // Draw container outline
        let container_rect =
            SkRect::from_xywh(start_x, current_y + 20.0, container_width, container_height);
        draw_container_outline(canvas, &container_rect, "Parent Container", &desc_font);

        // 6a: Left + Width (right: auto)
        let layout_6a = compute_layout(
            Some(160.0),
            Some(60.0),
            Some(lpa_length(20.0)),
            None,
            container_width,
            container_height,
        );
        draw_child_with_label(
            canvas,
            &layout_6a,
            start_x,
            current_y + 20.0,
            "left: 20, width: 160, right: auto",
            &desc_font,
            Color::from_argb(200, 59, 130, 246), // blue
        );

        // 6b: Right + Width (left: auto)
        let layout_6b = compute_layout(
            Some(160.0),
            Some(60.0),
            None,
            Some(lpa_length(20.0)),
            container_width,
            container_height,
        );
        draw_child_with_label(
            canvas,
            &layout_6b,
            start_x,
            current_y + 20.0,
            "left: auto, width: 160, right: 20",
            &desc_font,
            Color::from_argb(200, 34, 197, 94), // green
        );

        // 6c: Left + Right (width: auto)
        let layout_6c = compute_layout(
            None,
            Some(60.0),
            Some(lpa_length(20.0)),
            Some(lpa_length(20.0)),
            container_width,
            container_height,
        );
        draw_child_with_label(
            canvas,
            &layout_6c,
            start_x,
            current_y + 20.0,
            "left: 20, width: auto, right: 20",
            &desc_font,
            Color::from_argb(200, 168, 85, 247), // purple
        );

        // 6d: Left + Right + Width (over-constrained)
        let layout_6d = compute_layout(
            Some(160.0),
            Some(60.0),
            Some(lpa_length(20.0)),
            Some(lpa_length(20.0)),
            container_width,
            container_height,
        );
        draw_child_with_label(
            canvas,
            &layout_6d,
            start_x,
            current_y + 20.0,
            "left: 20, width: 160, right: 20 (ignores right)",
            &desc_font,
            Color::from_argb(200, 239, 68, 68), // red
        );
    }

    // Save the result to a PNG file
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode png");
    std::fs::write(
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/goldens/taffy_layout_inset.png"
        ),
        data.as_bytes(),
    )
    .unwrap();

    println!("✓ Generated goldens/taffy_layout_inset.png");
}

/// Helper to create LengthPercentageAuto
fn lpa_length(val: f32) -> LengthPercentageAuto {
    LengthPercentageAuto::length(val)
}

/// Compute layout using Taffy directly
fn compute_layout(
    width: Option<f32>,
    height: Option<f32>,
    left: Option<LengthPercentageAuto>,
    right: Option<LengthPercentageAuto>,
    parent_width: f32,
    parent_height: f32,
) -> Layout {
    let mut taffy: TaffyTree<()> = TaffyTree::new();

    // Create child style with inset positioning
    let child_style = Style {
        position: Position::Relative,
        inset: Rect {
            left: left.unwrap_or_else(LengthPercentageAuto::auto),
            top: lpa_length(20.0),
            right: right.unwrap_or_else(LengthPercentageAuto::auto),
            bottom: LengthPercentageAuto::auto(),
        },
        size: Size {
            width: width.map(Dimension::length).unwrap_or_else(Dimension::auto),
            height: height
                .map(Dimension::length)
                .unwrap_or_else(Dimension::auto),
        },
        overflow: Point {
            x: Overflow::Hidden,
            y: Overflow::Hidden,
        },
        ..Default::default()
    };

    let child = taffy.new_leaf(child_style).unwrap();

    // Create parent container
    let parent_style = Style {
        size: Size {
            width: Dimension::length(parent_width),
            height: Dimension::length(parent_height),
        },
        ..Default::default()
    };

    let parent = taffy.new_with_children(parent_style, &[child]).unwrap();

    // Compute layout
    taffy
        .compute_layout(
            parent,
            Size {
                width: AvailableSpace::Definite(parent_width),
                height: AvailableSpace::Definite(parent_height),
            },
        )
        .unwrap();

    // Get child layout
    *taffy.layout(child).unwrap()
}

/// Render a single layout scenario
fn render_scenario(
    canvas: &skia_safe::Canvas,
    layout: &Layout,
    base_x: f32,
    base_y: f32,
    title: &str,
    subtitle: &str,
    result: &str,
    label_font: &Font,
    desc_font: &Font,
    container_width: f32,
    container_height: f32,
) -> f32 {
    // Draw title
    let mut title_paint = Paint::default();
    title_paint.set_anti_alias(true);
    title_paint.set_color(Color::from_argb(180, 0, 0, 0));
    canvas.draw_str(
        title,
        skia_safe::Point::new(base_x, base_y - 10.0),
        label_font,
        &title_paint,
    );

    // Draw subtitle (constraint info)
    let mut subtitle_paint = Paint::default();
    subtitle_paint.set_anti_alias(true);
    subtitle_paint.set_color(Color::from_argb(130, 0, 0, 0));
    canvas.draw_str(
        subtitle,
        skia_safe::Point::new(base_x, base_y + 10.0),
        desc_font,
        &subtitle_paint,
    );

    // Draw result
    let result_color = if result.starts_with('✓') {
        Color::from_argb(180, 0, 150, 0)
    } else {
        Color::from_argb(180, 200, 100, 0)
    };
    let mut result_paint = Paint::default();
    result_paint.set_anti_alias(true);
    result_paint.set_color(result_color);
    canvas.draw_str(
        result,
        skia_safe::Point::new(base_x, base_y + 28.0),
        desc_font,
        &result_paint,
    );

    // Draw container outline
    let container_rect =
        SkRect::from_xywh(base_x, base_y + 45.0, container_width, container_height);
    draw_container_outline(canvas, &container_rect, "Parent Container", desc_font);

    // Draw child
    let child_rect = SkRect::from_xywh(
        base_x + layout.location.x,
        base_y + 45.0 + layout.location.y,
        layout.size.width,
        layout.size.height,
    );

    // Fill child
    let mut child_paint = Paint::default();
    child_paint.set_anti_alias(true);
    child_paint.set_color(Color::from_argb(200, 59, 130, 246)); // blue

    let child_rrect = skia_safe::RRect::new_rect_radii(
        child_rect,
        &[
            skia_safe::Point::new(8.0, 8.0),
            skia_safe::Point::new(8.0, 8.0),
            skia_safe::Point::new(8.0, 8.0),
            skia_safe::Point::new(8.0, 8.0),
        ],
    );
    canvas.draw_rrect(&child_rrect, &child_paint);

    // Border child
    let mut border_paint = Paint::default();
    border_paint.set_anti_alias(true);
    border_paint.set_color(Color::from_argb(200, 30, 64, 175)); // darker blue
    border_paint.set_style(skia_safe::PaintStyle::Stroke);
    border_paint.set_stroke_width(2.0);
    canvas.draw_rrect(&child_rrect, &border_paint);

    // Draw child dimensions
    let mut dim_paint = Paint::default();
    dim_paint.set_anti_alias(true);
    dim_paint.set_color(Color::WHITE);
    let dim_text = format!("{}×{}", layout.size.width as i32, layout.size.height as i32);
    canvas.draw_str(
        &dim_text,
        skia_safe::Point::new(
            base_x + layout.location.x + layout.size.width / 2.0 - 20.0,
            base_y + 45.0 + layout.location.y + layout.size.height / 2.0 + 5.0,
        ),
        desc_font,
        &dim_paint,
    );

    // Draw position annotations
    draw_annotations(
        canvas,
        layout,
        base_x,
        base_y + 45.0,
        container_width,
        container_height,
        desc_font,
    );

    // Return total height used
    60.0 + container_height
}

/// Draw container outline with label
fn draw_container_outline(canvas: &skia_safe::Canvas, rect: &SkRect, label: &str, font: &Font) {
    // Draw outline
    let mut outline_paint = Paint::default();
    outline_paint.set_anti_alias(true);
    outline_paint.set_color(Color::from_argb(60, 0, 0, 0));
    outline_paint.set_style(skia_safe::PaintStyle::Stroke);
    outline_paint.set_stroke_width(2.0);
    outline_paint.set_path_effect(skia_safe::dash_path_effect::new(&[8.0, 4.0], 0.0));
    canvas.draw_rect(rect, &outline_paint);

    // Draw label
    let mut label_paint = Paint::default();
    label_paint.set_anti_alias(true);
    label_paint.set_color(Color::from_argb(100, 0, 0, 0));
    canvas.draw_str(
        label,
        skia_safe::Point::new(rect.left + 5.0, rect.top + 15.0),
        font,
        &label_paint,
    );

    // Draw dimensions
    let dim_text = format!("{}×{}", rect.width() as i32, rect.height() as i32);
    canvas.draw_str(
        &dim_text,
        skia_safe::Point::new(rect.left + 5.0, rect.bottom() - 5.0),
        font,
        &label_paint,
    );
}

/// Draw measurement annotations
fn draw_annotations(
    canvas: &skia_safe::Canvas,
    layout: &Layout,
    base_x: f32,
    base_y: f32,
    container_width: f32,
    _container_height: f32,
    font: &Font,
) {
    let mut anno_paint = Paint::default();
    anno_paint.set_anti_alias(true);
    anno_paint.set_color(Color::from_argb(150, 200, 0, 0));

    // Left spacing
    if layout.location.x > 0.0 {
        let left_line_y = base_y + layout.location.y + layout.size.height + 15.0;
        canvas.draw_line(
            skia_safe::Point::new(base_x, left_line_y),
            skia_safe::Point::new(base_x + layout.location.x, left_line_y),
            &anno_paint,
        );
        canvas.draw_str(
            &format!("left: {}", layout.location.x as i32),
            skia_safe::Point::new(base_x + layout.location.x / 2.0 - 15.0, left_line_y - 5.0),
            font,
            &anno_paint,
        );
    }

    // Right spacing
    let right_space = container_width - (layout.location.x + layout.size.width);
    if right_space > 0.5 {
        let right_line_y = base_y + layout.location.y + layout.size.height + 15.0;
        let right_start_x = base_x + layout.location.x + layout.size.width;
        let right_end_x = base_x + container_width;
        canvas.draw_line(
            skia_safe::Point::new(right_start_x, right_line_y),
            skia_safe::Point::new(right_end_x, right_line_y),
            &anno_paint,
        );
        canvas.draw_str(
            &format!("right: {}", right_space as i32),
            skia_safe::Point::new(right_start_x + right_space / 2.0 - 18.0, right_line_y - 5.0),
            font,
            &anno_paint,
        );
    }
}

/// Draw child with label for comparison scenarios
fn draw_child_with_label(
    canvas: &skia_safe::Canvas,
    layout: &Layout,
    base_x: f32,
    base_y: f32,
    label: &str,
    font: &Font,
    color: Color,
) {
    let child_rect = SkRect::from_xywh(
        base_x + layout.location.x,
        base_y + layout.location.y,
        layout.size.width,
        layout.size.height,
    );

    // Fill
    let mut child_paint = Paint::default();
    child_paint.set_anti_alias(true);
    child_paint.set_color(color);

    let child_rrect = skia_safe::RRect::new_rect_radii(
        child_rect,
        &[
            skia_safe::Point::new(6.0, 6.0),
            skia_safe::Point::new(6.0, 6.0),
            skia_safe::Point::new(6.0, 6.0),
            skia_safe::Point::new(6.0, 6.0),
        ],
    );
    canvas.draw_rrect(&child_rrect, &child_paint);

    // Border
    let mut border_paint = Paint::default();
    border_paint.set_anti_alias(true);
    border_paint.set_color(color.with_a(255));
    border_paint.set_style(skia_safe::PaintStyle::Stroke);
    border_paint.set_stroke_width(2.0);
    canvas.draw_rrect(&child_rrect, &border_paint);

    // Label
    let mut label_paint = Paint::default();
    label_paint.set_anti_alias(true);
    label_paint.set_color(Color::WHITE);
    canvas.draw_str(
        label,
        skia_safe::Point::new(
            base_x + layout.location.x + 5.0,
            base_y + layout.location.y + layout.size.height / 2.0 + 4.0,
        ),
        font,
        &label_paint,
    );
}
