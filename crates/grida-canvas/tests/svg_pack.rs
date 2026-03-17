//! Tests for SVG pack pipeline.
//!
//! These tests validate that `svg_pack` (usvg parse -> IR conversion -> JSON serialization)
//! succeeds on a wide range of SVG inputs that users (and AI tools) commonly produce.
//!
//! For bulk-testing large external SVG corpora, use the `tool_svg_batch` example instead:
//!   cargo run --example tool_svg_batch -- /path/to/svgs

use cg::io::io_svg::{svg_optimize, svg_pack};
use cg::svg::SVGPackedScene;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Asserts that `svg_pack` succeeds and returns the deserialized scene.
fn assert_pack_ok(svg: &str) -> SVGPackedScene {
    let json = svg_pack(svg).unwrap_or_else(|err| panic!("svg_pack failed: {}", err));
    serde_json::from_str::<SVGPackedScene>(&json)
        .unwrap_or_else(|err| panic!("Failed to deserialize packed SVG: {}", err))
}

/// Asserts that `svg_optimize` succeeds and returns the optimized SVG string.
fn assert_optimize_ok(svg: &str) -> String {
    svg_optimize(svg).unwrap_or_else(|err| panic!("svg_optimize failed: {}", err))
}

/// Asserts that `svg_pack` succeeds and the scene has the expected dimensions.
fn assert_pack_dims(svg: &str, expected_w: f32, expected_h: f32) {
    let scene = assert_pack_ok(svg);
    assert!(
        (scene.svg.width - expected_w).abs() < 0.1,
        "width mismatch: got {} expected {}",
        scene.svg.width,
        expected_w
    );
    assert!(
        (scene.svg.height - expected_h).abs() < 0.1,
        "height mismatch: got {} expected {}",
        scene.svg.height,
        expected_h
    );
}

/// Count total IR child nodes (recursively).
fn count_nodes(scene: &SVGPackedScene) -> usize {
    fn count(children: &[cg::cg::svg::IRSVGChildNode]) -> usize {
        children
            .iter()
            .map(|c| match c {
                cg::cg::svg::IRSVGChildNode::Group(g) => 1 + count(&g.children),
                _ => 1,
            })
            .sum()
    }
    count(&scene.svg.children)
}

// ---------------------------------------------------------------------------
// Inline SVG fixtures — covering common AI-generated patterns
// ---------------------------------------------------------------------------

#[test]
fn pack_basic_rect() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect x="10" y="10" width="80" height="80" fill="red"/>
    </svg>"##;
    let scene = assert_pack_ok(svg);
    assert_pack_dims(svg, 100.0, 100.0);
    assert!(count_nodes(&scene) > 0, "should have at least one node");
}

#[test]
fn pack_basic_shapes() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <rect x="10" y="10" width="80" height="80" fill="#ff0000"/>
      <circle cx="150" cy="50" r="40" fill="#00ff00"/>
      <ellipse cx="50" cy="150" rx="40" ry="30" fill="#0000ff"/>
      <line x1="100" y1="120" x2="190" y2="190" stroke="black" stroke-width="2"/>
      <polygon points="150,110 190,190 110,190" fill="orange"/>
    </svg>"##;
    let scene = assert_pack_ok(svg);
    assert!(count_nodes(&scene) >= 5, "should have 5+ nodes for 5 shapes");
}

#[test]
fn pack_no_xmlns() {
    // Many AI tools omit xmlns. usvg should still handle this.
    let svg = r##"<svg width="100" height="100" viewBox="0 0 100 100">
      <rect x="10" y="10" width="80" height="80" fill="red"/>
    </svg>"##;
    // This may or may not succeed depending on usvg — we document the behavior.
    let result = svg_pack(svg);
    // If this passes, great. If not, the error message is useful for diagnostics.
    match result {
        Ok(_) => {} // usvg accepted it
        Err(err) => {
            eprintln!("NOTE: no-xmlns SVG rejected by usvg (expected on strict parsers): {err}");
        }
    }
}

#[test]
fn pack_viewbox_only_no_width_height() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="black"/>
    </svg>"##;
    let scene = assert_pack_ok(svg);
    assert_pack_dims(svg, 24.0, 24.0);
    assert!(count_nodes(&scene) > 0);
}

#[test]
fn pack_css_style_block() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <style>
        .cls-1 { fill: #ff6347; }
        .cls-2 { fill: #4682b4; stroke: #333; stroke-width: 2; }
      </style>
      <rect class="cls-1" x="10" y="10" width="80" height="80"/>
      <circle class="cls-2" cx="150" cy="50" r="40"/>
    </svg>"##;
    let scene = assert_pack_ok(svg);
    assert!(count_nodes(&scene) >= 2);
}

#[test]
fn pack_bare_ampersand_in_style() {
    // AI-generated SVGs often have unescaped & in Google Fonts @import URLs
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Roboto&display=swap');
        .t { font-family: Inter, sans-serif; fill: black; }
      </style>
      <text x="10" y="40" class="t">Hello</text>
    </svg>"##;
    assert_pack_ok(svg);
}

#[test]
fn pack_nested_groups() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
      <g transform="translate(50,50)">
        <g transform="rotate(45 100 100)">
          <rect x="50" y="50" width="100" height="100" fill="blue" opacity="0.5"/>
          <g transform="scale(0.5)">
            <circle cx="200" cy="200" r="80" fill="red" opacity="0.7"/>
          </g>
        </g>
      </g>
    </svg>"##;
    let scene = assert_pack_ok(svg);
    // Should have nested group structure
    assert!(count_nodes(&scene) >= 4);
}

#[test]
fn pack_linear_gradient() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <defs>
        <linearGradient id="lg1" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#ff0000"/>
          <stop offset="100%" stop-color="#0000ff"/>
        </linearGradient>
      </defs>
      <rect x="10" y="10" width="180" height="180" fill="url(#lg1)"/>
    </svg>"##;
    assert_pack_ok(svg);
}

#[test]
fn pack_radial_gradient() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <defs>
        <radialGradient id="rg1" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="white"/>
          <stop offset="100%" stop-color="black"/>
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="80" fill="url(#rg1)"/>
    </svg>"##;
    assert_pack_ok(svg);
}

#[test]
fn pack_radial_gradient_with_focal_point() {
    // fx/fy different from cx/cy — our code currently falls back to transparent paint
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <defs>
        <radialGradient id="rg1" cx="50%" cy="50%" r="50%" fx="25%" fy="25%">
          <stop offset="0%" stop-color="white"/>
          <stop offset="100%" stop-color="black"/>
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="80" fill="url(#rg1)"/>
    </svg>"##;
    // Should not fail — just degrades gracefully
    assert_pack_ok(svg);
}

#[test]
fn pack_use_and_defs() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
         width="200" height="200" viewBox="0 0 200 200">
      <defs>
        <circle id="myCircle" cx="0" cy="0" r="20" fill="blue"/>
      </defs>
      <use href="#myCircle" x="50" y="50"/>
      <use href="#myCircle" x="150" y="50"/>
      <use xlink:href="#myCircle" x="100" y="150"/>
    </svg>"##;
    let scene = assert_pack_ok(svg);
    // usvg should inline <use> references
    assert!(count_nodes(&scene) >= 3, "use elements should be inlined");
}

#[test]
fn pack_clip_path() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <defs>
        <clipPath id="clip1">
          <circle cx="100" cy="100" r="80"/>
        </clipPath>
      </defs>
      <rect x="0" y="0" width="200" height="200" fill="blue" clip-path="url(#clip1)"/>
    </svg>"##;
    assert_pack_ok(svg);
}

#[test]
fn pack_mask() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <defs>
        <mask id="mask1">
          <rect width="200" height="200" fill="white"/>
          <circle cx="100" cy="100" r="40" fill="black"/>
        </mask>
      </defs>
      <rect x="0" y="0" width="200" height="200" fill="red" mask="url(#mask1)" opacity="0.5"/>
    </svg>"##;
    assert_pack_ok(svg);
}

#[test]
fn pack_complex_paths() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
      <path d="M10 80 C 40 10, 65 10, 95 80 S 150 150, 180 80" fill="none" stroke="black" stroke-width="2"/>
      <path d="M10 200 Q 95 150 180 200 T 350 200" fill="none" stroke="blue" stroke-width="2"/>
      <path d="M80 280 A 45 45 0 0 0 125 325 A 45 45 0 0 0 80 280 Z" fill="green" opacity="0.6"/>
      <path d="M200 10 L250 50 Q300 10 350 50 C350 100 300 100 300 150 L250 190 Z" fill="purple"/>
      <path d="M10 320 h50 v50 h-50 Z M70 320 h50 v50 h-50 Z" fill="orange"/>
    </svg>"##;
    let scene = assert_pack_ok(svg);
    assert!(count_nodes(&scene) >= 5, "should have 5 path nodes");
}

#[test]
fn pack_text_element() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
      <text x="10" y="40" font-family="Arial" font-size="24" fill="black">Hello World</text>
    </svg>"##;
    let scene = assert_pack_ok(svg);
    // Verify text was NOT silently dropped by usvg (requires a font in the fontdb)
    assert!(
        count_nodes(&scene) >= 1,
        "text node must not be silently dropped",
    );
    // Check the JSON directly for kind=text
    let json = svg_pack(svg).unwrap();
    assert!(
        json.contains(r##""kind":"text""##),
        "JSON must contain a text node, got: {}",
        &json[..json.len().min(300)],
    );
}

#[test]
fn pack_text_with_tspan() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
      <text x="10" y="80" font-size="18" fill="#333">
        <tspan x="10" dy="0" fill="red">Red text</tspan>
        <tspan x="10" dy="25" fill="blue">Blue text</tspan>
      </text>
    </svg>"##;
    let scene = assert_pack_ok(svg);
    assert!(
        count_nodes(&scene) >= 1,
        "text with tspan must not be silently dropped",
    );
    let json = svg_pack(svg).unwrap();
    assert!(
        json.contains(r##""kind":"text""##),
        "JSON must contain a text node",
    );
    assert!(
        json.contains("Red text"),
        "JSON must contain span text content",
    );
}

#[test]
fn pack_text_with_named_and_generic_fonts() {
    // AI-generated SVGs commonly use named fonts (Arial, Segoe UI) and generic
    // families (sans-serif). On WASM where no system fonts exist, our embedded
    // font must act as fallback for all of them.
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">
      <text x="50" y="80" font-family="Arial" font-size="48" fill="black">Title</text>
      <text x="50" y="130" font-family="sans-serif" font-size="18" fill="gray">Subtitle</text>
    </svg>"##;
    let json = svg_pack(svg).unwrap();
    // Both text elements must survive — count occurrences of "kind":"text"
    let count = json.matches(r##""kind":"text""##).count();
    assert_eq!(count, 2, "both text nodes must be preserved, got {}", count);
}

#[test]
fn pack_transforms() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
      <rect x="50" y="50" width="60" height="60" fill="red" transform="rotate(30 80 80)"/>
      <rect x="200" y="50" width="60" height="60" fill="blue" transform="skewX(20)"/>
      <rect x="50" y="200" width="60" height="60" fill="green" transform="scale(1.5) translate(10,10)"/>
      <rect x="200" y="200" width="60" height="60" fill="purple" transform="matrix(0.866 0.5 -0.5 0.866 100 -50)"/>
    </svg>"##;
    assert_pack_ok(svg);
}

#[test]
fn pack_stroke_variants() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
      <line x1="10" y1="30" x2="290" y2="30" stroke="black" stroke-width="1"/>
      <line x1="10" y1="60" x2="290" y2="60" stroke="black" stroke-width="4" stroke-linecap="round"/>
      <line x1="10" y1="90" x2="290" y2="90" stroke="black" stroke-width="4" stroke-linecap="square"/>
      <line x1="10" y1="120" x2="290" y2="120" stroke="black" stroke-width="4" stroke-dasharray="10,5"/>
      <polyline points="10,200 50,180 90,220 130,180 170,220 210,180 250,220 290,200"
                fill="none" stroke="red" stroke-width="3" stroke-linejoin="round"/>
    </svg>"##;
    assert_pack_ok(svg);
}

#[test]
fn pack_opacity_and_group_opacity() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <rect x="20" y="20" width="100" height="100" fill="red"/>
      <rect x="80" y="80" width="100" height="100" fill="blue" opacity="0.5"/>
      <g opacity="0.6">
        <rect x="40" y="120" width="60" height="40" fill="yellow"/>
        <rect x="100" y="120" width="60" height="40" fill="purple"/>
      </g>
    </svg>"##;
    assert_pack_ok(svg);
}

#[test]
fn pack_currentcolor() {
    // AI icon generators heavily use currentColor
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>"##;
    assert_pack_ok(svg);
}

#[test]
fn pack_empty_svg() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>"##;
    let scene = assert_pack_ok(svg);
    assert_eq!(count_nodes(&scene), 0, "empty SVG should have no child nodes");
}

#[test]
fn pack_pattern_fill() {
    // Pattern fills are not natively supported in our IR but should not crash
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <defs>
        <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="5" fill="blue"/>
        </pattern>
      </defs>
      <rect x="10" y="10" width="80" height="80" fill="url(#dots)"/>
    </svg>"##;
    // Should not crash. Pattern paint falls back to transparent.
    assert_pack_ok(svg);
}

#[test]
fn pack_filter_effects() {
    // Filters are common in AI SVGs (drop-shadow, blur, etc.)
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">
      <defs>
        <filter id="blur">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5"/>
        </filter>
        <filter id="dropShadow">
          <feDropShadow dx="3" dy="3" stdDeviation="2" flood-color="black" flood-opacity="0.5"/>
        </filter>
      </defs>
      <rect x="10" y="10" width="80" height="80" fill="red" filter="url(#blur)"/>
      <circle cx="180" cy="50" r="40" fill="blue" filter="url(#dropShadow)"/>
    </svg>"##;
    assert_pack_ok(svg);
}

#[test]
fn pack_embedded_image() {
    // Image elements should not crash the pipeline (just ignored in IR)
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
         width="200" height="200" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="#eee"/>
      <image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==" x="50" y="50" width="100" height="100"/>
    </svg>"##;
    assert_pack_ok(svg);
}

#[test]
fn pack_percentage_dimensions() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 200 200">
      <circle cx="100" cy="100" r="80" fill="#333"/>
    </svg>"##;
    // usvg should use viewBox to determine size when width/height are percentages
    assert_pack_ok(svg);
}

#[test]
fn pack_mixed_units() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="10cm" height="10cm" viewBox="0 0 100 100">
      <rect x="10" y="10" width="80" height="80" fill="green"/>
    </svg>"##;
    assert_pack_ok(svg);
}

#[test]
fn pack_foreign_object() {
    // foreignObject is common in AI SVGs but unsupported by usvg
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">
      <rect width="300" height="200" fill="#f0f0f0"/>
      <circle cx="150" cy="100" r="80" fill="blue" opacity="0.3"/>
      <foreignObject x="50" y="50" width="200" height="100">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-size: 16px; color: white;">
          <p>This is HTML inside SVG</p>
        </div>
      </foreignObject>
    </svg>"##;
    // foreignObject is ignored by usvg but should not crash the pipeline
    assert_pack_ok(svg);
}

#[test]
fn pack_marker_elements() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="red"/>
        </marker>
      </defs>
      <line x1="20" y1="100" x2="250" y2="100" stroke="black" stroke-width="2" marker-end="url(#arrowhead)"/>
    </svg>"##;
    assert_pack_ok(svg);
}

#[test]
fn pack_ai_chatgpt_style_logo() {
    // Complex AI-generated logo with style blocks, gradients, clip-paths, filters, text
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <style>
        .bg { fill: #1a1a2e; }
        .accent { fill: #e94560; }
        .shadow { filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3)); }
      </style>
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1a1a2e"/>
          <stop offset="100%" stop-color="#16213e"/>
        </linearGradient>
        <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#e94560"/>
          <stop offset="100%" stop-color="#c23152"/>
        </linearGradient>
        <clipPath id="roundedBg">
          <rect width="512" height="512" rx="64" ry="64"/>
        </clipPath>
      </defs>
      <g clip-path="url(#roundedBg)">
        <rect width="512" height="512" fill="url(#bgGrad)"/>
        <circle cx="256" cy="200" r="120" fill="url(#accentGrad)"/>
        <path d="M256 120 L290 180 L330 180 L300 210 L310 250 L256 225 L202 250 L212 210 L182 180 L222 180 Z" fill="white" opacity="0.9"/>
        <g>
          <rect x="100" y="340" width="312" height="4" rx="2" fill="#e94560"/>
        </g>
        <text x="256" y="400" text-anchor="middle" font-size="48" font-weight="bold" fill="white">BRAND</text>
        <text x="256" y="440" text-anchor="middle" font-size="18" fill="#cccccc" letter-spacing="8">CREATIVE STUDIO</text>
      </g>
    </svg>"##;
    let scene = assert_pack_ok(svg);
    assert!(
        count_nodes(&scene) >= 5,
        "complex logo should produce many IR child nodes",
    );
}

#[test]
fn pack_ai_landscape_illustration() {
    // Large scene with many shapes — typical AI-generated illustration
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
      <defs>
        <linearGradient id="skyGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#87CEEB"/>
          <stop offset="100%" stop-color="#E0F7FF"/>
        </linearGradient>
        <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#FFF9C4"/>
          <stop offset="40%" stop-color="#FFEB3B"/>
          <stop offset="100%" stop-color="#FF9800" stop-opacity="0"/>
        </radialGradient>
        <clipPath id="sceneClip">
          <rect width="800" height="600"/>
        </clipPath>
        <filter id="shadow">
          <feDropShadow dx="2" dy="4" stdDeviation="3" flood-color="rgba(0,0,0,0.3)"/>
        </filter>
      </defs>
      <g clip-path="url(#sceneClip)">
        <rect width="800" height="400" fill="url(#skyGradient)"/>
        <circle cx="650" cy="100" r="80" fill="url(#sunGlow)"/>
        <circle cx="650" cy="100" r="40" fill="#FFD700"/>
        <g opacity="0.8" transform="translate(100, 80)">
          <ellipse cx="0" cy="0" rx="60" ry="25" fill="white"/>
          <ellipse cx="40" cy="-10" rx="50" ry="20" fill="white"/>
        </g>
        <polygon points="0,400 150,200 300,400" fill="#6D4C41"/>
        <polygon points="200,400 400,150 600,400" fill="#795548"/>
        <rect y="400" width="800" height="200" fill="#4CAF50"/>
        <g transform="translate(100, 380)">
          <rect x="-5" y="0" width="10" height="40" fill="#5D4037"/>
          <polygon points="0,-40 -25,0 25,0" fill="#2E7D32"/>
        </g>
        <g filter="url(#shadow)" transform="translate(350, 350)">
          <rect x="0" y="20" width="100" height="80" fill="#D32F2F"/>
          <polygon points="-10,20 50,-20 110,20" fill="#B71C1C"/>
          <rect x="35" y="55" width="30" height="45" fill="#5D4037"/>
        </g>
        <path d="M400 500 Q420 450 410 400" fill="none" stroke="#9E9E9E" stroke-width="20" stroke-linecap="round"/>
      </g>
    </svg>"##;
    let scene = assert_pack_ok(svg);
    assert!(
        count_nodes(&scene) >= 10,
        "landscape should have many nodes, got {}",
        count_nodes(&scene)
    );
}

// ---------------------------------------------------------------------------
// svg_optimize tests — these verify the CSS resolution path
// ---------------------------------------------------------------------------

#[test]
fn optimize_resolves_css_classes() {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <style>.red { fill: #ff0000; }</style>
      <rect class="red" x="10" y="10" width="80" height="80"/>
    </svg>"##;
    let optimized = assert_optimize_ok(svg);
    // The optimized output should have the style inlined
    assert!(
        !optimized.contains("<style>"),
        "style block should be resolved and removed",
    );
}

#[test]
fn optimize_then_pack() {
    // This is the full pipeline: optimize (resolve CSS) then pack
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <style>.cls-1 { fill: #ff6347; } .cls-2 { fill: none; stroke: green; stroke-width: 3; }</style>
      <rect class="cls-1" x="10" y="10" width="80" height="80"/>
      <circle class="cls-2" cx="150" cy="50" r="40"/>
    </svg>"##;
    let optimized = assert_optimize_ok(svg);
    let scene = assert_pack_ok(&optimized);
    assert!(count_nodes(&scene) >= 2);
}

// ---------------------------------------------------------------------------
// Nested transform tests
// ---------------------------------------------------------------------------

/// Verify that nodes under Group parents receive correct world transforms
/// when the layout engine is involved.
///
/// Groups don't participate in Taffy layout, so their children become
/// independent Taffy subtree roots. This test ensures those extra roots
/// get their schema positions applied correctly (not left at Taffy's
/// default 0,0).
#[test]
fn pack_nested_transforms_world_positions() {
    use cg::cache::geometry::GeometryCache;
    use cg::layout::engine::LayoutEngine;
    use cg::node::schema::{Node, Scene};
    use cg::runtime::font_repository::FontRepository;
    use cg::svg::pack;
    use math2::transform::AffineTransform;
    use std::sync::{Arc, Mutex};

    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
      <g transform="translate(250, 250)">
        <rect x="-100" y="-100" width="200" height="200" fill="none" stroke="red"/>
        <g transform="rotate(30)">
          <rect x="-80" y="-80" width="160" height="160" fill="none" stroke="orange"/>
          <g transform="scale(0.8, 1.2)">
            <rect x="-60" y="-60" width="120" height="120" fill="none" stroke="green"/>
          </g>
        </g>
      </g>
    </svg>"##;

    let graph = pack::from_svg_str(svg).expect("should parse");
    let scene = Scene {
        name: "test".to_string(),
        graph,
        background_color: None,
    };

    let store = Arc::new(Mutex::new(cg::resources::ByteStore::new()));
    let mut fonts = FontRepository::new(store.clone());
    fonts.register_embedded_fonts();

    let mut layout_engine = LayoutEngine::new();
    let viewport = cg::node::schema::Size {
        width: 500.0,
        height: 500.0,
    };
    layout_engine.compute(&scene, viewport, None);
    let layout_result = layout_engine.result();

    let mut paragraph_cache = cg::cache::paragraph::ParagraphCache::new();
    let geometry = GeometryCache::from_scene_with_layout(
        &scene,
        &mut paragraph_cache,
        &fonts,
        Some(layout_result),
        viewport,
    );

    // Collect world transforms for all nodes, depth-first
    fn collect_world_transforms(
        graph: &cg::node::scene_graph::SceneGraph,
        geometry: &GeometryCache,
        id: &cg::node::schema::NodeId,
        out: &mut Vec<(String, AffineTransform)>,
    ) {
        let node = graph.get_node(id).expect("node");
        let label = match node {
            Node::Group(_) => "Group",
            Node::Container(_) => "Container",
            Node::Path(_) => "Path",
            _ => "Other",
        };
        if let Some(t) = geometry.get_world_transform(id) {
            out.push((label.to_string(), t));
        }
        if let Some(children) = graph.get_children(id) {
            for child_id in children {
                collect_world_transforms(graph, geometry, child_id, out);
            }
        }
    }

    let mut transforms = Vec::new();
    for r in scene.graph.roots() {
        collect_world_transforms(&scene.graph, &geometry, r, &mut transforms);
    }

    // Expected structure (depth-first):
    // 0: Container (identity)
    // 1: Group L1 translate(250,250)
    // 2: Path (rect) inside L1 → translate(150,150) because rect x=-100,y=-100
    // 3: Group L2 translate(250,250)*rotate(30)
    // 4: Path (rect) inside L2 → should NOT be at (250,250)
    // 5: Group L3 translate(250,250)*rotate(30)*scale(0.8,1.2)
    // 6: Path (rect) inside L3 → should NOT be at (250,250)

    let approx = |a: f32, b: f32| (a - b).abs() < 0.5;

    // L1 Group: world = translate(250,250)
    let (ref label, ref t) = transforms[1];
    assert_eq!(label, "Group");
    assert!(approx(t.x(), 250.0) && approx(t.y(), 250.0), "L1 group at (250,250)");

    // Path inside L1: world should place rect top-left at (150,150)
    let (ref label, ref t) = transforms[2];
    assert_eq!(label, "Path");
    assert!(
        approx(t.x(), 150.0) && approx(t.y(), 150.0),
        "L1 rect should be at (150,150), got ({}, {})",
        t.x(),
        t.y()
    );

    // Path inside L2: must NOT be at (250,250) — the rect offset must be applied
    let (ref label, ref t) = transforms[4];
    assert_eq!(label, "Path");
    assert!(
        !approx(t.x(), 250.0) || !approx(t.y(), 250.0),
        "L2 rect must not be at (250,250) — offset was not applied"
    );

    // Path inside L3: must NOT be at (250,250)
    let (ref label, ref t) = transforms[6];
    assert_eq!(label, "Path");
    assert!(
        !approx(t.x(), 250.0) || !approx(t.y(), 250.0),
        "L3 rect must not be at (250,250) — offset was not applied"
    );
}

/// Verify that simple nested translate groups produce correct positions.
/// This is a straightforward case: four circles at (100,100), (140,100),
/// (170,100), (190,100) — achieved via nested translate groups.
#[test]
fn pack_nested_translate_positions() {
    use cg::cache::geometry::GeometryCache;
    use cg::layout::engine::LayoutEngine;
    use cg::node::schema::Scene;
    use cg::runtime::font_repository::FontRepository;
    use cg::svg::pack;
    use std::sync::{Arc, Mutex};

    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">
      <g transform="translate(100, 100)">
        <circle cx="0" cy="0" r="20" fill="gray"/>
        <g transform="translate(40, 0)">
          <circle cx="0" cy="0" r="15" fill="gray"/>
          <g transform="translate(30, 0)">
            <circle cx="0" cy="0" r="10" fill="gray"/>
            <g transform="translate(20, 0)">
              <circle cx="0" cy="0" r="5" fill="gray"/>
            </g>
          </g>
        </g>
      </g>
    </svg>"##;

    let graph = pack::from_svg_str(svg).expect("should parse");
    let scene = Scene {
        name: "test".to_string(),
        graph,
        background_color: None,
    };

    let store = Arc::new(Mutex::new(cg::resources::ByteStore::new()));
    let mut fonts = FontRepository::new(store.clone());
    fonts.register_embedded_fonts();

    let mut layout_engine = LayoutEngine::new();
    let viewport = cg::node::schema::Size {
        width: 500.0,
        height: 500.0,
    };
    layout_engine.compute(&scene, viewport, None);
    let layout_result = layout_engine.result();

    let mut paragraph_cache = cg::cache::paragraph::ParagraphCache::new();
    let geometry = GeometryCache::from_scene_with_layout(
        &scene,
        &mut paragraph_cache,
        &fonts,
        Some(layout_result),
        viewport,
    );

    // Collect world transforms for Path nodes only
    fn collect_path_world_x(
        graph: &cg::node::scene_graph::SceneGraph,
        geometry: &GeometryCache,
        id: &cg::node::schema::NodeId,
        out: &mut Vec<f32>,
    ) {
        let node = graph.get_node(id).expect("node");
        if matches!(node, cg::node::schema::Node::Path(_)) {
            if let Some(t) = geometry.get_world_transform(id) {
                out.push(t.x());
            }
        }
        if let Some(children) = graph.get_children(id) {
            for child_id in children {
                collect_path_world_x(graph, geometry, child_id, out);
            }
        }
    }

    let mut xs = Vec::new();
    for r in scene.graph.roots() {
        collect_path_world_x(&scene.graph, &geometry, r, &mut xs);
    }

    // Circles are at cx=0, so their world X should reflect the group translations.
    // Circle radii differ so bounds offset varies; check that each successive
    // circle moves further right (monotonically increasing X).
    assert!(xs.len() >= 4, "expected 4 circles, got {}", xs.len());
    for i in 1..xs.len() {
        assert!(
            xs[i] > xs[i - 1],
            "circle {} at x={:.1} should be right of circle {} at x={:.1}",
            i,
            xs[i],
            i - 1,
            xs[i - 1]
        );
    }
}

/// Verify that TextSpan nodes under Group parents receive correct world
/// transforms. Same root cause as paths: the geometry cache must use the
/// full schema transform when the parent is a Group (not a layout container).
#[test]
fn pack_text_in_transformed_group_world_positions() {
    use cg::cache::geometry::GeometryCache;
    use cg::layout::engine::LayoutEngine;
    use cg::node::schema::{Node, Scene};
    use cg::runtime::font_repository::FontRepository;
    use cg::svg::pack;
    use math2::transform::AffineTransform;
    use std::sync::{Arc, Mutex};

    // Text inside nested translated groups — text should inherit the
    // group's translation, not be placed at (0,0).
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
      <g transform="translate(200, 100)">
        <text x="10" y="20" font-size="16" fill="black">hello</text>
      </g>
    </svg>"##;

    let graph = pack::from_svg_str(svg).expect("should parse");
    let scene = Scene {
        name: "test".to_string(),
        graph,
        background_color: None,
    };

    let store = Arc::new(Mutex::new(cg::resources::ByteStore::new()));
    let mut fonts = FontRepository::new(store.clone());
    fonts.register_embedded_fonts();

    let mut layout_engine = LayoutEngine::new();
    let viewport = cg::node::schema::Size {
        width: 400.0,
        height: 400.0,
    };
    layout_engine.compute(&scene, viewport, None);
    let layout_result = layout_engine.result();

    let mut paragraph_cache = cg::cache::paragraph::ParagraphCache::new();
    let geometry = GeometryCache::from_scene_with_layout(
        &scene,
        &mut paragraph_cache,
        &fonts,
        Some(layout_result),
        viewport,
    );

    // Find the TextSpan node's world transform
    fn find_first_textspan_world(
        graph: &cg::node::scene_graph::SceneGraph,
        geometry: &GeometryCache,
        id: &cg::node::schema::NodeId,
    ) -> Option<AffineTransform> {
        let node = graph.get_node(id).ok()?;
        if matches!(node, Node::TextSpan(_)) {
            return geometry.get_world_transform(id);
        }
        if let Some(children) = graph.get_children(id) {
            for child_id in children {
                if let Some(t) = find_first_textspan_world(graph, geometry, child_id) {
                    return Some(t);
                }
            }
        }
        None
    }

    let text_world = scene
        .graph
        .roots()
        .iter()
        .find_map(|r| find_first_textspan_world(&scene.graph, &geometry, r))
        .expect("should find a TextSpan node");

    // The text is at x=10, y=20 inside a group translated by (200, 100).
    // After the font-size baseline adjustment (-16), the span transform
    // becomes translate(10, 4). The world x should be near 200 + 10 = 210.
    // The world y depends on baseline adjustment, but must NOT be near 0
    // (which would mean the group translation was lost).
    let approx = |a: f32, b: f32| (a - b).abs() < 5.0;
    assert!(
        approx(text_world.x(), 210.0),
        "text world x should be ~210 (group 200 + text offset 10), got {:.1}",
        text_world.x()
    );
    assert!(
        text_world.y() > 50.0,
        "text world y must include group translation (100), got {:.1} — group transform was lost",
        text_world.y()
    );
}

// ---------------------------------------------------------------------------
// Bulk fixture tests — use `tool_svg_batch` for large external corpora
// e.g. cargo run --release --example tool_svg_batch -- fixtures/local/oxygen-icons-5.116.0/scalable
// ---------------------------------------------------------------------------
