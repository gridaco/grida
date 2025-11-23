use crate::svg::{into_tree, SVGPackedScene};

type ErrorMessageString = String;
type JsonString = String;
type SvgString = String;

pub fn svg_pack(svg_source: &str) -> Result<JsonString, ErrorMessageString> {
    let scene = SVGPackedScene::new_from_svg_str(svg_source)?;
    serde_json::to_string(&scene).map_err(|err| err.to_string())
}

/// Optimizes and resolves an SVG, producing a flat, self-contained SVG output.
///
/// This function performs SVG-to-SVG transformation that resolves CSS styles and
/// produces a normalized, flat SVG structure suitable for rendering or serialization.
///
/// # Key Features
///
/// ## 1. CSS Style Resolution
/// - Resolves CSS rules from `<style>` tags and inlines them as element attributes
/// - Supports class-based selectors (e.g., `.circle-style`)
/// - Supports ID-based selectors (e.g., `#specific-path`)
/// - Preserves inline `style` attributes on elements
/// - Removes the `<style>` tag from the output
///
/// ## 2. SVG Normalization
/// - Converts `viewBox` to explicit `width` and `height` attributes
/// - Adds empty `<defs/>` section if needed
/// - Converts shapes (circle, rect, etc.) to path elements
/// - Normalizes color values to hex format (e.g., `#ff0000`)
/// - Rounds coordinates and transforms to 4 decimal places for consistency
///
/// ## 3. Output Formatting
/// - Uses 2-space indentation
/// - Preserves text elements (does not convert to paths)
/// - Uses double quotes for attributes
///
/// # Example
///
/// ```rust
/// let input = r#"
/// <svg viewBox="0 0 200 200">
///     <style>
///         .circle-style { fill: #ff0000; stroke: #0000ff; }
///     </style>
///     <circle class="circle-style" cx="50" cy="50" r="30"/>
/// </svg>
/// "#;
///
/// let output = svg_optimize(input)?;
/// // Output: SVG with styles resolved and inlined as attributes
/// // - <style> tag removed
/// // - circle converted to path
/// // - styles applied as fill="#ff0000" stroke="#0000ff"
/// ```
///
/// # Errors
///
/// Returns an error if the input SVG cannot be parsed or is invalid.
///
pub fn svg_optimize(svg_source: &str) -> Result<SvgString, ErrorMessageString> {
    let tree = into_tree(svg_source).map_err(|err| err.to_string())?;

    let xml_opt = usvg::WriteOptions {
        id_prefix: None,
        preserve_text: true,
        coordinates_precision: 4, // Reduce noise and file size.
        transforms_precision: 4,
        use_single_quote: false,
        indent: usvg::Indent::Spaces(2),
        attributes_indent: usvg::Indent::None,
    };

    Ok(tree.to_string(&xml_opt))
}
