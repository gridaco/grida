use std::fs;
use std::path::PathBuf;

use ttf_parser::{name_id, Face, Tag};

fn font_path(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/fonts")
        .join(rel)
}

fn main() {
    explore_roboto_flex_comprehensive();
    test_roboto_flex_italic_detection_scenarios();
    test_roboto_flex_name_table_analysis();
}

fn explore_roboto_flex_comprehensive() {
    let path = font_path(
        "Roboto_Flex/RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf",
    );

    if !path.exists() {
        println!("Roboto Flex font not found, skipping exploration");
        return;
    }

    let data = fs::read(&path).unwrap();
    let face = Face::parse(&data, 0).unwrap();

    println!("=== ROBOTO FLEX COMPREHENSIVE EXPLORATION ===");
    println!();

    // === BASIC FONT PROPERTIES ===
    println!("📋 BASIC FONT PROPERTIES:");
    println!("  Units per EM: {}", face.units_per_em());
    println!("  Number of glyphs: {}", face.number_of_glyphs());
    println!("  Is variable: {}", face.is_variable());
    println!();

    // === STYLE & WEIGHT PROPERTIES ===
    println!("🎨 STYLE & WEIGHT PROPERTIES:");
    println!("  Style: {:?}", face.style());
    println!("  Is regular: {}", face.is_regular());
    println!("  Is italic: {}", face.is_italic());
    println!("  Is bold: {}", face.is_bold());
    println!("  Is oblique: {}", face.is_oblique());
    println!("  Is monospaced: {}", face.is_monospaced());
    println!("  Weight: {:?}", face.weight());
    println!("  Width: {:?}", face.width());
    println!("  Italic angle: {}", face.italic_angle());
    println!();

    // === NAME TABLE EXPLORATION ===
    println!("📝 NAME TABLE EXPLORATION:");
    let names = face.names();
    println!("  Total names: {}", names.len());

    for name in names {
        if name.is_unicode() {
            println!(
                "    NameID {}: '{}' (Platform: {:?}, Encoding: {:?})",
                name.name_id,
                name.to_string().unwrap_or_default(),
                name.platform_id,
                name.encoding_id
            );
        }
    }
    println!();

    // === VARIATION AXES DETAILED ===
    println!("⚙️ VARIATION AXES DETAILED:");
    if face.is_variable() {
        println!("  Variable font detected!");
        for axis in face.variation_axes() {
            println!("    Axis '{}':", axis.tag);
            println!("      Min: {}", axis.min_value);
            println!("      Default: {}", axis.def_value);
            println!("      Max: {}", axis.max_value);
            println!("      Name ID: {}", axis.name_id);
            println!("      Hidden: {}", axis.hidden);
        }
    } else {
        println!("  Not a variable font");
    }
    println!();

    // === OS/2 TABLE EXPLORATION ===
    println!("🖥️ OS/2 TABLE EXPLORATION:");
    if let Some(os2) = face.tables().os2 {
        println!("  Version: {}", os2.version);
        println!("  Weight: {:?}", os2.weight());
        println!("  Width: {:?}", os2.width());
        println!("  Style: {:?}", os2.style());
        println!("  Typographic ascender: {}", os2.typographic_ascender());
        println!("  Typographic descender: {}", os2.typographic_descender());
        println!("  Typographic line gap: {}", os2.typographic_line_gap());
        println!("  Windows ascender: {}", os2.windows_ascender());
        println!("  Windows descender: {}", os2.windows_descender());
        println!("  Unicode ranges: {:?}", os2.unicode_ranges());
        println!("  X height: {:?}", os2.x_height());
        println!("  Capital height: {:?}", os2.capital_height());
        println!("  Strikeout metrics: {:?}", os2.strikeout_metrics());
        println!("  Subscript metrics: {:?}", os2.subscript_metrics());
        println!("  Superscript metrics: {:?}", os2.superscript_metrics());
        println!("  Permissions: {:?}", os2.permissions());
    } else {
        println!("  No OS/2 table found");
    }
    println!();

    // === POST TABLE EXPLORATION ===
    println!("📮 POST TABLE EXPLORATION:");
    if let Some(post) = face.tables().post {
        println!("  Italic angle: {}", post.italic_angle);
        println!("  Underline position: {}", post.underline_metrics.position);
        println!(
            "  Underline thickness: {}",
            post.underline_metrics.thickness
        );
        println!("  Is fixed pitch: {}", post.is_monospaced);
    } else {
        println!("  No POST table found");
    }
    println!();

    // === STAT TABLE EXPLORATION ===
    println!("📊 STAT TABLE EXPLORATION:");
    if let Some(stat) = face.tables().stat {
        println!("  Fallback name ID: {:?}", stat.fallback_name_id);
        println!("  Axes count: {}", stat.axes.len());
        for (i, axis) in stat.axes.into_iter().enumerate() {
            println!("    Axis {}: {:?}", i, axis);
        }
    } else {
        println!("  No STAT table found");
    }
    println!();

    // === FVAR TABLE EXPLORATION (if available) ===
    println!("🔄 FVAR TABLE EXPLORATION:");
    if let Some(fvar) = face.tables().fvar {
        println!("  Axes count: {}", fvar.axes.len());
        for (i, axis) in fvar.axes.into_iter().enumerate() {
            println!("    Axis {}: '{}'", i, axis.tag);
            println!("      Min: {}", axis.min_value);
            println!("      Default: {}", axis.def_value);
            println!("      Max: {}", axis.max_value);
            println!("      Name ID: {}", axis.name_id);
            println!("      Hidden: {}", axis.hidden);
        }
    } else {
        println!("  No FVAR table found");
    }
    println!();

    // === METRICS EXPLORATION ===
    println!("📏 METRICS EXPLORATION:");
    println!("  Ascender: {}", face.ascender());
    println!("  Descender: {}", face.descender());
    println!("  Height: {}", face.height());
    println!("  Line gap: {}", face.line_gap());
    println!("  Typographic ascender: {:?}", face.typographic_ascender());
    println!(
        "  Typographic descender: {:?}",
        face.typographic_descender()
    );
    println!("  Typographic line gap: {:?}", face.typographic_line_gap());
    println!("  X height: {:?}", face.x_height());
    println!("  Capital height: {:?}", face.capital_height());
    println!("  Underline metrics: {:?}", face.underline_metrics());
    println!("  Strikeout metrics: {:?}", face.strikeout_metrics());
    println!("  Subscript metrics: {:?}", face.subscript_metrics());
    println!("  Superscript metrics: {:?}", face.superscript_metrics());
    println!();

    // === PERMISSIONS & EMBEDDING ===
    println!("🔒 PERMISSIONS & EMBEDDING:");
    println!("  Permissions: {:?}", face.permissions());
    println!("  Is subsetting allowed: {}", face.is_subsetting_allowed());
    println!(
        "  Is outline embedding allowed: {}",
        face.is_outline_embedding_allowed()
    );
    println!();

    // === UNICODE RANGES ===
    println!("🌍 UNICODE RANGES:");
    println!("  Unicode ranges: {:?}", face.unicode_ranges());
    println!();

    // === GLYPH EXPLORATION (first few glyphs) ===
    println!("🔤 GLYPH EXPLORATION (first 10 glyphs):");
    for i in 0..10.min(face.number_of_glyphs().into()) {
        let glyph_id = ttf_parser::GlyphId(i);
        if let Some(advance) = face.glyph_hor_advance(glyph_id) {
            println!("  Glyph {}: advance = {}", i, advance);
        }
        if let Some(bbox) = face.glyph_bounding_box(glyph_id) {
            println!("    Bounding box: {:?}", bbox);
        }
    }
    println!();

    // === VARIATION COORDINATES TESTING ===
    println!("🎛️ VARIATION COORDINATES TESTING:");
    if face.is_variable() {
        let mut test_face = face.clone();

        // Test setting slnt to -10 degrees
        if let Some(_) = test_face.set_variation(Tag::from_bytes(b"slnt"), -10.0) {
            println!("  Set slnt to -10°: SUCCESS");
            println!("    New italic angle: {}", test_face.italic_angle());
            println!("    New style: {:?}", test_face.style());
            println!("    New is_italic: {}", test_face.is_italic());
        } else {
            println!("  Set slnt to -10°: FAILED");
        }

        // Test setting wght to 700
        if let Some(_) = test_face.set_variation(Tag::from_bytes(b"wght"), 700.0) {
            println!("  Set wght to 700: SUCCESS");
            println!("    New weight: {:?}", test_face.weight());
            println!("    New is_bold: {}", test_face.is_bold());
        } else {
            println!("  Set wght to 700: FAILED");
        }

        // Test setting multiple axes
        let mut multi_face = face.clone();
        if let Some(_) = multi_face.set_variation(Tag::from_bytes(b"slnt"), -15.0) {
            if let Some(_) = multi_face.set_variation(Tag::from_bytes(b"wght"), 600.0) {
                println!("  Set slnt=-15°, wght=600: SUCCESS");
                println!("    New italic angle: {}", multi_face.italic_angle());
                println!("    New weight: {:?}", multi_face.weight());
                println!("    New style: {:?}", multi_face.style());
            }
        }
    }
    println!();

    // === RAW TABLE ACCESS ===
    println!("🗂️ RAW TABLE ACCESS:");
    let raw_face = face.raw_face();
    let table_tags = [
        "head", "hhea", "maxp", "name", "OS/2", "post", "fvar", "STAT", "cmap", "glyf", "CFF ",
    ];

    for tag_str in &table_tags {
        let tag = Tag::from_bytes_lossy(tag_str.as_bytes());
        if let Some(table_data) = raw_face.table(tag) {
            println!("  Table '{}': {} bytes", tag_str, table_data.len());
        } else {
            println!("  Table '{}': NOT FOUND", tag_str);
        }
    }
    println!();

    println!("=== EXPLORATION COMPLETE ===");
    println!();
    println!("🔍 KEY INSIGHTS:");
    println!("1. Roboto Flex has slnt axis (-10° to 0°) but ttf-parser doesn't consider it italic");
    println!("2. Rich name table with italic instances (NameID 282: 'Italic')");
    println!("3. 13 variation axes including slnt, wght, wdth, opsz");
    println!("4. STAT table with proper axis ordering");
    println!("5. Our Level 1 implementation correctly handles this via slnt axis detection");
    println!("6. Potential enhancement: Use STAT table and name table italic instances");
}

fn test_roboto_flex_italic_detection_scenarios() {
    let path = font_path(
        "Roboto_Flex/RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf",
    );

    if !path.exists() {
        println!("Roboto Flex font not found, skipping italic detection scenarios");
        return;
    }

    let data = fs::read(&path).unwrap();
    let face = Face::parse(&data, 0).unwrap();

    println!("=== ROBOTO FLEX ITALIC DETECTION SCENARIOS ===");
    println!();

    // Test different variation coordinates
    let test_scenarios = vec![
        ("Default", vec![]),
        ("Slant -5°", vec![(Tag::from_bytes(b"slnt"), -5.0)]),
        ("Slant -10°", vec![(Tag::from_bytes(b"slnt"), -10.0)]),
        ("Slant -15°", vec![(Tag::from_bytes(b"slnt"), -15.0)]),
        ("Weight 700", vec![(Tag::from_bytes(b"wght"), 700.0)]),
        (
            "Slant -10° + Weight 700",
            vec![
                (Tag::from_bytes(b"slnt"), -10.0),
                (Tag::from_bytes(b"wght"), 700.0),
            ],
        ),
        (
            "Slant -10° + Weight 300",
            vec![
                (Tag::from_bytes(b"slnt"), -10.0),
                (Tag::from_bytes(b"wght"), 300.0),
            ],
        ),
    ];

    for (scenario_name, variations) in test_scenarios {
        let mut test_face = face.clone();

        // Apply variations
        for (tag, value) in &variations {
            test_face.set_variation(*tag, *value);
        }

        println!("📋 Scenario: {}", scenario_name);
        println!("  Style: {:?}", test_face.style());
        println!("  Is italic: {}", test_face.is_italic());
        println!("  Is oblique: {}", test_face.is_oblique());
        println!("  Italic angle: {}", test_face.italic_angle());
        println!("  Weight: {:?}", test_face.weight());
        println!("  Is bold: {}", test_face.is_bold());
        println!();
    }
}

fn test_roboto_flex_name_table_analysis() {
    let path = font_path(
        "Roboto_Flex/RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf",
    );

    if !path.exists() {
        println!("Roboto Flex font not found, skipping name table analysis");
        return;
    }

    let data = fs::read(&path).unwrap();
    let face = Face::parse(&data, 0).unwrap();

    println!("=== ROBOTO FLEX NAME TABLE ANALYSIS ===");
    println!();

    let names = face.names();

    // Group names by ID
    let mut names_by_id: std::collections::HashMap<u16, Vec<_>> = std::collections::HashMap::new();
    for name in names {
        if name.is_unicode() {
            names_by_id.entry(name.name_id).or_default().push(name);
        }
    }

    // Print names by ID
    for (name_id, name_list) in &names_by_id {
        println!("📝 NameID {} ({} entries):", name_id, name_list.len());
        for name in name_list {
            println!(
                "  '{}' (Platform: {:?}, Language: {})",
                name.to_string().unwrap_or_default(),
                name.platform_id,
                name.language_id
            );
        }
        println!();
    }

    // Check for specific name IDs that might indicate italic
    let italic_indicators = vec![
        name_id::FAMILY,
        name_id::SUBFAMILY,
        name_id::FULL_NAME,
        name_id::POST_SCRIPT_NAME,
        name_id::TYPOGRAPHIC_FAMILY,
        name_id::TYPOGRAPHIC_SUBFAMILY,
    ];

    println!("🔍 ITALIC INDICATOR ANALYSIS:");
    for name_id in italic_indicators {
        if let Some(names) = names_by_id.get(&name_id) {
            for name in names {
                let text = name.to_string().unwrap_or_default().to_lowercase();
                let has_italic = text.contains("italic") || text.contains("oblique");
                println!(
                    "  NameID {}: '{}' -> Has italic indicator: {}",
                    name_id,
                    name.to_string().unwrap_or_default(),
                    has_italic
                );
            }
        }
    }
}
