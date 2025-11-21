//! # Grida Canvas Skia - SVG Filters Demo
//!
//! This example demonstrates parsing SVG files with filters and rendering
//! them with Skia, supporting dynamic compositions of filter primitives.
//!
//! ## Architecture
//! - **Filter Pipeline**: Processes primitives in order, handling input/output chaining
//! - **Primitive Application**: Maps SVG filter primitives to Skia image filters
//! - **Rendering**: Integrates filters as layer properties in the rendering flow
//!
//! ## Key Concepts
//! - Filters are treated as a layer property (attached to groups)
//! - Filter primitives can reference each other via `result` and `in`/`in2` attributes
//! - The usvg tree structure aligns with rendering order (save/restore)

use cg::cg::prelude::*;
use cg::painter::gradient::linear_gradient_paint;
use math2::transform::AffineTransform;
use skia_safe::{
    self as sk, canvas::SaveLayerRec, color_filters, image_filters, shaders, surfaces,
    BlendMode as SkBlendMode, Color, ColorMatrix, Font, IPoint, ISize, Image, Matrix, Paint,
    Path as SkPath, Point3, Rect, Shader, TileMode,
};
use usvg::tiny_skia_path::{Path as TinyPath, PathSegment};
use usvg::{Node, Options, Tree};

thread_local! {
    static FONT: Font = Font::new(
        cg::fonts::embedded::typeface(cg::fonts::embedded::geistmono::BYTES),
        12.0
    );
}

// ----------------------------------------------------------------------------
// Type Definitions
// ----------------------------------------------------------------------------

/// Represents a filter primitive that can be converted to Skia
#[derive(Debug, Clone)]
enum FilterPrimitive {
    /// feGaussianBlur: blur with stdDeviation
    GaussianBlur {
        std_deviation_x: f32,
        std_deviation_y: f32,
    },
    /// feColorMatrix: color transformation matrix
    ColorMatrix { kind: ColorMatrixType },
    /// feOffset: translate by dx, dy
    Offset { dx: f32, dy: f32 },
    /// feBlend: blend two inputs with a mode
    Blend { mode: SkBlendMode },
    /// feComposite: composite two inputs with an operator
    Composite { operator: CompositeOperator },
    /// feMorphology: dilate or erode
    Morphology {
        operator: MorphologyOperator,
        radius_x: f32,
        radius_y: f32,
    },
    /// feDropShadow: drop shadow effect
    DropShadow {
        dx: f32,
        dy: f32,
        std_deviation_x: f32,
        std_deviation_y: f32,
        color: Color,
    },
    /// feMerge: merge multiple inputs
    Merge { inputs: Vec<String> },
    /// feFlood: solid color fill
    /// flood-opacity is pre-multiplied into the color
    Flood { color: Color },
    /// feTurbulence: procedural noise texture
    Turbulence {
        base_frequency_x: f32,
        base_frequency_y: f32,
        num_octaves: u32,
        seed: f32,
        stitch_tiles: bool,
        turbulence_type: TurbulenceType,
    },
    /// feDisplacementMap: displace pixels using a displacement map
    DisplacementMap {
        scale: f32,
        x_channel: DisplacementChannel,
        y_channel: DisplacementChannel,
    },
    /// feDiffuseLighting: diffuse lighting effect
    DiffuseLighting {
        surface_scale: f32,
        diffuse_constant: f32,
        light_color: Color,
        light: LightSource,
    },
    /// feSpecularLighting: specular lighting effect
    SpecularLighting {
        surface_scale: f32,
        specular_constant: f32, // Maps to Skia's 'ks' parameter
        specular_exponent: f32, // Maps to Skia's 'shininess' parameter
        light_color: Color,
        light: LightSource,
    },
    /// feComponentTransfer: per-channel transfer functions
    ComponentTransfer {
        func_r: usvg::filter::TransferFunction,
        func_g: usvg::filter::TransferFunction,
        func_b: usvg::filter::TransferFunction,
        func_a: usvg::filter::TransferFunction,
    },
    /// feConvolveMatrix: convolution kernel filter
    ConvolveMatrix {
        kernel_matrix: Vec<f32>, // Flattened kernel values (row-major)
        order_x: u32,            // Kernel width
        order_y: u32,            // Kernel height
        target_x: u32,           // Kernel target X (center)
        target_y: u32,           // Kernel target Y (center)
        divisor: f32,            // Normalization divisor
        bias: f32,               // Bias value added after division
        preserve_alpha: bool,    // Whether to preserve original alpha
        edge_mode: EdgeMode,     // Edge handling mode
    },
}

#[derive(Debug, Clone, Copy)]
enum CompositeOperator {
    Over,
    In,
    Out,
    Atop,
    Xor,
    Arithmetic { k1: f32, k2: f32, k3: f32, k4: f32 },
}

#[derive(Debug, Clone, Copy)]
enum EdgeMode {
    None,      // Skip out-of-bounds pixels
    Duplicate, // Clamp to edge pixels
    Wrap,      // Wrap around (tile)
}

#[derive(Debug, Clone, Copy)]
enum MorphologyOperator {
    Dilate,
    Erode,
}

#[derive(Debug, Clone)]
enum ColorMatrixType {
    /// type="matrix": arbitrary 5x4 color transformation matrix
    Matrix([f32; 20]),
    /// type="saturate": saturation adjustment (0.0 = grayscale, 1.0 = original, >1.0 = oversaturated)
    Saturate(f32),
    /// type="hueRotate": hue rotation in degrees
    HueRotate(f32),
    /// type="luminanceToAlpha": convert luminance to alpha channel
    LuminanceToAlpha,
}

#[derive(Debug, Clone, Copy)]
enum TurbulenceType {
    /// type="fractalNoise": smooth, continuous noise
    FractalNoise,
    /// type="turbulence": sharper, more chaotic noise
    Turbulence,
}

#[derive(Debug, Clone, Copy)]
enum DisplacementChannel {
    R,
    G,
    B,
    A,
}

#[derive(Debug, Clone)]
enum LightSource {
    /// feDistantLight: light from infinite distance
    Distant {
        azimuth: f32,   // azimuth angle in degrees
        elevation: f32, // elevation angle in degrees
    },
    /// fePointLight: point light at specific location
    Point { x: f32, y: f32, z: f32 },
    /// feSpotLight: spotlight with position, target, and cone
    Spot {
        x: f32,
        y: f32,
        z: f32,
        points_at_x: f32,
        points_at_y: f32,
        points_at_z: f32,
        specular_exponent: f32,
        limiting_cone_angle: f32,
    },
}

/// Filter pipeline that processes primitives in order
///
/// Each primitive can:
/// - Reference inputs via `input` and `input2` (by name or default to PreviousResult)
/// - Store its output via `result` attribute (for later primitives to reference)
struct FilterPipeline {
    /// (primitive, input, input2, result_name, primitive_rect)
    /// primitive_rect is the filter subregion for primitives like Flood that need explicit size
    primitives: Vec<(
        FilterPrimitive,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<(f32, f32, f32, f32)>, // (x, y, width, height) for primitive region
    )>,
}

impl FilterPipeline {
    fn new() -> Self {
        Self {
            primitives: Vec::new(),
        }
    }

    fn add_primitive(
        &mut self,
        primitive: FilterPrimitive,
        input: Option<String>,
        input2: Option<String>,
        result: Option<String>,
        primitive_rect: Option<(f32, f32, f32, f32)>,
    ) {
        self.primitives
            .push((primitive, input, input2, result, primitive_rect));
    }

    /// Apply the filter pipeline to an image, returning the filtered result
    ///
    /// Processes primitives in order, resolving inputs and storing results for chaining.
    /// Uses a single reusable surface for all operations to minimize memory allocation.
    ///
    /// `layer_bounds_offset` is the offset of the layer bounds (expanded filter region) in object coordinates.
    /// This is used to adjust primitive coordinates from filter space to surface space.
    /// `transform` is the group transform, needed to transform light source coordinates from SVG user space to filter region.
    fn apply(
        &self,
        source: &Image,
        layer_bounds_offset: (f32, f32),
        transform: usvg::Transform,
    ) -> Option<Image> {
        let (w, h) = (source.width(), source.height());
        // Create a single reusable surface for all filter operations
        let mut surface = surfaces::raster_n32_premul((w, h)).expect("create surface");

        let mut results: std::collections::HashMap<String, Image> =
            std::collections::HashMap::new();
        results.insert("SourceGraphic".to_string(), source.clone());
        results.insert("SourceAlpha".to_string(), source.clone()); // Approximation

        for (primitive, input, input2, result_name, primitive_rect) in &self.primitives {
            // Special handling for Merge - it uses multiple inputs
            if let FilterPrimitive::Merge { inputs } = primitive {
                let merge_inputs: Vec<Image> = inputs
                    .iter()
                    .filter_map(|inp| {
                        // Empty input name means use PreviousResult
                        if inp.is_empty() {
                            results.get("PreviousResult").cloned()
                        } else {
                            resolve_input(&Some(inp.clone()), &results, source)
                        }
                    })
                    .collect();

                if !merge_inputs.is_empty() {
                    {
                        let canvas = surface.canvas();
                        apply_merge_to_canvas(canvas, &merge_inputs, w, h);
                    }
                    let merged = surface.image_snapshot();

                    if let Some(result_key) = result_name {
                        results.insert(result_key.clone(), merged.clone());
                    }
                    results.insert("PreviousResult".to_string(), merged);
                }
                continue;
            }

            // Use a scope to limit canvas borrow lifetime
            {
                let canvas = surface.canvas();
                // Clear canvas for this primitive operation
                canvas.clear(Color::TRANSPARENT);

                // For Flood and Turbulence, they don't have inputs - use primitive region or source dimensions
                if matches!(
                    primitive,
                    FilterPrimitive::Flood { .. } | FilterPrimitive::Turbulence { .. }
                ) {
                    // For Flood, we need to create an image at the source size, but only fill
                    // the subregion specified by the primitive's x, y, width, height
                    // Note: primitive_rect is in filter coordinate space (object coordinates)
                    // The canvas in apply() has been translated by -layer_bounds.left() in render_filtered_group
                    // So we need to adjust primitive coordinates to surface coordinates
                    match primitive_rect {
                        Some(rect) => {
                            let (prim_x, prim_y, prim_width, prim_height) = *rect;
                            match primitive {
                                FilterPrimitive::Flood { color } => {
                                    // Fill only the primitive subregion with the flood color
                                    // primitive_rect is in filter coordinate space (object coordinates)
                                    // The canvas in apply() has been translated by -layer_bounds.left() in render_filtered_group
                                    // So we need to adjust primitive coordinates to surface coordinates:
                                    // adjusted_x = prim_x - layer_bounds.left()
                                    let (layer_bounds_left, layer_bounds_top) = layer_bounds_offset;
                                    let adjusted_x = prim_x - layer_bounds_left;
                                    let adjusted_y = prim_y - layer_bounds_top;

                                    let mut paint = Paint::default();
                                    paint.set_anti_alias(false);
                                    let shader = shaders::color(*color);
                                    paint.set_shader(shader);
                                    // Draw rect at the adjusted position (in surface coordinates)
                                    canvas.draw_rect(
                                        Rect::from_xywh(
                                            adjusted_x,
                                            adjusted_y,
                                            prim_width,
                                            prim_height,
                                        ),
                                        &paint,
                                    );
                                }
                                FilterPrimitive::Turbulence { .. } => {
                                    // For Turbulence, use the full size (it doesn't have position)
                                    apply_primitive_with_size_to_canvas(canvas, primitive, w, h);
                                }
                                _ => unreachable!(),
                            }
                        }
                        None => {
                            // No primitive region - use source dimensions
                            apply_primitive_with_size_to_canvas(canvas, primitive, w, h);
                        }
                    }
                } else {
                    let input_img = resolve_input(input, &results, source)?;
                    let input2_img = input2
                        .as_ref()
                        .and_then(|in2| resolve_input(&Some(in2.clone()), &results, source));
                    apply_primitive_to_canvas(
                        canvas,
                        primitive,
                        &input_img,
                        input2_img.as_ref(),
                        input.as_ref(),
                        input2.as_ref(),
                        source,
                        layer_bounds_offset,
                        transform,
                    );
                }
            }

            // Snapshot the result for storing (only when needed for later use)
            // Canvas borrow is dropped, so we can snapshot
            let output_img = surface.image_snapshot();
            if let Some(result_key) = result_name {
                results.insert(result_key.clone(), output_img.clone());
            }
            // Always store as PreviousResult for chaining (when no explicit result name)
            results.insert("PreviousResult".to_string(), output_img);
        }

        // Return the final result
        results.get("PreviousResult").cloned()
    }
}

// ----------------------------------------------------------------------------
// Input/Output Resolution
// ----------------------------------------------------------------------------

/// Resolve a filter input name to an actual image
///
/// Handles:
/// - `SourceGraphic` / `SourceAlpha` - the original element
/// - Named results (e.g., "offsetBlur") - intermediate results from previous primitives
/// - `None` - defaults to PreviousResult if available, otherwise SourceGraphic
fn resolve_input(
    input: &Option<String>,
    results: &std::collections::HashMap<String, Image>,
    source: &Image,
) -> Option<Image> {
    match input {
        Some(name) if name == "SourceGraphic" => Some(source.clone()),
        Some(name) if name == "SourceAlpha" => Some(source.clone()), // Approximation
        Some(name) => results.get(name).cloned(),
        None => {
            // Default to PreviousResult if available, otherwise SourceGraphic
            results
                .get("PreviousResult")
                .cloned()
                .or(Some(source.clone()))
        }
    }
}

/// Convert a usvg filter `Input` into a pipeline input name
fn input_to_name(input: &usvg::filter::Input) -> Option<String> {
    match input {
        usvg::filter::Input::SourceGraphic => Some("SourceGraphic".to_string()),
        usvg::filter::Input::SourceAlpha => {
            // For now we treat SourceAlpha the same as SourceGraphic.
            // A more correct implementation would extract the alpha channel only.
            Some("SourceGraphic".to_string())
        }
        usvg::filter::Input::Reference(name) => Some(name.clone()),
    }
}

// ----------------------------------------------------------------------------
// Primitive Application
// ----------------------------------------------------------------------------

/// Convert usvg color with opacity to Skia Color
fn usvg_color_to_skia(color: usvg::Color, opacity: f32) -> Color {
    Color::from_argb((opacity * 255.0) as u8, color.red, color.green, color.blue)
}

/// Convert ColorMatrixType to a 5x4 matrix array
fn color_matrix_to_array(kind: &ColorMatrixType) -> [f32; 20] {
    match kind {
        ColorMatrixType::Matrix(m) => *m,
        ColorMatrixType::Saturate(s) => saturation(*s),
        ColorMatrixType::HueRotate(angle) => hue_rotate(*angle),
        ColorMatrixType::LuminanceToAlpha => luminance_to_alpha(),
    }
}

/// Build a 256-entry lookup table from a transfer function
///
/// Evaluates the transfer function for each input value 0-255 (normalized to 0.0-1.0)
/// and stores the result as u8 in the lookup table.
fn build_transfer_lut(func: &usvg::filter::TransferFunction) -> [u8; 256] {
    let mut lut = [0u8; 256];
    for i in 0..256 {
        let c = i as f32 / 255.0;
        let result = match func {
            usvg::filter::TransferFunction::Identity => c,
            usvg::filter::TransferFunction::Table(values) => {
                // Linear interpolation between table values
                // Reference: component_transfer.rs:44-56
                if values.is_empty() {
                    c
                } else {
                    let n = values.len() - 1;
                    let k = (c * (n as f32)).floor() as usize;
                    let k = std::cmp::min(k, n);
                    if k == n {
                        values[k]
                    } else {
                        let vk = values[k];
                        let vk1 = values[k + 1];
                        // Match reference exactly: shadow k and n as f32
                        let k = k as f32;
                        let n = n as f32;
                        vk + (c - k / n) * n * (vk1 - vk)
                    }
                }
            }
            usvg::filter::TransferFunction::Discrete(values) => {
                // Step function lookup (no interpolation)
                // Reference: component_transfer.rs:58-61
                if values.is_empty() {
                    c
                } else {
                    let n = values.len();
                    let k = (c * (n as f32)).floor() as usize;
                    values[std::cmp::min(k, n - 1)]
                }
            }
            usvg::filter::TransferFunction::Linear { slope, intercept } => slope * c + intercept,
            usvg::filter::TransferFunction::Gamma {
                amplitude,
                exponent,
                offset,
            } => amplitude * c.powf(*exponent) + offset,
        };
        // Clamp to [0.0, 1.0] and convert to u8
        lut[i] = (result.clamp(0.0, 1.0) * 255.0) as u8;
    }
    lut
}

/// Check if a transfer function is identity or empty (no-op)
fn is_identity_or_empty(func: &usvg::filter::TransferFunction) -> bool {
    match func {
        usvg::filter::TransferFunction::Identity => true,
        usvg::filter::TransferFunction::Table(values) => values.is_empty(),
        usvg::filter::TransferFunction::Discrete(values) => values.is_empty(),
        _ => false,
    }
}

/// Create an identity lookup table (pass-through: input = output)
fn identity_lut() -> [u8; 256] {
    let mut lut = [0u8; 256];
    for i in 0..256 {
        lut[i] = i as u8;
    }
    lut
}

/// Apply convolve matrix using Skia's native matrix_convolution API
fn apply_convolve_matrix_skia(
    canvas: &sk::Canvas,
    input: &Image,
    kernel_matrix: &[f32],
    order_x: u32,
    order_y: u32,
    target_x: u32,
    target_y: u32,
    divisor: f32,
    bias: f32,
    preserve_alpha: bool,
    edge_mode: EdgeMode,
) {
    // Convert input Image to ImageFilter
    let input_filter = image_filters::image(input.clone(), None, None, None);

    // Map EdgeMode to TileMode
    let tile_mode = match edge_mode {
        EdgeMode::None => TileMode::Decal, // Transparent outside (skip out-of-bounds)
        EdgeMode::Duplicate => TileMode::Clamp, // Clamp to edge pixels
        EdgeMode::Wrap => TileMode::Repeat, // Wrap around (tile)
    };

    // Skia's gain is a multiplier applied after convolution
    // SVG's divisor divides the result, so gain = 1.0 / divisor
    let gain = if divisor != 0.0 { 1.0 / divisor } else { 1.0 };

    // Note: Skia's matrix_convolution expects kernel in row-major order
    // SVG also uses row-major, but applies it flipped for correlation
    // We need to flip the kernel to match SVG's behavior
    // The reference shows: get(columns - ox - 1, rows - oy - 1)
    // So we need to reverse both dimensions
    let mut flipped_kernel = vec![0.0f32; kernel_matrix.len()];
    for oy in 0..order_y {
        for ox in 0..order_x {
            let src_idx = (oy * order_x + ox) as usize;
            let dst_idx = ((order_y - 1 - oy) * order_x + (order_x - 1 - ox)) as usize;
            flipped_kernel[dst_idx] = kernel_matrix[src_idx];
        }
    }

    // Apply Skia's matrix_convolution
    if let Some(conv_filter) = image_filters::matrix_convolution(
        ISize::new(order_x as i32, order_y as i32),
        &flipped_kernel,
        gain,
        bias,
        IPoint::new(target_x as i32, target_y as i32),
        tile_mode,
        !preserve_alpha, // convolve_alpha: true means convolve alpha, false means preserve it
        input_filter,
        None, // crop_rect
    ) {
        // Note: Anti-aliasing doesn't apply to image filters (pixel operations)
        // but we keep it for consistency with other filter primitives
        let mut paint = Paint::default();
        paint.set_image_filter(conv_filter);
        canvas.draw_image(input, (0, 0), Some(&paint));
    } else {
        // Fallback: draw input if filter creation failed
        canvas.draw_image(input, (0, 0), None);
    }
}

/// Apply a filter primitive to a canvas (reuses existing surface)
fn apply_primitive_to_canvas(
    canvas: &sk::Canvas,
    primitive: &FilterPrimitive,
    input: &Image,
    input2: Option<&Image>,
    input_name: Option<&String>,
    input2_name: Option<&String>,
    source: &Image,
    layer_bounds_offset: (f32, f32),
    transform: usvg::Transform,
) {
    let mut paint = Paint::default();
    paint.set_anti_alias(true);

    match primitive {
        FilterPrimitive::GaussianBlur {
            std_deviation_x,
            std_deviation_y,
        } => {
            if let Some(blur_filter) = image_filters::blur(
                (*std_deviation_x, *std_deviation_y),
                sk::TileMode::Clamp,
                None,
                None,
            ) {
                paint.set_image_filter(blur_filter);
            }
            canvas.draw_image(input, (0, 0), Some(&paint));
        }

        FilterPrimitive::ColorMatrix { kind } => {
            let matrix = color_matrix_to_array(kind);
            let cm = ColorMatrix::new(
                matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5], matrix[6],
                matrix[7], matrix[8], matrix[9], matrix[10], matrix[11], matrix[12], matrix[13],
                matrix[14], matrix[15], matrix[16], matrix[17], matrix[18], matrix[19],
            );
            let color_filter = color_filters::matrix(&cm, None);
            if let Some(image_filter) = image_filters::color_filter(color_filter, None, None) {
                paint.set_image_filter(image_filter);
            }
            canvas.draw_image(input, (0, 0), Some(&paint));
        }

        FilterPrimitive::ComponentTransfer {
            func_r,
            func_g,
            func_b,
            func_a,
        } => {
            // Build lookup tables for each channel
            // Use identity LUT for identity/empty functions to avoid unnecessary computation
            // Note: We call identity_lut() for each channel since arrays don't implement Copy
            let r_table = if is_identity_or_empty(func_r) {
                identity_lut()
            } else {
                build_transfer_lut(func_r)
            };
            let g_table = if is_identity_or_empty(func_g) {
                identity_lut()
            } else {
                build_transfer_lut(func_g)
            };
            let b_table = if is_identity_or_empty(func_b) {
                identity_lut()
            } else {
                build_transfer_lut(func_b)
            };
            let a_table = if is_identity_or_empty(func_a) {
                identity_lut()
            } else {
                build_transfer_lut(func_a)
            };

            // Apply Skia color filter using table_argb
            // Note: table_argb takes (A, R, G, B) in that order
            if let Some(color_filter) =
                color_filters::table_argb(&a_table, &r_table, &g_table, &b_table)
            {
                if let Some(image_filter) = image_filters::color_filter(color_filter, None, None) {
                    paint.set_image_filter(image_filter);
                }
            }
            canvas.draw_image(input, (0, 0), Some(&paint));
        }

        FilterPrimitive::ConvolveMatrix {
            kernel_matrix,
            order_x,
            order_y,
            target_x,
            target_y,
            divisor,
            bias,
            preserve_alpha,
            edge_mode,
        } => {
            // Use Skia's native matrix_convolution API
            apply_convolve_matrix_skia(
                canvas,
                input,
                kernel_matrix,
                *order_x,
                *order_y,
                *target_x,
                *target_y,
                *divisor,
                *bias,
                *preserve_alpha,
                *edge_mode,
            );
        }

        FilterPrimitive::Offset { dx, dy } => {
            if let Some(offset_filter) = image_filters::offset((*dx, *dy), None, None) {
                paint.set_image_filter(offset_filter);
            }
            canvas.draw_image(input, (0, 0), Some(&paint));
        }

        FilterPrimitive::Blend { mode } => {
            if let Some(input2_img) = input2 {
                // Blend requires two inputs - draw input2 first, then blend input on top
                canvas.draw_image(input2_img, (0, 0), None);
                paint.set_blend_mode(*mode);
                canvas.draw_image(input, (0, 0), Some(&paint));
            } else {
                // Single input - just draw it
                canvas.draw_image(input, (0, 0), Some(&paint));
            }
        }

        FilterPrimitive::Composite { operator } => {
            if let Some(input2_img) = input2 {
                match operator {
                    CompositeOperator::Arithmetic { k1, k2, k3, k4 } => {
                        // Use Skia's arithmetic image filter
                        // SVG formula: k1 * i1 * i2 + k2 * i1 + k3 * i2 + k4
                        // where i1 = input (SVG 'in'), i2 = input2 (SVG 'in2')
                        // Skia formula: k1 * bg * fg + k2 * fg + k3 * bg + k4
                        // To match SVG: bg = i1 (input), fg = i2 (input2)
                        // This matches resvg's mapping: src1 (i1) -> bg, src2 (i2) -> fg
                        let background_filter = image_filters::image(input, None, None, None);
                        let foreground_filter = image_filters::image(input2_img, None, None, None);

                        if let (Some(bg), Some(fg)) = (background_filter, foreground_filter) {
                            if let Some(arithmetic_filter) = image_filters::arithmetic(
                                *k1,
                                *k2,
                                *k3,
                                *k4,
                                true, // enforce_pm_color: clamp RGB to alpha
                                Some(bg),
                                Some(fg),
                                None, // crop_rect
                            ) {
                                // Determine if SourceGraphic is involved for geometry clipping
                                // SVG spec requires filtered results to be clipped to element's geometry
                                // When SourceGraphic is one of the inputs, clip to source (element's geometry)
                                let should_clip_to_source = input_name
                                    .map(|n| n == "SourceGraphic")
                                    .unwrap_or(false)
                                    || input2_name.map(|n| n == "SourceGraphic").unwrap_or(false);

                                // Apply arithmetic filter in a layer so we can mask the result
                                let bounds_rect = Rect::from_xywh(
                                    0.0,
                                    0.0,
                                    input.width() as f32,
                                    input.height() as f32,
                                );
                                canvas.save_layer(&SaveLayerRec::default().bounds(&bounds_rect));

                                paint.set_image_filter(arithmetic_filter);
                                // Draw a dummy image to trigger the filter
                                // The filter will composite both inputs
                                canvas.draw_image(input, (0, 0), Some(&paint));

                                // Clip to SourceGraphic's alpha if one of the inputs is SourceGraphic
                                // This ensures arithmetic composite respects the element's geometry
                                // Only clip when SourceGraphic is involved (not for intermediate composites)
                                if should_clip_to_source {
                                    let mut mask_paint = Paint::default();
                                    mask_paint.set_blend_mode(SkBlendMode::DstIn);
                                    // Use source directly (the actual SourceGraphic image)
                                    canvas.draw_image(source, (0, 0), Some(&mask_paint));
                                }

                                canvas.restore();
                            } else {
                                // Fallback: just draw inputs
                                canvas.draw_image(input2_img, (0, 0), None);
                                canvas.draw_image(input, (0, 0), None);
                            }
                        } else {
                            // Fallback: just draw inputs
                            canvas.draw_image(input2_img, (0, 0), None);
                            canvas.draw_image(input, (0, 0), None);
                        }
                    }
                    _ => {
                        // Draw input2 first, then composite input on top
                        canvas.draw_image(input2_img, (0, 0), None);
                        let blend_mode = match operator {
                            CompositeOperator::Over => SkBlendMode::SrcOver,
                            CompositeOperator::In => SkBlendMode::SrcIn,
                            CompositeOperator::Out => SkBlendMode::SrcOut,
                            CompositeOperator::Atop => SkBlendMode::SrcATop,
                            CompositeOperator::Xor => SkBlendMode::Xor,
                            CompositeOperator::Arithmetic { .. } => unreachable!(),
                        };
                        paint.set_blend_mode(blend_mode);
                        canvas.draw_image(input, (0, 0), Some(&paint));
                    }
                }
            } else {
                canvas.draw_image(input, (0, 0), Some(&paint));
            }
        }

        FilterPrimitive::Morphology {
            operator,
            radius_x,
            radius_y,
        } => {
            let morph_filter = match operator {
                MorphologyOperator::Dilate => {
                    image_filters::dilate((*radius_x, *radius_y), None, None)
                }
                MorphologyOperator::Erode => {
                    image_filters::erode((*radius_x, *radius_y), None, None)
                }
            };
            if let Some(mf) = morph_filter {
                paint.set_image_filter(mf);
            }
            canvas.draw_image(input, (0, 0), Some(&paint));
        }

        FilterPrimitive::DropShadow {
            dx,
            dy,
            std_deviation_x,
            std_deviation_y,
            color,
        } => {
            // feDropShadow should render both the shadow AND the original graphic
            // drop_shadow_only only renders the shadow, so we need to:
            // 1. Draw the shadow first (behind)
            if let Some(shadow_filter) = image_filters::drop_shadow_only(
                (*dx, *dy),
                (*std_deviation_x, *std_deviation_y),
                *color,
                None,
                None,
                None,
            ) {
                paint.set_image_filter(shadow_filter);
            }
            canvas.draw_image(input, (0, 0), Some(&paint));

            // 2. Draw the original image on top (without filter)
            paint.set_image_filter(None);
            canvas.draw_image(input, (0, 0), Some(&paint));
        }

        FilterPrimitive::Merge { .. } => {
            // Merge is handled at pipeline level, this should never be reached
            unreachable!("Merge should be handled in FilterPipeline::apply")
        }

        FilterPrimitive::Flood { .. } => {
            // Flood is handled at pipeline level with apply_primitive_with_size_to_canvas
            unreachable!("Flood should be handled in FilterPipeline::apply with apply_primitive_with_size_to_canvas")
        }

        FilterPrimitive::Turbulence { .. } => {
            // Turbulence is handled at pipeline level with apply_primitive_with_size_to_canvas
            unreachable!("Turbulence should be handled in FilterPipeline::apply with apply_primitive_with_size_to_canvas")
        }

        FilterPrimitive::DisplacementMap {
            scale,
            x_channel,
            y_channel,
        } => {
            // DisplacementMap requires input2 (the displacement map image)
            if let Some(displacement_img) = input2 {
                // Convert displacement channels to Skia ColorChannel
                let x_ch = match x_channel {
                    DisplacementChannel::R => sk::ColorChannel::R,
                    DisplacementChannel::G => sk::ColorChannel::G,
                    DisplacementChannel::B => sk::ColorChannel::B,
                    DisplacementChannel::A => sk::ColorChannel::A,
                };
                let y_ch = match y_channel {
                    DisplacementChannel::R => sk::ColorChannel::R,
                    DisplacementChannel::G => sk::ColorChannel::G,
                    DisplacementChannel::B => sk::ColorChannel::B,
                    DisplacementChannel::A => sk::ColorChannel::A,
                };

                // Convert images to image filters
                let displacement_map_filter = image_filters::image(
                    displacement_img,
                    None, // dst_rect
                    None, // sampling
                    None, // crop_rect
                );
                let source_filter = image_filters::image(
                    input, None, // dst_rect
                    None, // sampling
                    None, // crop_rect
                );

                // Create displacement map filter
                if let (Some(dmf), Some(sf)) = (displacement_map_filter, source_filter) {
                    if let Some(displacement_filter) = image_filters::displacement_map(
                        (x_ch, y_ch),
                        *scale,
                        Some(dmf),
                        Some(sf),
                        None, // crop_rect
                    ) {
                        paint.set_image_filter(displacement_filter);
                    }
                }
                canvas.draw_image(input, (0, 0), Some(&paint));
            } else {
                // No displacement map - just draw input as-is
                canvas.draw_image(input, (0, 0), Some(&paint));
            }
        }

        FilterPrimitive::DiffuseLighting {
            surface_scale,
            diffuse_constant,
            light_color,
            light,
        } => {
            // Transform light source coordinates from SVG user space to filter region coordinate system
            // This matches resvg's transform_light_source function
            use std::f32::consts::SQRT_2;
            let (layer_bounds_left, layer_bounds_top) = layer_bounds_offset;
            let region_x = layer_bounds_left;
            let region_y = layer_bounds_top;
            let sz = (transform.sx * transform.sx + transform.sy * transform.sy).sqrt() / SQRT_2;

            // Convert input image to image filter
            if let Some(source_filter) = image_filters::image(input, None, None, None) {
                // Create lighting filter based on light type
                let lighting_filter = match light {
                    LightSource::Distant { azimuth, elevation } => {
                        // Distant lights don't need coordinate transformation
                        // Convert azimuth and elevation to direction vector
                        let az_rad = azimuth.to_radians();
                        let el_rad = elevation.to_radians();
                        let direction = Point3::new(
                            az_rad.cos() * el_rad.cos(),
                            az_rad.sin() * el_rad.cos(),
                            el_rad.sin(),
                        );
                        image_filters::distant_lit_diffuse(
                            direction,
                            *light_color,
                            *surface_scale,
                            *diffuse_constant,
                            Some(source_filter),
                            None,
                        )
                    }
                    LightSource::Point { x, y, z } => {
                        // Transform point light coordinates
                        let mut point = usvg::tiny_skia_path::Point::from_xy(*x, *y);
                        transform.map_point(&mut point);
                        let transformed_x = point.x - region_x;
                        let transformed_y = point.y - region_y;
                        let transformed_z = z * sz;
                        let location = Point3::new(transformed_x, transformed_y, transformed_z);
                        image_filters::point_lit_diffuse(
                            location,
                            *light_color,
                            *surface_scale,
                            *diffuse_constant,
                            Some(source_filter),
                            None,
                        )
                    }
                    LightSource::Spot {
                        x,
                        y,
                        z,
                        points_at_x,
                        points_at_y,
                        points_at_z,
                        specular_exponent,
                        limiting_cone_angle,
                    } => {
                        // Transform spot light coordinates
                        let mut location_point = usvg::tiny_skia_path::Point::from_xy(*x, *y);
                        transform.map_point(&mut location_point);
                        let transformed_x = location_point.x - region_x;
                        let transformed_y = location_point.y - region_y;
                        let transformed_z = z * sz;

                        let mut target_point =
                            usvg::tiny_skia_path::Point::from_xy(*points_at_x, *points_at_y);
                        transform.map_point(&mut target_point);
                        let transformed_points_at_x = target_point.x - region_x;
                        let transformed_points_at_y = target_point.y - region_y;
                        let transformed_points_at_z = points_at_z * sz;

                        let location = Point3::new(transformed_x, transformed_y, transformed_z);
                        let target = Point3::new(
                            transformed_points_at_x,
                            transformed_points_at_y,
                            transformed_points_at_z,
                        );
                        // Convert limiting_cone_angle from degrees to radians for Skia
                        // Note: Skia's cutoff_angle is the half-angle of the cone (same as SVG's limitingConeAngle)
                        let cutoff_angle_rad = limiting_cone_angle.to_radians();

                        image_filters::spot_lit_diffuse(
                            location,
                            target,
                            *specular_exponent,
                            cutoff_angle_rad,
                            *light_color,
                            *surface_scale,
                            *diffuse_constant,
                            Some(source_filter),
                            None,
                        )
                    }
                };
                if let Some(lf) = lighting_filter {
                    paint.set_image_filter(lf);
                }
            }
            canvas.draw_image(input, (0, 0), Some(&paint));
        }

        FilterPrimitive::SpecularLighting {
            surface_scale,
            specular_constant,
            specular_exponent,
            light_color,
            light,
        } => {
            // Transform light source coordinates from SVG user space to filter region coordinate system
            // This matches resvg's transform_light_source function
            use std::f32::consts::SQRT_2;
            let (layer_bounds_left, layer_bounds_top) = layer_bounds_offset;
            let region_x = layer_bounds_left;
            let region_y = layer_bounds_top;
            let sz = (transform.sx * transform.sx + transform.sy * transform.sy).sqrt() / SQRT_2;

            // Convert input image to image filter
            if let Some(source_filter) = image_filters::image(input, None, None, None) {
                // Create lighting filter based on light type
                let lighting_filter = match light {
                    LightSource::Distant { azimuth, elevation } => {
                        // Distant lights don't need coordinate transformation
                        // Convert azimuth and elevation to direction vector
                        let az_rad = azimuth.to_radians();
                        let el_rad = elevation.to_radians();
                        let direction = Point3::new(
                            az_rad.cos() * el_rad.cos(),
                            az_rad.sin() * el_rad.cos(),
                            el_rad.sin(),
                        );
                        image_filters::distant_lit_specular(
                            direction,
                            *light_color,
                            *surface_scale,
                            *specular_constant, // ks parameter
                            *specular_exponent, // shininess parameter
                            Some(source_filter),
                            None,
                        )
                    }
                    LightSource::Point { x, y, z } => {
                        // Transform point light coordinates
                        let mut point = usvg::tiny_skia_path::Point::from_xy(*x, *y);
                        transform.map_point(&mut point);
                        let transformed_x = point.x - region_x;
                        let transformed_y = point.y - region_y;
                        let transformed_z = z * sz;
                        let location = Point3::new(transformed_x, transformed_y, transformed_z);
                        image_filters::point_lit_specular(
                            location,
                            *light_color,
                            *surface_scale,
                            *specular_constant, // ks parameter
                            *specular_exponent, // shininess parameter
                            Some(source_filter),
                            None,
                        )
                    }
                    LightSource::Spot {
                        x,
                        y,
                        z,
                        points_at_x,
                        points_at_y,
                        points_at_z,
                        specular_exponent: falloff_exponent,
                        limiting_cone_angle,
                    } => {
                        // Transform spot light coordinates
                        let mut location_point = usvg::tiny_skia_path::Point::from_xy(*x, *y);
                        transform.map_point(&mut location_point);
                        let transformed_x = location_point.x - region_x;
                        let transformed_y = location_point.y - region_y;
                        let transformed_z = z * sz;

                        let mut target_point =
                            usvg::tiny_skia_path::Point::from_xy(*points_at_x, *points_at_y);
                        transform.map_point(&mut target_point);
                        let transformed_points_at_x = target_point.x - region_x;
                        let transformed_points_at_y = target_point.y - region_y;
                        let transformed_points_at_z = points_at_z * sz;

                        let location = Point3::new(transformed_x, transformed_y, transformed_z);
                        let target = Point3::new(
                            transformed_points_at_x,
                            transformed_points_at_y,
                            transformed_points_at_z,
                        );
                        // Convert limiting_cone_angle from degrees to radians for Skia
                        let cutoff_angle_rad = limiting_cone_angle.to_radians();
                        image_filters::spot_lit_specular(
                            location,
                            target,
                            *falloff_exponent, // falloff_exponent from spot light
                            cutoff_angle_rad,
                            *light_color,
                            *surface_scale,
                            *specular_constant, // ks parameter
                            *specular_exponent, // shininess parameter
                            Some(source_filter),
                            None,
                        )
                    }
                };
                if let Some(lf) = lighting_filter {
                    paint.set_image_filter(lf);
                }
            }
            canvas.draw_image(input, (0, 0), Some(&paint));
        }
    }
}

/// Apply a primitive with explicit size to a canvas (reuses existing surface)
fn apply_primitive_with_size_to_canvas(
    canvas: &sk::Canvas,
    primitive: &FilterPrimitive,
    width: i32,
    height: i32,
) {
    match primitive {
        FilterPrimitive::Flood { color } => {
            // Use shader approach: create a solid color shader and fill the rect
            // This ensures proper color rendering and can handle transforms better
            let mut paint = Paint::default();
            paint.set_anti_alias(false); // No need for anti-aliasing on a solid fill
            let shader = shaders::color(*color);
            paint.set_shader(shader);

            // Draw rect covering the entire surface
            canvas.draw_rect(Rect::from_wh(width as f32, height as f32), &paint);
        }
        FilterPrimitive::Turbulence {
            base_frequency_x,
            base_frequency_y,
            num_octaves,
            seed,
            stitch_tiles,
            turbulence_type,
        } => {
            // Create noise shader based on type
            let noise_shader = if *stitch_tiles {
                // Stitch tiles: provide tile size for seamless tiling
                let tile_size = ISize::new(width, height);
                match turbulence_type {
                    TurbulenceType::FractalNoise => Shader::fractal_perlin_noise(
                        (*base_frequency_x, *base_frequency_y),
                        *num_octaves as usize,
                        *seed,
                        Some(tile_size),
                    ),
                    TurbulenceType::Turbulence => Shader::turbulence_perlin_noise(
                        (*base_frequency_x, *base_frequency_y),
                        *num_octaves as usize,
                        *seed,
                        Some(tile_size),
                    ),
                }
            } else {
                // No stitching: no tile size
                match turbulence_type {
                    TurbulenceType::FractalNoise => Shader::fractal_perlin_noise(
                        (*base_frequency_x, *base_frequency_y),
                        *num_octaves as usize,
                        *seed,
                        None,
                    ),
                    TurbulenceType::Turbulence => Shader::turbulence_perlin_noise(
                        (*base_frequency_x, *base_frequency_y),
                        *num_octaves as usize,
                        *seed,
                        None,
                    ),
                }
            };

            if let Some(shader) = noise_shader {
                let mut paint = Paint::default();
                paint.set_shader(shader);
                canvas.draw_rect(Rect::from_wh(width as f32, height as f32), &paint);
            }
        }
        _ => {}
    }
}

/// Apply feMerge to a canvas: merge multiple inputs by drawing them in order
fn apply_merge_to_canvas(canvas: &sk::Canvas, inputs: &[Image], width: i32, height: i32) {
    if inputs.is_empty() {
        return;
    }

    let mut paint = Paint::default();
    paint.set_anti_alias(true);

    // Draw all inputs in order (each on top of the previous)
    for input in inputs {
        // Resize input if needed to match surface size
        if input.width() == width && input.height() == height {
            canvas.draw_image(input, (0, 0), Some(&paint));
        } else {
            // Scale to fit if sizes don't match
            let scale_x = width as f32 / input.width() as f32;
            let scale_y = height as f32 / input.height() as f32;
            canvas.save();
            canvas.scale((scale_x, scale_y));
            canvas.draw_image(input, (0, 0), Some(&paint));
            canvas.restore();
        }
    }
}

// ----------------------------------------------------------------------------
// Pipeline Creation
// ----------------------------------------------------------------------------

/// Create filter pipelines by dynamically reading SVG filter definitions from the usvg tree
///
/// For each `<filter>` in the SVG, we build a `FilterPipeline` by walking its primitives
/// and mapping supported kinds into our Skia-backed `FilterPrimitive` variants.
fn create_filter_pipelines(tree: &Tree) -> std::collections::HashMap<String, FilterPipeline> {
    use usvg::filter::{ColorMatrixKind, Kind};

    let mut filters = std::collections::HashMap::new();

    for filter in tree.filters() {
        let mut pipeline = FilterPipeline::new();

        for primitive in filter.primitives() {
            let kind = primitive.kind();
            let result_name = if primitive.result().is_empty() {
                None
            } else {
                Some(primitive.result().to_string())
            };

            // Get primitive region (filter subregion) for primitives that need explicit size
            let primitive_rect = {
                let rect = primitive.rect();
                Some((rect.x(), rect.y(), rect.width(), rect.height()))
            };

            match kind {
                Kind::GaussianBlur(gauss) => {
                    pipeline.add_primitive(
                        FilterPrimitive::GaussianBlur {
                            std_deviation_x: gauss.std_dev_x().get(),
                            std_deviation_y: gauss.std_dev_y().get(),
                        },
                        input_to_name(gauss.input()),
                        None,
                        result_name,
                        None, // GaussianBlur doesn't need primitive region
                    );
                }

                Kind::ColorMatrix(cm) => {
                    let matrix_type = match cm.kind() {
                        ColorMatrixKind::Matrix(values) => {
                            if values.len() == 20 {
                                let mut matrix = [0.0f32; 20];
                                matrix.copy_from_slice(&values[..20]);
                                Some(ColorMatrixType::Matrix(matrix))
                            } else {
                                None
                            }
                        }
                        ColorMatrixKind::Saturate(s) => Some(ColorMatrixType::Saturate(s.get())),
                        ColorMatrixKind::HueRotate(angle) => {
                            Some(ColorMatrixType::HueRotate(*angle))
                        }
                        ColorMatrixKind::LuminanceToAlpha => {
                            Some(ColorMatrixType::LuminanceToAlpha)
                        }
                    };

                    if let Some(kind) = matrix_type {
                        pipeline.add_primitive(
                            FilterPrimitive::ColorMatrix { kind },
                            input_to_name(cm.input()),
                            None,
                            result_name,
                            None,
                        );
                    }
                }

                Kind::Offset(off) => {
                    pipeline.add_primitive(
                        FilterPrimitive::Offset {
                            dx: off.dx(),
                            dy: off.dy(),
                        },
                        input_to_name(off.input()),
                        None,
                        result_name,
                        None,
                    );
                }

                Kind::Morphology(morph) => {
                    let op = match morph.operator() {
                        usvg::filter::MorphologyOperator::Dilate => MorphologyOperator::Dilate,
                        usvg::filter::MorphologyOperator::Erode => MorphologyOperator::Erode,
                    };

                    pipeline.add_primitive(
                        FilterPrimitive::Morphology {
                            operator: op,
                            radius_x: morph.radius_x().get(),
                            radius_y: morph.radius_y().get(),
                        },
                        input_to_name(morph.input()),
                        None,
                        result_name,
                        None,
                    );
                }

                Kind::DropShadow(ds) => {
                    let sk_color = usvg_color_to_skia(ds.color(), ds.opacity().get());

                    pipeline.add_primitive(
                        FilterPrimitive::DropShadow {
                            dx: ds.dx(),
                            dy: ds.dy(),
                            std_deviation_x: ds.std_dev_x().get(),
                            std_deviation_y: ds.std_dev_y().get(),
                            color: sk_color,
                        },
                        input_to_name(ds.input()),
                        None,
                        result_name,
                        None,
                    );
                }

                Kind::Flood(flood) => {
                    let usvg_color = flood.color();
                    let opacity = flood.opacity().get();
                    let sk_color = usvg_color_to_skia(usvg_color, opacity);

                    pipeline.add_primitive(
                        FilterPrimitive::Flood { color: sk_color },
                        None,
                        None,
                        result_name,
                        primitive_rect, // Flood needs the primitive region size
                    );
                }

                Kind::Blend(blend) => {
                    let mode = match blend.mode() {
                        usvg::BlendMode::Normal => SkBlendMode::SrcOver,
                        usvg::BlendMode::Multiply => SkBlendMode::Multiply,
                        usvg::BlendMode::Screen => SkBlendMode::Screen,
                        usvg::BlendMode::Darken => SkBlendMode::Darken,
                        usvg::BlendMode::Lighten => SkBlendMode::Lighten,
                        _ => SkBlendMode::SrcOver,
                    };

                    pipeline.add_primitive(
                        FilterPrimitive::Blend { mode },
                        input_to_name(blend.input1()),
                        input_to_name(blend.input2()),
                        result_name,
                        None,
                    );
                }

                Kind::Composite(comp) => {
                    let op = match comp.operator() {
                        usvg::filter::CompositeOperator::Over => CompositeOperator::Over,
                        usvg::filter::CompositeOperator::In => CompositeOperator::In,
                        usvg::filter::CompositeOperator::Out => CompositeOperator::Out,
                        usvg::filter::CompositeOperator::Atop => CompositeOperator::Atop,
                        usvg::filter::CompositeOperator::Xor => CompositeOperator::Xor,
                        usvg::filter::CompositeOperator::Arithmetic { k1, k2, k3, k4 } => {
                            CompositeOperator::Arithmetic {
                                k1: k1,
                                k2: k2,
                                k3: k3,
                                k4: k4,
                            }
                        }
                    };

                    pipeline.add_primitive(
                        FilterPrimitive::Composite { operator: op },
                        input_to_name(comp.input1()),
                        input_to_name(comp.input2()),
                        result_name,
                        None,
                    );
                }

                Kind::Merge(merge) => {
                    let inputs: Vec<String> =
                        merge.inputs().iter().filter_map(input_to_name).collect();

                    pipeline.add_primitive(
                        FilterPrimitive::Merge { inputs },
                        None,
                        None,
                        result_name,
                        None,
                    );
                }

                Kind::Turbulence(turb) => {
                    let base_freq_x = turb.base_frequency_x().get();
                    let base_freq_y = turb.base_frequency_y().get();
                    let num_octaves = turb.num_octaves() as u32;
                    let seed = turb.seed() as f32;
                    let stitch_tiles = turb.stitch_tiles();
                    let turbulence_type = match turb.kind() {
                        usvg::filter::TurbulenceKind::FractalNoise => TurbulenceType::FractalNoise,
                        usvg::filter::TurbulenceKind::Turbulence => TurbulenceType::Turbulence,
                    };

                    pipeline.add_primitive(
                        FilterPrimitive::Turbulence {
                            base_frequency_x: base_freq_x,
                            base_frequency_y: base_freq_y,
                            num_octaves,
                            seed,
                            stitch_tiles,
                            turbulence_type,
                        },
                        None, // Turbulence doesn't have an input
                        None,
                        result_name,
                        primitive_rect, // Turbulence also needs the primitive region size
                    );
                }

                Kind::DisplacementMap(dm) => {
                    let scale = dm.scale();
                    let x_channel = match dm.x_channel_selector() {
                        usvg::filter::ColorChannel::R => DisplacementChannel::R,
                        usvg::filter::ColorChannel::G => DisplacementChannel::G,
                        usvg::filter::ColorChannel::B => DisplacementChannel::B,
                        usvg::filter::ColorChannel::A => DisplacementChannel::A,
                    };
                    let y_channel = match dm.y_channel_selector() {
                        usvg::filter::ColorChannel::R => DisplacementChannel::R,
                        usvg::filter::ColorChannel::G => DisplacementChannel::G,
                        usvg::filter::ColorChannel::B => DisplacementChannel::B,
                        usvg::filter::ColorChannel::A => DisplacementChannel::A,
                    };

                    // feDisplacementMap uses 'in' for the source and 'in2' for the displacement map
                    pipeline.add_primitive(
                        FilterPrimitive::DisplacementMap {
                            scale,
                            x_channel,
                            y_channel,
                        },
                        input_to_name(dm.input1()), // 'in' - source image
                        input_to_name(dm.input2()), // 'in2' - displacement map
                        result_name,
                        None,
                    );
                }

                Kind::DiffuseLighting(dl) => {
                    let surface_scale = dl.surface_scale();
                    let diffuse_constant = dl.diffuse_constant();
                    let lighting_color = dl.lighting_color();
                    let sk_light_color = usvg_color_to_skia(lighting_color, 1.0);

                    // Parse light source from the lighting primitive
                    // usvg uses different enum variant names
                    let light = match dl.light_source() {
                        usvg::filter::LightSource::DistantLight(distant) => LightSource::Distant {
                            azimuth: distant.azimuth,
                            elevation: distant.elevation,
                        },
                        usvg::filter::LightSource::PointLight(point) => LightSource::Point {
                            x: point.x,
                            y: point.y,
                            z: point.z,
                        },
                        usvg::filter::LightSource::SpotLight(spot) => LightSource::Spot {
                            x: spot.x,
                            y: spot.y,
                            z: spot.z,
                            points_at_x: spot.points_at_x,
                            points_at_y: spot.points_at_y,
                            points_at_z: spot.points_at_z,
                            specular_exponent: spot.specular_exponent.get(),
                            limiting_cone_angle: spot.limiting_cone_angle.unwrap_or(90.0),
                        },
                    };

                    pipeline.add_primitive(
                        FilterPrimitive::DiffuseLighting {
                            surface_scale,
                            diffuse_constant,
                            light_color: sk_light_color,
                            light,
                        },
                        input_to_name(dl.input()),
                        None,
                        result_name,
                        None,
                    );
                }

                Kind::SpecularLighting(sl) => {
                    let surface_scale = sl.surface_scale();
                    let specular_constant = sl.specular_constant();
                    let specular_exponent = sl.specular_exponent();
                    let lighting_color = sl.lighting_color();
                    let sk_light_color = usvg_color_to_skia(lighting_color, 1.0);

                    // Parse light source from the lighting primitive
                    // usvg uses different enum variant names
                    let light = match sl.light_source() {
                        usvg::filter::LightSource::DistantLight(distant) => LightSource::Distant {
                            azimuth: distant.azimuth,
                            elevation: distant.elevation,
                        },
                        usvg::filter::LightSource::PointLight(point) => LightSource::Point {
                            x: point.x,
                            y: point.y,
                            z: point.z,
                        },
                        usvg::filter::LightSource::SpotLight(spot) => LightSource::Spot {
                            x: spot.x,
                            y: spot.y,
                            z: spot.z,
                            points_at_x: spot.points_at_x,
                            points_at_y: spot.points_at_y,
                            points_at_z: spot.points_at_z,
                            specular_exponent: spot.specular_exponent.get(),
                            limiting_cone_angle: spot.limiting_cone_angle.unwrap_or(90.0),
                        },
                    };

                    pipeline.add_primitive(
                        FilterPrimitive::SpecularLighting {
                            surface_scale,
                            specular_constant,
                            specular_exponent,
                            light_color: sk_light_color,
                            light,
                        },
                        input_to_name(sl.input()),
                        None,
                        result_name,
                        None,
                    );
                }

                Kind::ComponentTransfer(ct) => {
                    pipeline.add_primitive(
                        FilterPrimitive::ComponentTransfer {
                            func_r: ct.func_r().clone(),
                            func_g: ct.func_g().clone(),
                            func_b: ct.func_b().clone(),
                            func_a: ct.func_a().clone(),
                        },
                        input_to_name(ct.input()),
                        None,
                        result_name,
                        None, // ComponentTransfer doesn't need primitive_rect
                    );
                }

                Kind::ConvolveMatrix(cm) => {
                    let matrix = cm.matrix();
                    // Extract kernel matrix - note: reference accesses in reverse for correlation
                    // We'll store it in normal order and flip during application
                    let kernel_matrix: Vec<f32> = (0..matrix.rows())
                        .flat_map(|row| (0..matrix.columns()).map(move |col| matrix.get(col, row)))
                        .collect();

                    let edge_mode = match cm.edge_mode() {
                        usvg::filter::EdgeMode::None => EdgeMode::None,
                        usvg::filter::EdgeMode::Duplicate => EdgeMode::Duplicate,
                        usvg::filter::EdgeMode::Wrap => EdgeMode::Wrap,
                    };

                    pipeline.add_primitive(
                        FilterPrimitive::ConvolveMatrix {
                            kernel_matrix,
                            order_x: matrix.columns() as u32,
                            order_y: matrix.rows() as u32,
                            target_x: matrix.target_x() as u32,
                            target_y: matrix.target_y() as u32,
                            divisor: cm.divisor().get(),
                            bias: cm.bias(),
                            preserve_alpha: cm.preserve_alpha(),
                            edge_mode,
                        },
                        input_to_name(cm.input()),
                        None,
                        result_name,
                        None,
                    );
                }

                // Not yet mapped:
                // Image, Tile
                _ => {
                    // For unsupported primitives we simply skip them
                }
            }
        }

        filters.insert(filter.id().to_string(), pipeline);
    }

    filters
}

// ----------------------------------------------------------------------------
// Rendering
// ----------------------------------------------------------------------------

/// Render a usvg node to a Skia canvas
///
/// Filters are treated as a layer property - when a group has filters,
/// we render its children to a surface, apply the filter pipeline, then composite.
fn render_node_to_canvas(
    canvas: &sk::Canvas,
    node: &Node,
    filters: &std::collections::HashMap<String, FilterPipeline>,
) {
    match node {
        usvg::Node::Path(path) => {
            let tiny_path = path.data();
            let sk_path = tiny_path_to_skia_path(tiny_path);

            // Get path bounding box for gradient coordinate conversion
            let path_bounds = path.bounding_box();
            let bounds_size = (path_bounds.width(), path_bounds.height());

            let mut paint = Paint::default();
            paint.set_anti_alias(true);

            if let Some(fill) = path.fill() {
                match fill.paint() {
                    usvg::Paint::Color(color) => {
                        let opacity = (fill.opacity().get() * 255.0) as u8;
                        paint.set_color(Color::from_argb(
                            opacity,
                            color.red,
                            color.green,
                            color.blue,
                        ));
                        canvas.draw_path(&sk_path, &paint);
                    }
                    usvg::Paint::LinearGradient(gradient) => {
                        let linear_gradient = usvg_linear_gradient_to_linear_gradient_paint(
                            gradient.as_ref(),
                            bounds_size,
                        );
                        let mut gradient_paint =
                            linear_gradient_paint(&linear_gradient, bounds_size);
                        // Apply fill opacity
                        let fill_opacity = fill.opacity().get();
                        if fill_opacity < 1.0 {
                            gradient_paint.set_alpha_f(fill_opacity);
                        }
                        canvas.draw_path(&sk_path, &gradient_paint);
                    }
                    _ => {
                        // Radial gradients and patterns not yet supported
                    }
                }
            }

            if let Some(stroke) = path.stroke() {
                match stroke.paint() {
                    usvg::Paint::Color(color) => {
                        let opacity = (stroke.opacity().get() * 255.0) as u8;
                        paint.set_color(Color::from_argb(
                            opacity,
                            color.red,
                            color.green,
                            color.blue,
                        ));
                        paint.set_stroke_width(stroke.width().get());
                        paint.set_style(sk::PaintStyle::Stroke);
                        canvas.draw_path(&sk_path, &paint);
                    }
                    usvg::Paint::LinearGradient(gradient) => {
                        let linear_gradient = usvg_linear_gradient_to_linear_gradient_paint(
                            gradient.as_ref(),
                            bounds_size,
                        );
                        let mut gradient_paint =
                            linear_gradient_paint(&linear_gradient, bounds_size);
                        // Apply stroke opacity
                        let stroke_opacity = stroke.opacity().get();
                        if stroke_opacity < 1.0 {
                            gradient_paint.set_alpha_f(stroke_opacity);
                        }
                        gradient_paint.set_stroke_width(stroke.width().get());
                        gradient_paint.set_style(sk::PaintStyle::Stroke);
                        canvas.draw_path(&sk_path, &gradient_paint);
                    }
                    _ => {
                        // Radial gradients and patterns not yet supported
                    }
                }
            }
        }

        usvg::Node::Group(group) => {
            // Check if this group has filters - filters are a layer property
            let filter_id = group.filters().first().map(|f| f.id().to_string());

            if let Some(filter_id) = filter_id {
                // Group has filters - render children to surface, apply filter, then composite
                render_filtered_group(canvas, group, &filter_id, filters);
            } else {
                // No filters - render normally with save/restore (usvg tree alignment)
                render_unfiltered_group(canvas, group, filters);
            }
        }

        usvg::Node::Text(text) => {
            // Convert text to paths (glyphs) using usvg's flattened method
            // This returns a Group containing the text as paths
            let flattened = text.flattened();
            // Render the flattened group (which contains path nodes for each glyph)
            render_unfiltered_group(canvas, &flattened, filters);
        }

        _ => {}
    }
}

/// Render a group with filters applied
fn render_filtered_group(
    canvas: &sk::Canvas,
    group: &usvg::Group,
    filter_id: &str,
    filters: &std::collections::HashMap<String, FilterPipeline>,
) {
    // Use layer_bounding_box (object coordinates) for surface size
    // Path data from usvg includes the position (x, y baked into path)
    // Note: layer_bounds may be expanded due to filter region (default -10% to 110%)
    let layer_bounds = group.layer_bounding_box();

    let (w, h) = (
        layer_bounds.width().ceil() as i32,
        layer_bounds.height().ceil() as i32,
    );

    if w <= 0 || h <= 0 {
        return;
    }

    // Render group's children to an intermediate surface (object coordinates)
    let mut group_surface = surfaces::raster_n32_premul((w, h)).expect("create surface");
    let group_canvas = group_surface.canvas();
    group_canvas.clear(Color::TRANSPARENT);

    // Render children in object coordinates
    // Translate to move the filter region origin to (0, 0) in the surface
    // The path data is at its natural position (e.g., 10, 10), and layer_bounds
    // includes the filter region expansion (e.g., -6, -6), so we translate by
    // -layer_bounds.left() to align the filter region with the surface origin
    group_canvas.save();
    group_canvas.translate((-layer_bounds.left(), -layer_bounds.top()));

    // Render all children (path data already includes position in object coordinates)
    for child in group.children() {
        render_node_to_canvas(group_canvas, child, filters);
    }

    group_canvas.restore();
    let group_image = group_surface.image_snapshot();

    // Apply filter pipeline if available
    if let Some(pipeline) = filters.get(filter_id) {
        // Pass layer_bounds offset and transform so primitives can adjust their coordinates correctly
        // Note: We use layer_bounding_box() which includes the filter region expansion (-10% to 110%)
        // This matches what resvg uses for the filter region after transformation
        let layer_bounds_offset = (layer_bounds.left(), layer_bounds.top());
        let group_transform = group.transform();

        if let Some(filtered_image) =
            pipeline.apply(&group_image, layer_bounds_offset, group_transform)
        {
            // Apply group transform (consistent with render_unfiltered_group)
            canvas.save();
            let transform = group.transform();
            let matrix = Matrix::new_all(
                transform.sx as f32,
                transform.kx as f32,
                transform.tx as f32,
                transform.ky as f32,
                transform.sy as f32,
                transform.ty as f32,
                0.0,
                0.0,
                1.0,
            );
            canvas.concat(&matrix);

            // Draw the filtered result directly.
            // The filter pipeline handles geometry correctly through SourceGraphic
            // and composite operations (e.g., feComposite with arithmetic).
            // No explicit geometry masking is needed - filters like feGaussianBlur
            // and feFlood should extend beyond element bounds as per SVG spec.
            let mut paint = Paint::default();
            paint.set_blend_mode(SkBlendMode::SrcOver);
            canvas.draw_image(
                &filtered_image,
                (layer_bounds.left(), layer_bounds.top()),
                Some(&paint),
            );

            canvas.restore(); // Restore transform
            return;
        }
    }

    // Fallback: draw unfiltered if filter application failed
    canvas.save();
    let transform = group.transform();
    let matrix = Matrix::new_all(
        transform.sx as f32,
        transform.kx as f32,
        transform.tx as f32,
        transform.ky as f32,
        transform.sy as f32,
        transform.ty as f32,
        0.0,
        0.0,
        1.0,
    );
    canvas.concat(&matrix);
    // Draw at layer_bounds position (matching the offset we used when rendering to surface)
    canvas.draw_image(
        &group_image,
        (layer_bounds.left(), layer_bounds.top()),
        None,
    );
    canvas.restore();
}

/// Render a group without filters (normal rendering)
fn render_unfiltered_group(
    canvas: &sk::Canvas,
    group: &usvg::Group,
    filters: &std::collections::HashMap<String, FilterPipeline>,
) {
    canvas.save();
    let transform = group.transform();
    let matrix = Matrix::new_all(
        transform.sx as f32,
        transform.kx as f32,
        transform.tx as f32,
        transform.ky as f32,
        transform.sy as f32,
        transform.ty as f32,
        0.0,
        0.0,
        1.0,
    );
    canvas.concat(&matrix);

    for child in group.children() {
        render_node_to_canvas(canvas, child, filters);
    }

    canvas.restore();
}

/// Convert usvg linear gradient to LinearGradientPaint
fn usvg_linear_gradient_to_linear_gradient_paint(
    gradient: &usvg::LinearGradient,
    bounds: (f32, f32), // (width, height) of the object bounding box
) -> LinearGradientPaint {
    let (width, height) = bounds;

    // Heuristic: if coordinates are > 1.0, assume userSpaceOnUse and normalize
    // Otherwise, assume objectBoundingBox (already normalized 0-1)
    let (x1, y1, x2, y2) = {
        let gx1 = gradient.x1();
        let gy1 = gradient.y1();
        let gx2 = gradient.x2();
        let gy2 = gradient.y2();

        // Check if coordinates appear to be in user space (absolute) vs normalized
        if gx1 > 1.0 || gy1 > 1.0 || gx2 > 1.0 || gy2 > 1.0 {
            // UserSpaceOnUse: normalize by bounding box
            (gx1 / width, gy1 / height, gx2 / width, gy2 / height)
        } else {
            // ObjectBoundingBox: already normalized (0-1)
            (gx1, gy1, gx2, gy2)
        }
    };

    // Convert UV to Alignment (cNDC)
    let xy1 = Alignment::from_uv(Uv(x1, y1));
    let xy2 = Alignment::from_uv(Uv(x2, y2));

    // Convert stops
    let stops: Vec<GradientStop> = gradient
        .stops()
        .iter()
        .map(|stop| GradientStop {
            offset: stop.offset().get(),
            color: CGColor(
                stop.color().red,
                stop.color().green,
                stop.color().blue,
                (stop.opacity().get() * 255.0) as u8,
            ),
        })
        .collect();

    // Convert transform
    let transform = {
        let t = gradient.transform();
        AffineTransform::from_acebdf(
            t.sx as f32,
            t.kx as f32,
            t.tx as f32,
            t.ky as f32,
            t.sy as f32,
            t.ty as f32,
        )
    };

    // Convert spread method to tile mode (cg::cg::TileMode, not skia_safe::TileMode)
    let tile_mode = match gradient.spread_method() {
        usvg::SpreadMethod::Pad => cg::cg::TileMode::Clamp,
        usvg::SpreadMethod::Reflect => cg::cg::TileMode::Mirror,
        usvg::SpreadMethod::Repeat => cg::cg::TileMode::Repeated,
    };

    LinearGradientPaint {
        active: true,
        xy1,
        xy2,
        tile_mode,
        transform,
        stops,
        opacity: 1.0,
        blend_mode: cg::cg::BlendMode::Normal,
    }
}

/// Convert a tiny_skia_path::Path to a Skia Path
fn tiny_path_to_skia_path(path: &TinyPath) -> SkPath {
    let mut sk_path = SkPath::new();
    for segment in path.segments() {
        match segment {
            PathSegment::MoveTo(p) => {
                sk_path.move_to((p.x, p.y));
            }
            PathSegment::LineTo(p) => {
                sk_path.line_to((p.x, p.y));
            }
            PathSegment::QuadTo(p0, p1) => {
                sk_path.quad_to((p0.x, p0.y), (p1.x, p1.y));
            }
            PathSegment::CubicTo(p0, p1, p2) => {
                sk_path.cubic_to((p0.x, p0.y), (p1.x, p1.y), (p2.x, p2.y));
            }
            PathSegment::Close => {
                sk_path.close();
            }
        }
    }
    sk_path
}

// ----------------------------------------------------------------------------
// Main Functions
// ----------------------------------------------------------------------------

fn process_svg_file(svg_path: &std::path::Path) -> Result<(), Box<dyn std::error::Error>> {
    // Read and parse SVG
    let svg_content = std::fs::read_to_string(svg_path)?;
    let file_size = std::fs::metadata(svg_path)?.len();
    println!("Processing: {} ({} bytes)", svg_path.display(), file_size);

    let mut options = Options::default();
    options.fontdb_mut().load_system_fonts();
    let tree = Tree::from_str(&svg_content, &options)
        .map_err(|e| format!("Failed to parse SVG: {}", e))?;

    // Create filter pipelines dynamically from the usvg tree
    let filters = create_filter_pipelines(&tree);

    // Create output surface
    let size = tree.size();
    let (w, h) = (size.width().ceil() as i32, size.height().ceil() as i32);
    let mut surface = surfaces::raster_n32_premul((w, h)).expect("create surface");
    let canvas = surface.canvas();
    canvas.clear(Color::TRANSPARENT);

    // Render the SVG tree
    // Filters are treated as a layer property - the rendering function
    // checks each group for filters and composites them automatically.
    // The usvg tree structure already aligns with rendering order (save/restore).
    for child in tree.root().children() {
        render_node_to_canvas(canvas, child, &filters);
    }

    // Save output
    let file_stem = svg_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");
    let output_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("goldens")
        .join(format!("sk_svg_{}.png", file_stem));

    let image = surface.image_snapshot();
    let data = image
        .encode(None, sk::EncodedImageFormat::PNG, None)
        .expect("encode");
    std::fs::write(&output_path, data.as_bytes())?;

    println!(
        "  → Rendered to: {} ({} bytes)",
        output_path.display(),
        data.as_bytes().len()
    );
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();

    if args.len() > 1 {
        // Process single file
        let svg_path = std::path::Path::new(&args[1]);
        process_svg_file(svg_path)?;
    } else {
        // Process all filter SVG files in L0 directory
        let l0_dir =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/test-svg/L0");

        println!("Processing filter SVG files from: {}", l0_dir.display());
        println!();

        let mut processed = 0;
        for entry in std::fs::read_dir(&l0_dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.extension().and_then(|s| s.to_str()) == Some("svg") {
                if path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .map(|s| s.starts_with("filters-"))
                    .unwrap_or(false)
                {
                    process_svg_file(&path)?;
                    processed += 1;
                    println!();
                }
            }
        }

        if processed == 0 {
            println!("No filter SVG files found in {}", l0_dir.display());
            println!("Usage: cargo run --example golden_sk_svg_filters [path-to-svg-file]");
        } else {
            println!("Processed {} filter SVG file(s)", processed);
        }
    }

    Ok(())
}
