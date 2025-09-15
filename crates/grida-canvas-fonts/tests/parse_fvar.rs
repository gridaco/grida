use std::fs;
use std::path::PathBuf;

use fonts::Parser;

fn font_path(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/fonts")
        .join(rel)
}

#[test]
fn parses_variation_axes_and_instances() {
    let path = font_path(
        "Roboto_Flex/RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf",
    );
    let data = fs::read(path).unwrap();
    let parser = Parser::new(&data).unwrap();
    let fvar = parser.fvar();
    let wght = fvar.axes.get("wght").unwrap();
    assert_eq!(wght.min.round() as i32, 100);
    assert_eq!(wght.max.round() as i32, 1000);
    assert_eq!(wght.def.round() as i32, 400);
    assert_eq!(wght.name, "Weight");
    assert!(!fvar.instances.is_empty());
    let inst = &fvar.instances[0];
    assert!(inst.coordinates.contains_key("wght"));
}

#[test]
fn supports_geist_variable_font() {
    let path = font_path("Geist/Geist-VariableFont_wght.ttf");
    let data = fs::read(path).unwrap();
    let parser = Parser::new(&data).unwrap();
    let fvar = parser.fvar();
    let wght = fvar.axes.get("wght").unwrap();
    assert_eq!(wght.min.round() as i32, 100);
    assert_eq!(wght.max.round() as i32, 900);
    assert_eq!(wght.def.round() as i32, 400);
    assert!(!fvar.instances.is_empty());
}

#[test]
fn recursive_font_has_all_postscript_names() {
    let path = font_path("Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf");
    let data = fs::read(path).unwrap();
    let parser = Parser::new(&data).unwrap();
    let fvar = parser.fvar();

    // Recursive font should have 64 instances
    assert_eq!(
        fvar.instances.len(),
        64,
        "Expected 64 instances in Recursive font"
    );

    // All instances should have PostScript names
    for (i, instance) in fvar.instances.iter().enumerate() {
        assert!(
            instance.postscript_name.is_some(),
            "Instance {} ('{}') is missing PostScript name",
            i,
            instance.name
        );

        // PostScript names should be non-empty strings
        let ps_name = instance.postscript_name.as_ref().unwrap();
        assert!(
            !ps_name.is_empty(),
            "Instance {} ('{}') has empty PostScript name",
            i,
            instance.name
        );

        // PostScript names should follow expected format (e.g., "RecursiveMonoLnr-Light")
        assert!(
            ps_name.starts_with("Recursive"),
            "Instance {} ('{}') has unexpected PostScript name format: '{}'",
            i,
            instance.name,
            ps_name
        );
    }

    // Verify we have the expected number of axes (5: CASL, CRSV, MONO, slnt, wght)
    assert_eq!(fvar.axes.len(), 5, "Expected 5 axes in Recursive font");

    // Verify key axes exist
    assert!(
        fvar.axes.contains_key("wght"),
        "Weight axis should be present"
    );
    assert!(
        fvar.axes.contains_key("slnt"),
        "Slant axis should be present"
    );
    assert!(
        fvar.axes.contains_key("CASL"),
        "CASL axis should be present"
    );
    assert!(
        fvar.axes.contains_key("CRSV"),
        "CRSV axis should be present"
    );
    assert!(
        fvar.axes.contains_key("MONO"),
        "MONO axis should be present"
    );
}

#[test]
fn inter_roman_font_parsing() {
    let path = font_path("Inter/Inter-VariableFont_opsz,wght.ttf");
    let data = fs::read(path).unwrap();
    let parser = Parser::new(&data).unwrap();
    let fvar = parser.fvar();

    // Inter Roman should have 2 axes: opsz and wght
    assert_eq!(fvar.axes.len(), 2, "Expected 2 axes in Inter Roman font");

    // Verify key axes exist
    assert!(
        fvar.axes.contains_key("wght"),
        "Weight axis should be present"
    );
    assert!(
        fvar.axes.contains_key("opsz"),
        "Optical size axis should be present"
    );

    // Check weight axis properties
    let wght = fvar.axes.get("wght").unwrap();
    assert_eq!(wght.min.round() as i32, 100, "Weight min should be 100");
    assert_eq!(wght.max.round() as i32, 900, "Weight max should be 900");
    assert_eq!(wght.def.round() as i32, 400, "Weight default should be 400");
    assert_eq!(wght.name, "Weight", "Weight axis name should be 'Weight'");

    // Check optical size axis properties
    let opsz = fvar.axes.get("opsz").unwrap();
    assert_eq!(opsz.min.round() as i32, 14, "Optical size min should be 14");
    assert_eq!(opsz.max.round() as i32, 32, "Optical size max should be 32");
    assert_eq!(
        opsz.def.round() as i32,
        14,
        "Optical size default should be 14"
    );
    assert_eq!(
        opsz.name, "Optical size",
        "Optical size axis name should be 'Optical size'"
    );

    // Inter Roman should have instances
    assert!(
        !fvar.instances.is_empty(),
        "Inter Roman should have instances"
    );

    // Check that instances exist (Inter fonts may not have PostScript names)
    for (i, instance) in fvar.instances.iter().enumerate() {
        assert!(
            !instance.name.is_empty(),
            "Instance {} should have a non-empty name",
            i
        );
        // Inter instances may or may not have PostScript names
        if let Some(ps_name) = &instance.postscript_name {
            assert!(
                !ps_name.is_empty(),
                "Instance {} ('{}') has empty PostScript name",
                i,
                instance.name
            );
            assert!(
                ps_name.starts_with("Inter"),
                "Instance {} ('{}') has unexpected PostScript name format: '{}'",
                i,
                instance.name,
                ps_name
            );
        }
    }
}

#[test]
fn inter_italic_font_parsing() {
    let path = font_path("Inter/Inter-Italic-VariableFont_opsz,wght.ttf");
    let data = fs::read(path).unwrap();
    let parser = Parser::new(&data).unwrap();
    let fvar = parser.fvar();

    // Inter Italic should have 2 axes: opsz and wght
    assert_eq!(fvar.axes.len(), 2, "Expected 2 axes in Inter Italic font");

    // Verify key axes exist
    assert!(
        fvar.axes.contains_key("wght"),
        "Weight axis should be present"
    );
    assert!(
        fvar.axes.contains_key("opsz"),
        "Optical size axis should be present"
    );

    // Check weight axis properties (should be same as Roman)
    let wght = fvar.axes.get("wght").unwrap();
    assert_eq!(wght.min.round() as i32, 100, "Weight min should be 100");
    assert_eq!(wght.max.round() as i32, 900, "Weight max should be 900");
    assert_eq!(wght.def.round() as i32, 400, "Weight default should be 400");
    assert_eq!(wght.name, "Weight", "Weight axis name should be 'Weight'");

    // Check optical size axis properties (should be same as Roman)
    let opsz = fvar.axes.get("opsz").unwrap();
    assert_eq!(opsz.min.round() as i32, 14, "Optical size min should be 14");
    assert_eq!(opsz.max.round() as i32, 32, "Optical size max should be 32");
    assert_eq!(
        opsz.def.round() as i32,
        14,
        "Optical size default should be 14"
    );
    assert_eq!(
        opsz.name, "Optical size",
        "Optical size axis name should be 'Optical size'"
    );

    // Inter Italic should have instances
    assert!(
        !fvar.instances.is_empty(),
        "Inter Italic should have instances"
    );

    // Check that instances exist (Inter fonts may not have PostScript names)
    for (i, instance) in fvar.instances.iter().enumerate() {
        assert!(
            !instance.name.is_empty(),
            "Instance {} should have a non-empty name",
            i
        );
        // Inter instances may or may not have PostScript names
        if let Some(ps_name) = &instance.postscript_name {
            assert!(
                !ps_name.is_empty(),
                "Instance {} ('{}') has empty PostScript name",
                i,
                instance.name
            );
            assert!(
                ps_name.starts_with("Inter"),
                "Instance {} ('{}') has unexpected PostScript name format: '{}'",
                i,
                instance.name,
                ps_name
            );
            // Italic instances should contain "Italic" in the PostScript name
            assert!(
                ps_name.contains("Italic"),
                "Instance {} ('{}') should have 'Italic' in PostScript name: '{}'",
                i,
                instance.name,
                ps_name
            );
        }
    }
}

#[test]
fn inter_family_consistency() {
    // Test that both Inter fonts have consistent axis properties
    let roman_path = font_path("Inter/Inter-VariableFont_opsz,wght.ttf");
    let italic_path = font_path("Inter/Inter-Italic-VariableFont_opsz,wght.ttf");

    let roman_data = fs::read(roman_path).unwrap();
    let italic_data = fs::read(italic_path).unwrap();

    let roman_parser = Parser::new(&roman_data).unwrap();
    let italic_parser = Parser::new(&italic_data).unwrap();

    let roman_fvar = roman_parser.fvar();
    let italic_fvar = italic_parser.fvar();

    // Both fonts should have the same number of axes
    assert_eq!(
        roman_fvar.axes.len(),
        italic_fvar.axes.len(),
        "Both Inter fonts should have the same number of axes"
    );

    // Both fonts should have the same axis tags
    let roman_axis_tags: std::collections::HashSet<String> =
        roman_fvar.axes.keys().cloned().collect();
    let italic_axis_tags: std::collections::HashSet<String> =
        italic_fvar.axes.keys().cloned().collect();
    assert_eq!(
        roman_axis_tags, italic_axis_tags,
        "Both Inter fonts should have the same axis tags"
    );

    // Both fonts should have the same axis ranges and defaults
    for (tag, roman_axis) in &roman_fvar.axes {
        let italic_axis = italic_fvar.axes.get(tag).unwrap();

        assert_eq!(
            roman_axis.min, italic_axis.min,
            "Axis {} min should be the same in both fonts",
            tag
        );
        assert_eq!(
            roman_axis.max, italic_axis.max,
            "Axis {} max should be the same in both fonts",
            tag
        );
        assert_eq!(
            roman_axis.def, italic_axis.def,
            "Axis {} default should be the same in both fonts",
            tag
        );
        assert_eq!(
            roman_axis.name, italic_axis.name,
            "Axis {} name should be the same in both fonts",
            tag
        );
    }

    // Both fonts should have instances
    assert!(
        !roman_fvar.instances.is_empty(),
        "Inter Roman should have instances"
    );
    assert!(
        !italic_fvar.instances.is_empty(),
        "Inter Italic should have instances"
    );

    // Both fonts should have the same number of instances
    assert_eq!(
        roman_fvar.instances.len(),
        italic_fvar.instances.len(),
        "Both Inter fonts should have the same number of instances"
    );
}
