//! Headless raster probe for the widget atoms — the coverage the
//! scene-state tests structurally cannot give: does the built widget
//! scene actually produce the right pixels through the engine's
//! painter? (The context-menu regression that shipped invisible rows
//! is why every visual primitive earns a raster test.)
//!
//! Shell-feature-gated (needs `skia-safe`); run with
//! `cargo test -p grida_editor --features shell --test widget_render`.
#![cfg(feature = "shell")]

use grida::node::schema::Size;
use grida::painter::Painter;
use grida::runtime::render_policy::RenderPolicy;

use grida_editor::ui::UiLayer;
use grida_editor::ui::bind::{Binding, BindingProperty};
use grida_editor::ui::field::Field;
use grida_editor::ui::widgets::{Segment, Segmented, Toggle, ToggleLook};

const VIEWPORT: Size = Size {
    width: 400.0,
    height: 300.0,
};

fn binding() -> Binding {
    Binding {
        property: BindingProperty::Name,
        targets: vec!["A".to_string()],
        label: "ui.test".to_string(),
        entry: None,
    }
}

fn layer() -> UiLayer {
    let mut ui = UiLayer::new(VIEWPORT);
    ui.fonts_mut().register_embedded_fonts();
    ui
}

/// Paint a UI layer onto a CPU surface and return its RGBA buffer.
fn rasterize(ui: &UiLayer, w: i32, h: i32) -> Vec<u8> {
    let mut surface = skia_safe::surfaces::raster_n32_premul((w, h)).expect("raster surface");
    let canvas = surface.canvas();
    canvas.clear(skia_safe::Color::TRANSPARENT);
    Painter::new_with_scene_cache(
        canvas,
        ui.fonts(),
        ui.images(),
        ui.cache(),
        RenderPolicy::default(),
    )
    .draw_layer_list(&ui.cache().layers);
    let image = surface.image_snapshot();
    let info = skia_safe::ImageInfo::new_n32_premul((w, h), None);
    let mut buf = vec![0u8; (w * h * 4) as usize];
    let ok = image.read_pixels(
        &info,
        &mut buf,
        (w * 4) as usize,
        (0, 0),
        skia_safe::image::CachingHint::Allow,
    );
    assert!(ok, "read_pixels");
    buf
}

/// Count dark, opaque pixels inside a rect (near-black — the widget's
/// filled-on regions and text).
fn dark_in(buf: &[u8], w: i32, x0: i32, y0: i32, x1: i32, y1: i32) -> usize {
    let mut n = 0;
    for y in y0..y1 {
        for x in x0..x1 {
            let i = ((y * w + x) * 4) as usize;
            if buf[i + 3] > 0 && buf[i] < 120 && buf[i + 1] < 120 && buf[i + 2] < 120 {
                n += 1;
            }
        }
    }
    n
}

/// A checked toggle fills its box dark; an unchecked one leaves it
/// white — the on-state paints markedly more dark pixels.
#[test]
fn toggle_on_paints_darker_than_off() {
    let (w, h) = (VIEWPORT.width as i32, VIEWPORT.height as i32);
    let region = |value| {
        let mut ui = layer();
        ui.mount(vec![Box::new(Toggle {
            id: "t".to_string(),
            value,
            look: ToggleLook::Check,
            size: 18.0,
            binding: binding(),
        })]);
        let b = ui.widget_bounds(&"t".to_string()).unwrap();
        let buf = rasterize(&ui, w, h);
        dark_in(
            &buf,
            w,
            b.x as i32,
            b.y as i32,
            (b.x + b.width) as i32,
            (b.y + b.height) as i32,
        )
    };
    let on = region(Field::Value(true));
    let off = region(Field::Value(false));
    assert!(
        on > off + 40,
        "checked toggle must paint markedly darker than unchecked — on={on} off={off}"
    );
}

/// The selected segment paints its dark fill; an unselected sibling
/// stays light — the segmented atom highlights exactly the active
/// cell.
#[test]
fn segmented_highlights_selected_cell() {
    let (w, h) = (VIEWPORT.width as i32, VIEWPORT.height as i32);
    let mut ui = layer();
    ui.mount(vec![Box::new(Segmented {
        id: "s".to_string(),
        options: vec![Segment::new("A"), Segment::new("B"), Segment::new("C")],
        selected: Field::Value(0),
        columns: 0,
        width: 120.0,
        height: 24.0,
        binding: binding(),
    })]);
    let b = ui.widget_bounds(&"s".to_string()).unwrap();
    let buf = rasterize(&ui, w, h);
    let cw = b.width / 3.0;
    // Cell 0 (selected) dark fill vs cell 2 (unselected) light. Sample
    // an interior band away from the text glyph to read the fill.
    let cell_fill = |c: i32| {
        let x0 = (b.x + cw * c as f32 + 4.0) as i32;
        let x1 = (b.x + cw * (c as f32 + 1.0) - 4.0) as i32;
        dark_in(&buf, w, x0, b.y as i32 + 2, x1, (b.y + b.height) as i32 - 2)
    };
    let selected = cell_fill(0);
    let unselected = cell_fill(2);
    assert!(
        selected > unselected + 40,
        "selected cell must fill dark, unselected stays light — sel={selected} unsel={unselected}"
    );
}

use grida::overlay::{Modifiers, PointerButton, SurfaceEvent};
use grida::text_edit::session::KeyName;
use grida_editor::ui::widgets::{Select, Text};

fn down(p: [f32; 2]) -> SurfaceEvent {
    SurfaceEvent::PointerDown {
        canvas_point: p,
        screen_point: p,
        button: PointerButton::Primary,
        modifiers: Modifiers::default(),
    }
}
fn up(p: [f32; 2]) -> SurfaceEvent {
    SurfaceEvent::PointerUp {
        canvas_point: p,
        screen_point: p,
        button: PointerButton::Primary,
        modifiers: Modifiers::default(),
    }
}

/// An open select paints its list below the button — the rows are a
/// floating scene root, exactly the class of scene that shipped
/// invisible in the menu. The strip below the button must gain opaque
/// pixels once open.
#[test]
fn select_open_list_paints_rows() {
    let (w, h) = (VIEWPORT.width as i32, VIEWPORT.height as i32);
    let mut ui = layer();
    ui.mount(vec![Box::new(Select {
        id: "sel".to_string(),
        options: vec!["a".to_string(), "b".to_string(), "c".to_string()],
        selected: Field::Value(0),
        width: 120.0,
        height: 22.0,
        binding: binding(),
    })]);
    let b = ui.widget_bounds(&"sel".to_string()).unwrap();
    let below = |buf: &[u8]| {
        dark_in(
            buf,
            w,
            b.x as i32,
            (b.y + b.height + 2.0) as i32,
            (b.x + b.width) as i32,
            (b.y + b.height + 3.0 * 22.0) as i32,
        )
    };
    let closed = below(&rasterize(&ui, w, h));
    // Open: press + release over the button keeps the list open.
    ui.pointer(&down([b.x + b.width / 2.0, b.y + b.height / 2.0]));
    ui.pointer(&up([b.x + b.width / 2.0, b.y + b.height / 2.0]));
    let open = below(&rasterize(&ui, w, h));
    assert!(
        open > closed + 20,
        "the open list must paint rows below the button — closed={closed} open={open}"
    );
}

/// A focused text input paints the typed buffer: after focusing and
/// typing, the field's interior gains dark text pixels.
#[test]
fn text_buffer_paints_when_typed() {
    let (w, h) = (VIEWPORT.width as i32, VIEWPORT.height as i32);
    let mut ui = layer();
    ui.mount(vec![Box::new(Text {
        id: "txt".to_string(),
        value: Field::Empty,
        placeholder: String::new(),
        width: 140.0,
        height: 20.0,
        binding: binding(),
    })]);
    let b = ui.widget_bounds(&"txt".to_string()).unwrap();
    let interior = |buf: &[u8]| {
        dark_in(
            buf,
            w,
            b.x as i32 + 2,
            b.y as i32 + 2,
            (b.x + b.width) as i32 - 2,
            (b.y + b.height) as i32 - 2,
        )
    };
    let blank = interior(&rasterize(&ui, w, h));
    ui.pointer(&down([b.x + 10.0, b.y + b.height / 2.0])); // focus
    for c in ["W", "W", "W", "W"] {
        ui.key(&KeyName::Character(c.to_string()), &Modifiers::default());
    }
    let typed = interior(&rasterize(&ui, w, h));
    assert!(
        typed > blank + 10,
        "typed text must paint in the field — blank={blank} typed={typed}"
    );
}

/// The quad paints its side value(s): the field text renders as dark
/// pixels inside the body (right of the mode button).
#[test]
fn quad_paints_field_values() {
    let (w, h) = (VIEWPORT.width as i32, VIEWPORT.height as i32);
    let mut ui = layer();
    ui.mount(vec![Box::new(grida_editor::ui::widgets::Quad {
        id: "q".to_string(),
        value: Field::Value([8.0; 4]),
        min: Some(0.0),
        width: 120.0,
        height: 20.0,
        binding: binding(),
    })]);
    let b = ui.widget_bounds(&"q".to_string()).unwrap();
    let buf = rasterize(&ui, w, h);
    // Sample the field area (right of the 20px mode button).
    let dark = dark_in(
        &buf,
        w,
        b.x as i32 + 22,
        b.y as i32 + 2,
        (b.x + b.width) as i32 - 2,
        (b.y + b.height) as i32 - 2,
    );
    assert!(dark > 4, "the quad must paint its value text — got {dark}");
}

/// The color picker paints a *proper* SV square: a white→hue
/// horizontal gradient (saturation) under a transparent→black
/// vertical gradient (value). Read at the top edge (value ≈ 1): the
/// left is near-white, the right is saturated red — the gradient, not
/// the old solid-hue placeholder.
#[test]
fn picker_plane_is_a_saturation_value_gradient() {
    use grida::cg::prelude::CGColor;
    let (w, h) = (VIEWPORT.width as i32, VIEWPORT.height as i32);
    let mut ui = layer();
    ui.mount(vec![Box::new(grida_editor::ui::widgets::ColorPicker {
        id: "cp".to_string(),
        value: Field::Value(CGColor::from_rgba(255, 0, 0, 255)),
        width: 180.0,
        origin: None,
        trigger: None,
        binding: binding(),
    })]);
    let b = ui.widget_bounds(&"cp".to_string()).unwrap();
    let buf = rasterize(&ui, w, h);
    let px = |x: i32, y: i32| -> (u8, u8, u8) {
        let i = ((y * w + x) * 4) as usize;
        (buf[i], buf[i + 1], buf[i + 2])
    };
    // Sample the top band (high value), avoiding the marker at s≈0/left.
    let ty = b.y as i32 + 8;
    let left = px(b.x as i32 + 12, ty);
    let right = px((b.x + b.width) as i32 - 12, ty);
    // Left ≈ white (all channels high); right ≈ red (r high, g/b low).
    assert!(
        left.0 > 180 && left.1 > 180 && left.2 > 180,
        "left of the SV plane is near-white (low saturation) — got {left:?}"
    );
    assert!(
        right.0 > 150 && right.1 < 110 && right.2 < 110,
        "right of the SV plane is saturated red — got {right:?}"
    );
    // Bottom (low value) is darker than the top at the same saturation.
    let top = px((b.x + b.width) as i32 - 12, b.y as i32 + 6);
    let bottom = px((b.x + b.width) as i32 - 12, b.y as i32 + 112);
    assert!(
        (bottom.0 as i32) < top.0 as i32,
        "the value axis darkens downward — top r={} bottom r={}",
        top.0,
        bottom.0
    );
}

/// Regression: a select NESTED in a positioned panel still opens its
/// list at the button's world position. The popover is a top-level
/// scene root, not a child of the panel row — the earlier bug parented
/// the list under the trigger's flex ancestor, double-offsetting it so
/// nothing appeared. (The isolated select tests all mounted it at Root,
/// which is why they missed this.)
#[test]
fn nested_select_list_paints_at_world_anchor() {
    use grida_editor::ui::widgets::Panel;
    let (w, h) = (VIEWPORT.width as i32, VIEWPORT.height as i32);
    let mut ui = layer();
    ui.mount(vec![Box::new(Panel {
        id: "p".to_string(),
        title: "P".to_string(),
        origin: (200.0, 40.0),
        width: 180.0,
        height: 260.0,
        children: vec![Box::new(Select {
            id: "sel".to_string(),
            options: vec!["a".to_string(), "b".to_string(), "c".to_string()],
            selected: Field::Value(0),
            width: 150.0,
            height: 22.0,
            binding: binding(),
        })],
    })]);
    let b = ui.widget_bounds(&"sel".to_string()).unwrap();
    let below = |buf: &[u8]| {
        dark_in(
            buf,
            w,
            b.x as i32,
            (b.y + b.height + 2.0) as i32,
            (b.x + b.width) as i32,
            (b.y + b.height + 3.0 * 22.0) as i32,
        )
    };
    let closed = below(&rasterize(&ui, w, h));
    let c = [b.x + b.width / 2.0, b.y + b.height / 2.0];
    ui.pointer(&down(c));
    ui.pointer(&up(c));
    let open = below(&rasterize(&ui, w, h));
    assert!(
        open > closed + 20,
        "the nested select's list must paint below its button at world coords — closed={closed} open={open}"
    );
}
