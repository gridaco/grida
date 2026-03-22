use crate::io::io_grida_fbs;
use crate::node::schema::*;
use crate::svg::pack;
use crate::svg::sanitize::sanitize_svg;
use crate::svg::into_tree;
use std::collections::HashMap;

type ErrorMessageString = String;
type SvgString = String;

/// Parse SVG and return a `.grida` FlatBuffers binary.
/// with a single Rust function that produces the final `.grida` document
/// directly, using the same FBS codec the editor already understands.
pub fn svg_to_grida_bytes(svg_source: &str) -> Result<Vec<u8>, ErrorMessageString> {
    let sanitized = sanitize_svg(svg_source);
    let graph = pack::from_svg_str(&sanitized)?;

    let scene = Scene {
        name: "svg".to_string(),
        graph,
        background_color: None,
    };

    // Build string ID map (NodeId u64 → string) and position map.
    // Position strings must follow the tree's depth-first order so the
    // FBS decoder reconstructs correct sibling z-order. Iterating
    // `nodes_iter()` would give HashMap order which is arbitrary.
    let mut id_map: HashMap<NodeId, String> = HashMap::new();
    let mut position_map: HashMap<NodeId, String> = HashMap::new();
    let mut counter: u64 = 0;

    fn walk_tree_order(
        graph: &crate::node::scene_graph::SceneGraph,
        node_id: &NodeId,
        id_map: &mut HashMap<NodeId, String>,
        position_map: &mut HashMap<NodeId, String>,
        counter: &mut u64,
    ) {
        id_map.insert(*node_id, format!("svg_{}", node_id));
        position_map.insert(*node_id, format!("a{:06}", counter));
        *counter += 1;

        if let Some(children) = graph.get_children(node_id) {
            for child_id in children {
                walk_tree_order(graph, child_id, id_map, position_map, counter);
            }
        }
    }

    for root_id in scene.graph.roots() {
        walk_tree_order(&scene.graph, root_id, &mut id_map, &mut position_map, &mut counter);
    }

    let bytes = io_grida_fbs::encode(&scene, "svg_scene", &id_map, &position_map);
    Ok(bytes)
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
/// use cg::io::io_svg::svg_optimize;
///
/// # fn main() -> Result<(), String> {
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
/// # Ok(())
/// # }
/// ```
///
/// # Errors
///
/// Returns an error if the input SVG cannot be parsed or is invalid.
///
pub fn svg_optimize(svg_source: &str) -> Result<SvgString, ErrorMessageString> {
    let sanitized = sanitize_svg(svg_source);
    let tree = into_tree(&sanitized).map_err(|err| err.to_string())?;

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
