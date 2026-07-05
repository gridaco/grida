//! Headless raster probe for the context-menu presenter — the
//! coverage the scene-state tests structurally cannot give: does the
//! built menu scene actually produce pixels through the engine's
//! painter?
//!
//! Shell-feature-gated: it needs `skia-safe` (the painter/raster
//! surface), which only the shell build pulls in. Run with
//! `cargo test -p grida_editor --features shell --test menu_render`.
#![cfg(feature = "shell")]

use std::collections::HashMap;

use grida::node::factory::NodeFactory;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{Node, Scene, Size};
use grida::painter::Painter;
use grida::runtime::render_policy::RenderPolicy;

use grida_editor::document::WorkingCopy;
use grida_editor::editor::Editor;
use grida_editor::keys;
use grida_editor::menu;
use grida_editor::ui::UiLayer;
use grida_editor::ui::menu::ContextMenu;

fn one_rect_editor() -> Editor {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();
    let iid = graph.append_child(Node::Rectangle(nf.create_rectangle_node()), Parent::Root);
    graph.set_name(iid, "A".to_string());
    id_map.insert(iid, "A".to_string());
    let scene = Scene {
        name: "render".to_string(),
        background_color: None,
        graph,
    };
    Editor::new(WorkingCopy::from_scene(scene, id_map))
}

/// The built menu scene rasterizes to visible pixels: painting
/// `menu_ui` onto a CPU surface fills the panel region. This is the
/// gap that let an invisible-but-well-formed scene ship — the
/// capture-routed tests assert the scene *tree*, never that it paints.
#[test]
fn menu_paints_pixels_in_its_panel_region() {
    let editor = one_rect_editor();
    let data = menu::canvas_menu(editor.document(), &["A".to_string()]);
    let (w, h) = (700i32, 700i32);
    let mut ui = UiLayer::new(Size {
        width: w as f32,
        height: h as f32,
    });
    ui.fonts_mut().register_embedded_fonts();
    let mut host = ContextMenu::new(keys::Platform::Mac);
    // Open far from the origin — the shell opens at the click point,
    // well away from the zero-size anchor root at (0,0). The engine
    // must lay out the panel there regardless of the anchor's box.
    let anchor = [300.0f32, 300.0];
    host.open(&mut ui, data, anchor);

    let mut surface = skia_safe::surfaces::raster_n32_premul((w, h)).expect("raster surface");
    let canvas = surface.canvas();
    canvas.clear(skia_safe::Color::TRANSPARENT);
    let painter = Painter::new_with_scene_cache(
        canvas,
        ui.fonts(),
        ui.images(),
        ui.cache(),
        RenderPolicy::default(),
    );
    painter.draw_layer_list(&ui.cache().layers);

    // Read the pixels back and count opacity.
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

    let opaque = buf.chunks_exact(4).filter(|px| px[3] > 0).count();
    // Count opaque pixels inside the panel box at the placement origin
    // (menu.rs MENU_W = 180; the panel is at least ~150 px tall).
    let (ox, oy) = (anchor[0] as i32, anchor[1] as i32);
    let mut in_panel = 0usize;
    for y in oy..(oy + 150).min(h) {
        for x in ox..(ox + 180).min(w) {
            let i = ((y * w + x) * 4) as usize;
            if buf[i + 3] > 0 {
                in_panel += 1;
            }
        }
    }
    // The panel fills its region at the far origin, and the menu
    // paints no full-viewport fill (opaque pixels ≈ the panel only,
    // never the whole surface).
    assert!(
        in_panel > 5000,
        "the menu panel must fill its region at the placement origin — got {in_panel} opaque px"
    );
    assert!(
        opaque < (w * h) as usize / 2,
        "the menu must paint only its panel, not a full-surface fill — got {opaque} opaque px of {}",
        w * h
    );
}

/// Every action row paints its text — not just the first. The menu's
/// rows are laid out by flex flow; the engine lays out only the first
/// *absolute* child of a Flex parent, so an earlier absolute-per-row
/// layout rendered only row 0 (a shipped regression). Dark = the
/// enabled rows' near-black label text; disabled rows and separators
/// carry none, so this counts distinct rows that painted text.
#[test]
fn every_enabled_row_paints_its_text() {
    use grida_editor::menu::Item;
    use grida_editor::ui::menu::item_offsets;
    let editor = one_rect_editor();
    let data = menu::canvas_menu(editor.document(), &["A".to_string()]);
    let (w, h) = (700i32, 700i32);
    let mut ui = UiLayer::new(Size {
        width: w as f32,
        height: h as f32,
    });
    ui.fonts_mut().register_embedded_fonts();
    let mut host = ContextMenu::new(keys::Platform::Mac);
    let anchor = [300.0f32, 300.0];
    host.open(&mut ui, data.clone(), anchor);

    let buf = rasterize(&ui, w, h);
    let dark = |x: i32, y: i32| -> bool {
        let i = ((y * w + x) * 4) as usize;
        buf[i + 3] > 0 && buf[i] < 120 && buf[i + 1] < 120 && buf[i + 2] < 120
    };
    let (offsets, _) = item_offsets(&data.items);
    let mut rows_with_text = 0;
    for (idx, (y, hgt)) in offsets.iter().enumerate() {
        if !matches!(data.items[idx], Item::Action(ref a) if a.enabled) {
            continue;
        }
        let band_y = (anchor[1] + y + hgt * 0.5) as i32;
        let painted = (anchor[0] as i32..anchor[0] as i32 + 180)
            .any(|x| (band_y - 4..band_y + 4).any(|yy| dark(x, yy)));
        assert!(painted, "row {idx} (an enabled action) painted no text");
        rows_with_text += 1;
    }
    // Copy, Paste, Copy name, Copy ID, Flatten, Zoom to fit, Hide,
    // Delete — the enabled actions for a single-node doc.
    assert!(
        rows_with_text >= 6,
        "too few rows painted: {rows_with_text}"
    );
}

/// An open submenu paints as its own panel, positioned beside the
/// main one (not detached to the viewport edge — the shipped
/// mispositioning bug). The two panels are independent top-level
/// roots; a second absolute panel sibling under one parent would not
/// render.
#[test]
fn submenu_paints_beside_the_main_panel() {
    use grida_editor::menu::Item;
    use grida_editor::ui::menu::MenuKey;
    let editor = one_rect_editor();
    let data = menu::canvas_menu(editor.document(), &["A".to_string()]);
    let (w, h) = (700i32, 700i32);
    let mut ui = UiLayer::new(Size {
        width: w as f32,
        height: h as f32,
    });
    ui.fonts_mut().register_embedded_fonts();
    let mut host = ContextMenu::new(keys::Platform::Mac);
    let anchor = [300.0f32, 300.0];
    host.open(&mut ui, data.clone(), anchor);
    // Walk down to the "Copy as" submenu row and open it.
    let sub_idx = data
        .items
        .iter()
        .position(|i| matches!(i, Item::Submenu(_)))
        .unwrap();
    for _ in 0..=sub_idx {
        host.key(&mut ui, MenuKey::Down);
    }
    host.key(&mut ui, MenuKey::Right);

    let buf = rasterize(&ui, w, h);
    // Scan the strip just right of the main panel (main ends at
    // origin.x + MENU_W = 480) for the submenu's opaque pixels.
    let right = anchor[0] as i32 + 180;
    let mut min_x = w;
    let mut found = 0;
    for y in 0..h {
        for x in right..w {
            let i = ((y * w + x) * 4) as usize;
            if buf[i + 3] > 0 {
                found += 1;
                min_x = min_x.min(x);
            }
        }
    }
    assert!(
        found > 2000,
        "the submenu panel must paint — got {found} px"
    );
    assert!(
        min_x <= right + 8,
        "the submenu sits beside the main panel (left edge ~{right}), not detached — got {min_x}"
    );
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
