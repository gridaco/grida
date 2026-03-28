//! Tests for SVG pack pipeline.
//!
//! These tests validate the SVG import pipeline (usvg parse → IR → SceneGraph).
//!
//! For bulk-testing large external SVG corpora, use the `tool_svg_batch` example instead:
//!   cargo run --example tool_svg_batch -- /path/to/svgs

use cg::io::io_svg::svg_optimize;
use cg::svg::sanitize::sanitize_svg;
use cg::svg::SVGPackedScene;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Asserts that SVG pack succeeds and returns the deserialized scene.
/// Applies sanitization first (same as the production pipeline).
fn assert_pack_ok(svg: &str) -> SVGPackedScene {
    let sanitized = sanitize_svg(svg);
    SVGPackedScene::new_from_svg_str(&sanitized)
        .unwrap_or_else(|err| panic!("SVG pack failed: {}", err))
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
    // Production pipeline sanitizes first; test the same path.
    let sanitized = sanitize_svg(svg);
    let result = SVGPackedScene::new_from_svg_str(&sanitized);
    assert!(
        result.is_ok(),
        "no-xmlns SVG should be accepted after sanitization: {:?}",
        result.err()
    );
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
    let scene = assert_pack_ok(svg);
    // Both text elements must survive
    assert!(
        count_nodes(&scene) >= 2,
        "both text nodes must be preserved",
    );
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
// Gradient transform tests
// ---------------------------------------------------------------------------

/// Verify that a `gradientTransform="rotate(45)"` on a non-square rect
/// produces a gradient whose effective rotation is preserved.
///
/// In the Grida paint model the painter computes:
///   shader_matrix = scale(shape_w, shape_h) * gradient.transform
///
/// For a 45° rotated gradient the final shader matrix should be equivalent to
///   scale(shape_w, shape_h) * rotate(45°)
/// meaning `gradient.transform ≈ rotate(45°)` regardless of shape dimensions.
///
/// A non-square rect (200×100) exposes the bug because dividing the rotation
/// matrix by different width/height distorts the rotation angle.
#[test]
fn pack_gradient_transform_rotation_preserved() {
    use cg::cg::types::Paint;
    use cg::node::schema::Node;
    use cg::svg::pack;
    use math2::transform::AffineTransform;

    // Non-square rect at a non-zero position. The gradient is rotated 45°.
    // The rect at x=50, y=30 gets path-normalized to origin, but the
    // gradient transform includes the bbox origin from usvg's
    // to_user_coordinates. If normalize_gradient_transform doesn't
    // account for this offset, the gradient will be shifted.
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
      <defs>
        <linearGradient id="g1" gradientTransform="rotate(45, 0.5, 0.5)">
          <stop offset="0" stop-color="red"/>
          <stop offset="1" stop-color="blue"/>
        </linearGradient>
      </defs>
      <rect x="50" y="30" width="200" height="100" fill="url(#g1)"/>
    </svg>"##;

    let graph = pack::from_svg_str(svg).expect("should parse");

    // Find the first Path node and extract the gradient paint
    fn find_first_gradient(
        graph: &cg::node::scene_graph::SceneGraph,
        id: &cg::node::schema::NodeId,
    ) -> Option<AffineTransform> {
        let node = graph.get_node(id).ok()?;
        if let Node::Path(n) = node {
            for paint in n.fills.iter() {
                if let Paint::LinearGradient(g) = paint {
                    return Some(g.transform);
                }
            }
        }
        if let Some(children) = graph.get_children(id) {
            for child_id in children {
                if let Some(t) = find_first_gradient(graph, child_id) {
                    return Some(t);
                }
            }
        }
        None
    }

    let gradient_transform = graph
        .roots()
        .iter()
        .find_map(|r| find_first_gradient(&graph, r))
        .expect("should find a gradient paint");

    // The gradient transform should be rotate(45°, 0.5, 0.5) in UV space,
    // regardless of the rect's position in the SVG. The rect's x/y position
    // must not leak into the gradient transform — the shape is path-normalized
    // to origin and its position is stored in the node transform.
    //
    // rotate(45°, 0.5, 0.5) = translate(0.5, 0.5) * rotate(45°) * translate(-0.5, -0.5)
    //   m00 = cos(45) ≈ 0.7071
    //   m01 = -sin(45) ≈ -0.7071
    //   m02 = 0.5 - 0.5*cos45 + 0.5*sin45 ≈ 0.5
    //   m10 = sin(45) ≈ 0.7071
    //   m11 = cos(45) ≈ 0.7071
    //   m12 = 0.5 - 0.5*sin45 - 0.5*cos45 ≈ -0.2071
    let m = gradient_transform.matrix;

    let approx = |a: f32, b: f32| (a - b).abs() < 0.01;
    let cos45: f32 = std::f32::consts::FRAC_1_SQRT_2;
    let expected_tx: f32 = 0.5 - 0.5 * cos45 + 0.5 * cos45; // ≈ 0.5
    let expected_ty: f32 = 0.5 - 0.5 * cos45 - 0.5 * cos45; // ≈ -0.2071

    // Rotation components
    assert!(approx(m[0][0], cos45), "m00 should be cos(45)≈0.707, got {:.4}", m[0][0]);
    assert!(approx(m[1][1], cos45), "m11 should be cos(45)≈0.707, got {:.4}", m[1][1]);
    assert!(approx(m[0][1], -cos45), "m01 should be -sin(45)≈-0.707, got {:.4}", m[0][1]);
    assert!(approx(m[1][0], cos45), "m10 should be sin(45)≈0.707, got {:.4}", m[1][0]);

    // Translation: must NOT include rect's x/y position (50, 30).
    // Should be pure rotate(45, 0.5, 0.5) translation.
    assert!(
        approx(m[0][2], expected_tx),
        "gradient tx should be {:.4} (no bbox offset), got {:.4}",
        expected_tx,
        m[0][2]
    );
    assert!(
        approx(m[1][2], expected_ty),
        "gradient ty should be {:.4} (no bbox offset), got {:.4}",
        expected_ty,
        m[1][2]
    );
}

// ---------------------------------------------------------------------------
// Text import model tests (chunk-per-TextSpan)
// ---------------------------------------------------------------------------

/// Multiline text via `<tspan x="0" dy="1.2em">` should produce a Group
/// containing multiple TextSpan children, each with a distinct Y position.
/// The TextSpan nodes must NOT overlap (each successive line should be
/// further down the page).
#[test]
fn pack_text_multiline_tspan_produces_group_with_ordered_y() {
    use cg::node::schema::Node;
    use cg::svg::pack;

    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
      <text x="10" y="30" font-size="20" fill="black">
        <tspan x="10">Line one</tspan>
        <tspan x="10" dy="1.2em">Line two</tspan>
        <tspan x="10" dy="1.2em">Line three</tspan>
      </text>
    </svg>"##;

    let graph = pack::from_svg_str(svg).expect("should parse");

    // Collect all text nodes and their schema transforms
    fn collect_text_nodes(
        graph: &cg::node::scene_graph::SceneGraph,
        id: &cg::node::schema::NodeId,
        out: &mut Vec<(String, f32)>, // (text, transform y)
    ) {
        let node = graph.get_node(id).expect("node");
        match node {
            Node::TextSpan(n) => out.push((n.text.clone(), n.transform.y())),
            Node::AttributedText(n) => {
                out.push((n.attributed_string.text.clone(), n.transform.y()))
            }
            _ => {}
        }
        if let Some(children) = graph.get_children(id) {
            for child_id in children {
                collect_text_nodes(graph, child_id, out);
            }
        }
    }

    let mut spans = Vec::new();
    for r in graph.roots() {
        collect_text_nodes(&graph, r, &mut spans);
    }

    assert!(
        spans.len() >= 3,
        "expected at least 3 text nodes (one per line), got {}",
        spans.len()
    );

    // Each successive span should have a larger Y (further down)
    for i in 1..spans.len() {
        assert!(
            spans[i].1 > spans[i - 1].1,
            "line {} ({:?}, y={:.1}) should be below line {} ({:?}, y={:.1})",
            i,
            spans[i].0,
            spans[i].1,
            i - 1,
            spans[i - 1].0,
            spans[i - 1].1,
        );
    }
}

/// A `<text>` with multiple styled `<tspan>`s in a single line should produce
/// a single TextSpan (since they belong to one chunk with no absolute
/// repositioning). The text content should be the full concatenated string.
#[test]
fn pack_text_inline_tspans_single_chunk() {
    use cg::node::schema::Node;
    use cg::svg::pack;

    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
      <text x="10" y="30" font-size="20" fill="black">
        Hello <tspan fill="red">world</tspan> end
      </text>
    </svg>"##;

    let graph = pack::from_svg_str(svg).expect("should parse");

    fn collect_text_content(
        graph: &cg::node::scene_graph::SceneGraph,
        id: &cg::node::schema::NodeId,
        out: &mut Vec<String>,
    ) {
        let node = graph.get_node(id).expect("node");
        match node {
            Node::TextSpan(n) => out.push(n.text.clone()),
            Node::AttributedText(n) => out.push(n.attributed_string.text.clone()),
            _ => {}
        }
        if let Some(children) = graph.get_children(id) {
            for child_id in children {
                collect_text_content(graph, child_id, out);
            }
        }
    }

    let mut spans = Vec::new();
    for r in graph.roots() {
        collect_text_content(&graph, r, &mut spans);
    }

    // Inline tspans within one chunk → single text node (TextSpan or AttributedText)
    assert_eq!(
        spans.len(),
        1,
        "inline tspans in one chunk should produce 1 text node, got {} ({:?})",
        spans.len(),
        spans
    );

    // The text should contain all the words
    let text = &spans[0];
    assert!(text.contains("Hello"), "text should contain 'Hello': {text}");
    assert!(text.contains("world"), "text should contain 'world': {text}");
    assert!(text.contains("end"), "text should contain 'end': {text}");
}

/// Multi-chunk text (3+ lines) should produce a Group node containing
/// TextSpan children, not bare TextSpan siblings.
#[test]
fn pack_text_multichunk_creates_group_parent() {
    use cg::node::schema::Node;
    use cg::svg::pack;

    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
      <text x="10" y="30" font-size="20" fill="black">
        <tspan x="10">First</tspan>
        <tspan x="10" dy="1.2em">Second</tspan>
        <tspan x="10" dy="1.2em">Third</tspan>
      </text>
    </svg>"##;

    let graph = pack::from_svg_str(svg).expect("should parse");

    // Find the first Group node that is NOT the root Container
    fn find_text_group(
        graph: &cg::node::scene_graph::SceneGraph,
        id: &cg::node::schema::NodeId,
    ) -> Option<cg::node::schema::NodeId> {
        let node = graph.get_node(id).expect("node");
        if let Node::Group(_) = node {
            // Check if it has TextSpan children
            if let Some(children) = graph.get_children(id) {
                let has_text_child = children.iter().any(|cid| {
                    matches!(graph.get_node(cid), Ok(Node::TextSpan(_)))
                });
                if has_text_child {
                    return Some(*id);
                }
            }
        }
        if let Some(children) = graph.get_children(id) {
            for child_id in children {
                if let Some(found) = find_text_group(graph, child_id) {
                    return Some(found);
                }
            }
        }
        None
    }

    let group_id = graph
        .roots()
        .iter()
        .find_map(|r| find_text_group(&graph, r))
        .expect("multi-chunk text should create a Group with TextSpan children");

    let children = graph
        .get_children(&group_id)
        .expect("group should have children");
    assert!(
        children.len() >= 3,
        "text Group should have >= 3 TextSpan children, got {}",
        children.len()
    );
}

// ---------------------------------------------------------------------------
// SVG → .grida FBS roundtrip
// ---------------------------------------------------------------------------

/// Verify that group transforms survive FBS roundtrip — the full affine
/// matrix (including scale/skew) must be preserved, not just rotation.
#[test]
fn svg_to_grida_fbs_group_transform_roundtrip() {
    use cg::io::io_grida_fbs;
    use cg::io::io_svg::svg_to_grida_bytes;
    use cg::node::schema::Node;

    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
      <g transform="translate(100, 50)">
        <g transform="scale(0.8, 1.2)">
          <g transform="rotate(30)">
            <rect width="50" height="50" fill="red"/>
          </g>
        </g>
      </g>
    </svg>"##;

    let bytes = svg_to_grida_bytes(svg).expect("should encode");
    let scene = io_grida_fbs::decode(&bytes).expect("should decode");

    // Collect all group transforms
    let mut group_transforms = Vec::new();
    for (_, node) in scene.graph.nodes_iter() {
        if let Node::Group(g) = node {
            if let Some(t) = &g.transform {
                group_transforms.push(t.clone());
            }
        }
    }

    // Should have 3 groups with transforms: translate, scale, rotate
    assert!(
        group_transforms.len() >= 3,
        "expected 3 groups with transforms, got {}",
        group_transforms.len()
    );

    // Check that at least one has non-trivial scale (m00 != 1 or m11 != 1)
    let has_scale = group_transforms.iter().any(|t| {
        let m00 = t.matrix[0][0];
        let m11 = t.matrix[1][1];
        (m00 - 1.0).abs() > 0.01 || (m11 - 1.0).abs() > 0.01
    });
    assert!(
        has_scale,
        "at least one group should have scale transform, but all have identity-like diagonals"
    );

    // Check that at least one has non-zero translation
    let has_translate = group_transforms.iter().any(|t| {
        t.matrix[0][2].abs() > 0.1 || t.matrix[1][2].abs() > 0.1
    });
    assert!(
        has_translate,
        "at least one group should have translation"
    );
}

/// Verify that `svg_to_grida_bytes` → `decode` roundtrip preserves
/// gradient transforms faithfully (full 2x3 matrix, not just rotation).
#[test]
fn svg_to_grida_fbs_gradient_transform_roundtrip() {
    use cg::io::io_grida_fbs;
    use cg::io::io_svg::svg_to_grida_bytes;
    use cg::node::schema::Node;

    // Rect at non-zero position with a 45° rotated gradient
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
      <defs>
        <linearGradient id="g1" gradientTransform="rotate(45, 0.5, 0.5)">
          <stop offset="0" stop-color="red"/>
          <stop offset="1" stop-color="blue"/>
        </linearGradient>
      </defs>
      <rect x="50" y="30" width="200" height="100" fill="url(#g1)"/>
    </svg>"##;

    let bytes = svg_to_grida_bytes(svg).expect("should encode");
    let scene = io_grida_fbs::decode(&bytes).expect("should decode");

    // Find the path node (rect → path after SVG pack + FBS roundtrip)
    let path_node = scene
        .graph
        .nodes_iter()
        .find_map(|(_, n)| match n {
            Node::Path(p) => Some(p),
            _ => None,
        })
        .expect("should have a path node");

    // The gradient fill should have a rotation transform
    let fill = &path_node.fills.as_slice()[0];
    let gradient = match fill {
        cg::cg::types::Paint::LinearGradient(lg) => lg,
        _ => panic!("expected linear gradient, got {:?}", fill),
    };

    let m = &gradient.transform.matrix;
    let cos45: f32 = std::f32::consts::FRAC_1_SQRT_2;
    let approx = |a: f32, b: f32| (a - b).abs() < 0.01;

    // Gradient transform should be rotate(45°, 0.5, 0.5) in UV space
    assert!(
        approx(m[0][0], cos45) && approx(m[1][1], cos45),
        "diagonal should be cos(45°), got [{:.4}, {:.4}]",
        m[0][0],
        m[1][1]
    );
    assert!(
        approx(m[0][1], -cos45) && approx(m[1][0], cos45),
        "off-diagonal should be ±sin(45°), got [{:.4}, {:.4}]",
        m[0][1],
        m[1][0]
    );
}

/// Verify that `svg_to_grida_bytes` produces valid FBS bytes that can be
/// decoded back into a Scene with the expected structure.
#[test]
fn svg_to_grida_fbs_roundtrip() {
    use cg::io::io_grida_fbs;
    use cg::io::io_svg::svg_to_grida_bytes;
    use cg::node::schema::Node;

    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <rect x="10" y="20" width="80" height="60" fill="red"/>
      <g transform="translate(100, 50)">
        <circle cx="0" cy="0" r="30" fill="blue"/>
      </g>
      <text x="10" y="180" font-size="16" fill="black">hello</text>
    </svg>"##;

    let bytes = svg_to_grida_bytes(svg).expect("svg_to_grida_bytes should succeed");

    // Must be a valid FBS buffer (starts with valid FlatBuffer, has "GRID" identifier)
    assert!(bytes.len() > 8, "FBS buffer too small: {} bytes", bytes.len());

    // Decode back into a Scene
    let scene = io_grida_fbs::decode(&bytes).expect("FBS decode should succeed");

    // The scene graph should have roots
    let roots = scene.graph.roots();
    assert!(!roots.is_empty(), "decoded scene should have root nodes");

    // Count node types
    let mut path_count = 0;
    let mut group_count = 0;
    let mut text_count = 0;
    let mut container_count = 0;
    for (_id, node) in scene.graph.nodes_iter() {
        match node {
            Node::Path(_) => path_count += 1,
            Node::Group(_) => group_count += 1,
            Node::TextSpan(_) => text_count += 1,
            Node::Container(_) => container_count += 1,
            _ => {}
        }
    }

    // SVG has: 1 container (<svg>), 1 group (<g>), 2 path nodes (rect + circle), 1 text span
    assert!(
        container_count >= 1,
        "should have at least 1 container, got {}",
        container_count
    );
    assert!(
        path_count >= 2,
        "should have at least 2 path nodes (rect + circle), got {}",
        path_count
    );
    assert!(
        group_count >= 1,
        "should have at least 1 group, got {}",
        group_count
    );
    assert!(
        text_count >= 1,
        "should have at least 1 text span, got {}",
        text_count
    );
}

/// Minimal SVG — the kind a browser drag-drop would produce.
#[test]
fn svg_to_grida_fbs_minimal() {
    use cg::io::io_grida_fbs;
    use cg::io::io_svg::svg_to_grida_bytes;

    let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 2L2 22h20L12 2z" fill="black"/></svg>"#;

    let bytes = svg_to_grida_bytes(svg).expect("minimal SVG should encode");
    assert!(bytes.len() > 8);
    let scene = io_grida_fbs::decode(&bytes).expect("should decode");
    assert!(!scene.graph.roots().is_empty());
}

/// SVG with only groups (no paths/text) — should still produce valid FBS.
#[test]
fn svg_to_grida_fbs_groups_only() {
    use cg::io::io_grida_fbs;
    use cg::io::io_svg::svg_to_grida_bytes;

    let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><g transform="translate(10,20)"><g transform="rotate(45)"/></g></svg>"#;

    let bytes = svg_to_grida_bytes(svg).expect("groups-only SVG should encode");
    let scene = io_grida_fbs::decode(&bytes).expect("should decode");
    assert!(!scene.graph.roots().is_empty());
}

/// Empty SVG — should still produce valid FBS (just a container).
#[test]
fn svg_to_grida_fbs_empty() {
    use cg::io::io_grida_fbs;
    use cg::io::io_svg::svg_to_grida_bytes;

    let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>"#;

    let bytes = svg_to_grida_bytes(svg).expect("empty SVG should encode");
    let scene = io_grida_fbs::decode(&bytes).expect("should decode");
    assert!(!scene.graph.roots().is_empty());
}

// ---------------------------------------------------------------------------
// Attributed text SVG import diagnostic
// ---------------------------------------------------------------------------

#[test]
fn pack_attributed_text_multi_tspan_diagnostic() {
    use cg::node::schema::Node;
    use cg::svg::pack;

    let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">
  <text x="10" y="40">
    <tspan font-weight="bold" fill="red" font-size="24">Bold Red </tspan>
    <tspan fill="blue" font-size="16">Normal Blue </tspan>
    <tspan font-style="italic" fill="green" font-size="20">Italic Green</tspan>
  </text>
  <text x="10" y="100" font-size="18" fill="black">Plain uniform text</text>
</svg>"#;

    let graph = pack::from_svg_str(svg).expect("should parse");

    let mut text_spans = Vec::new();
    let mut attributed_texts = Vec::new();

    fn walk(
        graph: &cg::node::scene_graph::SceneGraph,
        id: &cg::node::schema::NodeId,
        text_spans: &mut Vec<String>,
        attributed_texts: &mut Vec<(String, usize)>, // (text, run_count)
    ) {
        let node = graph.get_node(id).expect("node");
        match node {
            Node::TextSpan(n) => {
                eprintln!("  TextSpan: {:?} fills={}", n.text, n.fills.len());
                text_spans.push(n.text.clone());
            }
            Node::AttributedText(n) => {
                eprintln!(
                    "  AttributedText: {:?} runs={} default_font={:.1}",
                    n.attributed_string.text,
                    n.attributed_string.runs.len(),
                    n.default_style.font_size
                );
                for (i, run) in n.attributed_string.runs.iter().enumerate() {
                    let rt = &n.attributed_string.text[run.start as usize..run.end as usize];
                    eprintln!(
                        "    run[{}]: {:?} font_size={:.1} weight={} italic={} fills={:?}",
                        i,
                        rt,
                        run.style.font_size,
                        run.style.font_weight.0,
                        run.style.font_style_italic,
                        run.fills.as_ref().map(|f| f.len()),
                    );
                }
                attributed_texts
                    .push((n.attributed_string.text.clone(), n.attributed_string.runs.len()));
            }
            _ => {}
        }
        if let Some(children) = graph.get_children(id) {
            for child_id in children {
                walk(graph, child_id, text_spans, attributed_texts);
            }
        }
    }

    for r in graph.roots() {
        walk(&graph, r, &mut text_spans, &mut attributed_texts);
    }

    // The uniform text should be a TextSpan
    assert_eq!(text_spans.len(), 1, "expected 1 TextSpan");
    assert!(text_spans[0].contains("Plain uniform text"));

    // The multi-tspan text should be an AttributedText.
    // usvg produces 5 spans (3 styled tspans + 2 inter-tspan whitespace spans).
    assert_eq!(attributed_texts.len(), 1, "expected 1 AttributedText");
    let (ref attr_text, run_count) = attributed_texts[0];
    assert!(attr_text.contains("Bold Red"), "text={attr_text:?}");
    assert!(attr_text.contains("Normal Blue"), "text={attr_text:?}");
    assert!(attr_text.contains("Italic Green"), "text={attr_text:?}");
    assert!(run_count >= 3, "expected at least 3 runs, got {run_count}");
}

/// Full pipeline diagnostic: SVG → pack → layout → geometry.
/// Uses the existing `text-tspan.svg` L0 fixture which covers inline tspan
/// style overrides, nested tspans, baseline shifts, and inheritance.
#[test]
fn pack_attributed_text_full_pipeline() {
    use cg::cache::geometry::GeometryCache;
    use cg::layout::engine::LayoutEngine;
    use cg::node::schema::{Node, Scene};
    use cg::runtime::font_repository::FontRepository;
    use cg::svg::pack;
    use std::sync::{Arc, Mutex};

    let fixture_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../fixtures/test-svg/L0/text-tspan.svg"
    );
    let svg = std::fs::read_to_string(fixture_path)
        .expect("text-tspan.svg fixture should exist");

    let graph = pack::from_svg_str(&svg).expect("should parse");
    let scene = Scene {
        name: "test".to_string(),
        graph,
        background_color: None,
    };
    let viewport = cg::node::schema::Size {
        width: 800.0,
        height: 800.0,
    };

    let store = Arc::new(Mutex::new(cg::resources::ByteStore::new()));
    let mut fonts = FontRepository::new(store.clone());
    fonts.register_embedded_fonts();

    let mut paragraph_cache = cg::cache::paragraph::ParagraphCache::new();
    let text_measure = cg::layout::tree::TextMeasureProvider {
        paragraph_cache: &mut paragraph_cache,
        fonts: &fonts,
    };
    let mut layout_engine = LayoutEngine::new();
    layout_engine.compute(&scene, viewport, Some(text_measure));
    let layout_result = layout_engine.result();
    let geometry = GeometryCache::from_scene_with_layout(
        &scene,
        &mut paragraph_cache,
        &fonts,
        Some(layout_result),
        viewport,
    );

    let graph = &scene.graph;

    // Print full tree
    fn print_tree(
        graph: &cg::node::scene_graph::SceneGraph,
        geo: &GeometryCache,
        id: &cg::node::schema::NodeId,
        depth: usize,
    ) {
        let indent = "  ".repeat(depth);
        let node = graph.get_node(id).expect("node");
        let bounds = geo.get_world_bounds(id);
        let bounds_str = bounds
            .map(|b| format!("({:.1},{:.1} {:.1}x{:.1})", b.x, b.y, b.width, b.height))
            .unwrap_or_else(|| "NO BOUNDS".to_string());

        match node {
            Node::TextSpan(n) => {
                eprintln!(
                    "{indent}TextSpan {bounds_str} text={:?} font={:.0} fills={}",
                    n.text, n.text_style.font_size, n.fills.len()
                );
            }
            Node::AttributedText(n) => {
                eprintln!(
                    "{indent}AttributedText {bounds_str} text={:?} runs={}",
                    n.attributed_string.text,
                    n.attributed_string.runs.len()
                );
                for (i, run) in n.attributed_string.runs.iter().enumerate() {
                    let rt = &n.attributed_string.text[run.start as usize..run.end as usize];
                    let fill_desc = run
                        .fills
                        .as_ref()
                        .map(|fills| {
                            fills
                                .iter()
                                .map(|f| match f {
                                    cg::cg::types::Paint::Solid(s) => {
                                        format!(
                                            "rgba({:.2},{:.2},{:.2},{:.2})",
                                            s.color.r, s.color.g, s.color.b, s.color.a
                                        )
                                    }
                                    _ => "non-solid".to_string(),
                                })
                                .collect::<Vec<_>>()
                                .join(",")
                        })
                        .unwrap_or_else(|| "none".to_string());
                    eprintln!(
                        "{indent}  [{i}] {:?} size={:.0} w={} italic={} family={:?} fill={}",
                        rt,
                        run.style.font_size,
                        run.style.font_weight.0,
                        run.style.font_style_italic,
                        run.style.font_family,
                        fill_desc
                    );
                }
            }
            Node::Group(_) => eprintln!("{indent}Group {bounds_str}"),
            Node::Container(_) => eprintln!("{indent}Container {bounds_str}"),
            _ => eprintln!("{indent}{} {bounds_str}", node.type_label()),
        }
        if let Some(children) = graph.get_children(id) {
            for child_id in children {
                print_tree(graph, geo, child_id, depth + 1);
            }
        }
    }

    // Dump layout results for all nodes
    eprintln!("\n=== Layout Results ===");
    for r in graph.roots() {
        fn dump_layout(
            graph: &cg::node::scene_graph::SceneGraph,
            layout: &cg::layout::cache::LayoutResult,
            id: &cg::node::schema::NodeId,
            depth: usize,
        ) {
            let indent = "  ".repeat(depth);
            let node = graph.get_node(id).expect("node");
            let lr = layout.get(id);
            eprintln!(
                "{indent}{} layout={:?}",
                node.type_label(),
                lr.map(|l| format!("({:.1},{:.1} {:.1}x{:.1})", l.x, l.y, l.width, l.height))
            );
            if let Some(children) = graph.get_children(id) {
                for child_id in children {
                    dump_layout(graph, layout, child_id, depth + 1);
                }
            }
        }
        dump_layout(graph, layout_result, r, 0);
    }

    eprintln!("\n=== Full SVG Import Pipeline ===");
    for r in graph.roots() {
        print_tree(graph, &geometry, r, 0);
    }
    eprintln!("=== End ===\n");

    // Verify we got some attributed text nodes from the multi-tspan sections
    let mut attr_count = 0;
    let mut span_count = 0;
    fn count_text_nodes(
        graph: &cg::node::scene_graph::SceneGraph,
        id: &cg::node::schema::NodeId,
        attr_count: &mut usize,
        span_count: &mut usize,
    ) {
        let node = graph.get_node(id).expect("node");
        match node {
            Node::AttributedText(_) => *attr_count += 1,
            Node::TextSpan(_) => *span_count += 1,
            _ => {}
        }
        if let Some(children) = graph.get_children(id) {
            for child_id in children {
                count_text_nodes(graph, child_id, attr_count, span_count);
            }
        }
    }
    for r in graph.roots() {
        count_text_nodes(graph, r, &mut attr_count, &mut span_count);
    }
    eprintln!("  attributed_text: {attr_count}, tspan: {span_count}");
    assert!(attr_count > 0, "expected some AttributedText nodes from multi-tspan SVG");

    // Assertions: every text node should have valid (non-degenerate) bounds
    fn check_bounds(
        graph: &cg::node::scene_graph::SceneGraph,
        geo: &GeometryCache,
        id: &cg::node::schema::NodeId,
    ) {
        let node = graph.get_node(id).expect("node");
        match node {
            Node::TextSpan(_) | Node::AttributedText(_) => {
                let bounds = geo.get_world_bounds(id);
                assert!(
                    bounds.is_some(),
                    "text node should have bounds: {:?}",
                    node.type_label()
                );
                let b = bounds.unwrap();
                assert!(
                    b.width > 2.0 && b.height > 2.0,
                    "text node bounds too small: {:.1}x{:.1} for {:?}",
                    b.width,
                    b.height,
                    node.type_label()
                );
            }
            _ => {}
        }
        if let Some(children) = graph.get_children(id) {
            for child_id in children {
                check_bounds(graph, geo, child_id);
            }
        }
    }

    for r in graph.roots() {
        check_bounds(graph, &geometry, r);
    }
}

// ---------------------------------------------------------------------------
// Bulk fixture tests — use `tool_svg_batch` for large external corpora
// e.g. cargo run --release --example tool_svg_batch -- fixtures/local/oxygen-icons-5.116.0/scalable
// ---------------------------------------------------------------------------
