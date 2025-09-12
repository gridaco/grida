//! # Paragraph Cache
//!
//! High-performance cache for text layout and rendering operations.
//!
//! ## Design Philosophy
//!
//! Separates **geometry measurement** from **rendering** to optimize for distinct use cases:
//! - **Measurement**: Fast, cacheable, paint-independent operations for geometry calculations
//! - **Rendering**: Paint-aware operations optimized for actual text drawing
//!
//! ### Why This Separation?
//!
//! 1. **Skia Limitations**: Skia paragraphs cannot be cloned or have their paint modified after creation.
//!    For shader paints (gradients, images), the measured size is required, so measurement must happen first.
//!
//! 2. **Performance Optimization**: While we could use glyph iteration (`visit()`) to apply custom paints,
//!    this is actually more expensive than re-creating the paragraph with paint applied, allowing us to
//!    leverage Skia's optimized single-command rendering.
//!
//! 3. **Future-Proof Design**: This separation provides a clean API foundation. While we currently use
//!    separate caching for measurement and painting, this design allows for future optimizations and
//!    more performant solutions as the codebase evolves.
//!
//! ## Key Features
//!
//! - **Content-based caching**: Uses text content hash as key, not NodeId (prevents memory leaks)
//! - **Layout result caching**: Caches layout measurements by width to avoid redundant layout calls
//! - **Paint strategy optimization**: Chooses between re-creation vs visit() based on paint complexity
//! - **Font generation tracking**: Invalidates cache when fonts change
//!
//! ## Usage Patterns
//!
//! ### For Geometry/Measurement
//! ```rust
//! # use cg::cache::paragraph::ParagraphCache;
//! # use cg::cg::types::*;
//! # use cg::runtime::repository::FontRepository;
//! # let mut cache = ParagraphCache::new();
//! # let text = "Hello World";
//! # let style = TextStyleRec::from_font("Arial", 16.0);
//! # let align = TextAlign::Left;
//! # let max_lines = None;
//! # let ellipsis = None;
//! # let width = Some(100.0);
//! # let fonts = FontRepository::new();
//! let measurements = cache.measure(text, &style, &align, &max_lines, &ellipsis, width, &fonts, None);
//! // Use measurements.max_width, measurements.height, etc.
//! ```
//!
//! ### For Rendering
//! ```rust
//! # use cg::cache::paragraph::ParagraphCache;
//! # use cg::cg::types::*;
//! # use cg::runtime::repository::{FontRepository, ImageRepository};
//! # let mut cache = ParagraphCache::new();
//! # let text = "Hello World";
//! # let fills = &[Paint::Solid(CGColor::BLACK.into())];
//! # let align = TextAlign::Left;
//! # let style = TextStyleRec::from_font("Arial", 16.0);
//! # let max_lines = None;
//! # let ellipsis = None;
//! # let width = Some(100.0);
//! # let fonts = FontRepository::new();
//! # let images = ImageRepository::new();
//! let paragraph = cache.paragraph(text, fills, &align, &style, &max_lines, &ellipsis, width, &fonts, &images, None);
//! // paragraph.paint(canvas, point); // Use with actual canvas and point
//! ```

use crate::cg::types::*;
use crate::node::schema::NodeId;
use crate::painter::cvt;
use crate::runtime::repository::FontRepository;
use crate::text::text_style::textstyle;
use skia_safe::textlayout;
use std::cell::RefCell;
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::rc::Rc;

/// Identifies a paragraph cache entry by either NodeId or shape-based hash key.
///
/// This enum allows the paragraph cache to support two different caching strategies:
/// - `ById`: Direct lookup by node ID (primary usage for text nodes)
/// - `ByShapeKey`: Content-based lookup by hashed text properties (flexible usage)
#[derive(Clone, Debug)]
pub enum ParagraphIdentifier {
    /// Cache entry identified by node ID
    ById(NodeId),
    /// Cache entry identified by shape-based hash key
    ByShapeKey(u64),
}

/// Baseline information for a single line of text, used for overlay rendering.
///
/// This struct contains the geometric information needed to draw baseline paths
/// for text overlay features like hit testing and stroke visualization.
#[derive(Clone, Debug)]
pub struct BaselineInfo {
    /// Left edge of the line in text coordinates
    pub left: f32,
    /// Width of the line in text coordinates
    pub width: f32,
    /// Y position of the baseline in text coordinates
    pub baseline_y: f32,
}

/// Comprehensive layout measurements for a text paragraph.
///
/// This struct contains all available measurement results from the Skia Paragraph API,
/// providing complete geometric information for layout calculations and rendering.
#[derive(Clone, Debug)]
pub struct LayoutMeasurements {
    // Basic dimensions
    /// Total height of the paragraph
    pub height: f32,
    /// Maximum width used during layout
    pub max_width: f32,
    /// Minimum intrinsic width (tightest possible width)
    pub min_intrinsic_width: f32,
    /// Maximum intrinsic width (widest possible width)
    pub max_intrinsic_width: f32,

    // Baseline information
    /// Y position of the alphabetic baseline
    pub alphabetic_baseline: f32,
    /// Y position of the ideographic baseline
    pub ideographic_baseline: f32,

    // Line information
    /// Width of the longest line in the paragraph
    pub longest_line: f32,
    /// Total number of lines in the paragraph
    pub line_number: usize,
    /// Whether the paragraph exceeded the maximum line limit
    pub did_exceed_max_lines: bool,
}

/// A cached paragraph entry containing the paragraph object and metadata.
///
/// This struct stores a Skia paragraph along with its cache metadata, including
/// the content hash and font generation for cache invalidation.
#[derive(Clone, Debug)]
pub struct ParagraphCacheEntry {
    /// Content-based hash key for the paragraph
    pub hash: u64,
    /// Font generation at the time of caching (for invalidation)
    pub font_generation: usize,
    /// The cached Skia paragraph object
    pub paragraph: Rc<RefCell<textlayout::Paragraph>>,
    // TODO: Add width-based caching in the future
    // For now, we just store the paragraph and compute measurements on demand
}

#[derive(Default, Debug, Clone)]
pub struct ParagraphCache {
    // ID-based cache for text nodes (primary usage)
    entries_measurement_by_id: HashMap<NodeId, ParagraphCacheEntry>,
    // Shape-key-based cache for flexible usage (not currently used)
    entries_measurement_by_shapekey_unstable: HashMap<u64, ParagraphCacheEntry>,
}

impl ParagraphCache {
    pub fn new() -> Self {
        Self {
            entries_measurement_by_id: HashMap::new(),
            entries_measurement_by_shapekey_unstable: HashMap::new(),
        }
    }

    /// Generate cache key for geometry-only properties
    /// Excludes paint-related properties that don't affect layout
    fn shape_key(
        text: &str,
        style: &TextStyleRec,
        align: &TextAlign,
        max_lines: &Option<usize>,
    ) -> u64 {
        let mut h = DefaultHasher::new();
        text.hash(&mut h);
        style.font_family.hash(&mut h);
        style.font_size.to_bits().hash(&mut h);
        style.font_weight.0.hash(&mut h);
        style.font_style_italic.hash(&mut h);
        // TODO: Add letter_spacing and line_height to hash
        // style.letter_spacing.0.to_bits().hash(&mut h);
        // style.line_height.map(|v| v.to_bits()).hash(&mut h);
        style.text_transform.hash(&mut h);
        (*align as u8).hash(&mut h);
        max_lines.hash(&mut h);
        h.finish()
    }

    /// Get or create paragraph for measurement only
    /// Returns final measured metrics for the given width
    /// If id is provided, uses ID-based caching; otherwise uses shape-key-based caching
    pub fn measure(
        &mut self,
        text: &str,
        style: &TextStyleRec,
        align: &TextAlign,
        max_lines: &Option<usize>,
        ellipsis: &Option<String>,
        width: Option<f32>,
        fonts: &FontRepository,
        id: Option<&NodeId>,
    ) -> LayoutMeasurements {
        let fonts_gen = fonts.generation();

        // Check if we have a cached paragraph
        if let Some(node_id) = id {
            // Use ID-based cache
            if let Some(entry) = self.entries_measurement_by_id.get(node_id) {
                if entry.font_generation == fonts_gen {
                    // Use the cached paragraph and compute measurements
                    let paragraph_rc = entry.paragraph.clone();
                    return Self::compute_measurements(paragraph_rc, width);
                }
            }
        } else {
            // Use shape-key-based cache
            let hash = Self::shape_key(text, style, align, max_lines);
            if let Some(entry) = self.entries_measurement_by_shapekey_unstable.get(&hash) {
                if entry.font_generation == fonts_gen {
                    // Use the cached paragraph and compute measurements
                    let paragraph_rc = entry.paragraph.clone();
                    return Self::compute_measurements(paragraph_rc, width);
                }
            }
        }

        // Build the paragraph (expensive operation) - no paint for measurement
        let mut paragraph_style = textlayout::ParagraphStyle::new();
        paragraph_style.set_text_direction(textlayout::TextDirection::LTR);
        paragraph_style.set_text_align(align.clone().into());
        // Disable Skia's rounding hack to prevent fractional width truncation
        paragraph_style.set_apply_rounding_hack(false);

        // Set max lines if specified
        if let Some(max_lines) = max_lines {
            paragraph_style.set_max_lines(*max_lines);
            paragraph_style.set_ellipsis(ellipsis.as_ref().unwrap_or(&"...".to_string()));
        }

        let ctx = TextStyleRecBuildContext {
            color: CGColor::TRANSPARENT, // No color for measurement
            user_fallback_fonts: fonts.user_fallback_families(),
        };
        let mut para_builder =
            textlayout::ParagraphBuilder::new(&paragraph_style, fonts.font_collection());
        let ts = textstyle(style, &Some(ctx));
        // No paint for measurement
        para_builder.push_style(&ts);
        let transformed_text =
            crate::text::text_transform::transform_text(text, style.text_transform);
        para_builder.add_text(&transformed_text);
        let paragraph: skia_safe::textlayout::Paragraph = para_builder.build();
        para_builder.pop();

        // Store the paragraph for future use
        let paragraph_rc = Rc::new(RefCell::new(paragraph));

        let entry = ParagraphCacheEntry {
            hash: Self::shape_key(text, style, align, max_lines),
            font_generation: fonts_gen,
            paragraph: paragraph_rc.clone(),
        };

        // Store in the appropriate cache
        if let Some(node_id) = id {
            self.entries_measurement_by_id
                .insert(node_id.clone(), entry);
        } else {
            self.entries_measurement_by_shapekey_unstable
                .insert(entry.hash, entry);
        }

        // Compute and return the measurements
        Self::compute_measurements(paragraph_rc, width)
    }

    /// Helper method to compute measurements for a given paragraph and width
    fn compute_measurements(
        paragraph_rc: Rc<RefCell<textlayout::Paragraph>>,
        width: Option<f32>,
    ) -> LayoutMeasurements {
        // Calculate the final layout width
        let layout_width = if let Some(width) = width {
            width
        } else {
            // For intrinsic sizing, layout with infinity first to measure
            let mut para_ref = paragraph_rc.borrow_mut();
            para_ref.layout(f32::INFINITY);
            let intrinsic_width = para_ref.max_intrinsic_width();

            // Re-layout with the intrinsic width
            para_ref.layout(intrinsic_width);
            intrinsic_width
        };

        // Apply final layout with the determined width
        {
            let mut para_ref = paragraph_rc.borrow_mut();
            para_ref.layout(layout_width);
        }

        // Get all available measurement results
        let para_ref = paragraph_rc.borrow();

        LayoutMeasurements {
            // Basic dimensions
            height: para_ref.height(),
            max_width: para_ref.max_width(),
            min_intrinsic_width: para_ref.min_intrinsic_width(),
            max_intrinsic_width: para_ref.max_intrinsic_width(),

            // Baseline information
            alphabetic_baseline: para_ref.alphabetic_baseline(),
            ideographic_baseline: para_ref.ideographic_baseline(),

            // Line information
            longest_line: para_ref.longest_line(),
            line_number: para_ref.line_number(),
            did_exceed_max_lines: para_ref.did_exceed_max_lines(),
        }
    }

    /// Get or create paragraph for rendering with fill paint applied.
    ///
    /// This method handles all fill paint types (solid, gradient, image, multiple fills) using `cvt::sk_paint_stack`.
    /// The returned paragraph is ready for rendering with `paragraph.paint(canvas, point)`.
    ///
    /// # Stroke Paint Limitation
    ///
    /// **This method does NOT handle stroke paint.** Skia paragraphs cannot hold stroke paint with stroke alignment
    /// (inside, center, outside). Stroke rendering must be handled externally by:
    /// 1. Getting the text path from the paragraph
    /// 2. Applying stroke paint with the appropriate stroke alignment
    /// 3. Drawing the stroked path separately
    ///
    /// # Parameters
    ///
    /// - `text`: The text content to render
    /// - `fills`: Fill paints to apply (solid, gradient, image, etc.)
    /// - `align`: Text alignment
    /// - `style`: Text style properties
    /// - `max_lines`: Maximum number of lines (optional)
    /// - `ellipsis`: Ellipsis string for overflow (optional)
    /// - `width`: Layout width (optional, uses intrinsic width if None)
    /// - `fonts`: Font repository for text shaping
    /// - `images`: Image repository for image fills
    /// - `id`: Node ID for caching (optional, uses shape-key caching if None)
    ///
    /// # Returns
    ///
    /// A `Rc<RefCell<textlayout::Paragraph>>` ready for rendering with fill paint applied.
    pub fn paragraph(
        &mut self,
        text: &str,
        fills: &[Paint],
        align: &TextAlign,
        style: &TextStyleRec,
        max_lines: &Option<usize>,
        ellipsis: &Option<String>,
        width: Option<f32>,
        fonts: &FontRepository,
        images: &crate::runtime::repository::ImageRepository,
        id: Option<&NodeId>,
    ) -> Rc<RefCell<textlayout::Paragraph>> {
        let _fonts_gen = fonts.generation();
        let _hash = Self::shape_key(text, style, align, max_lines);

        // First, get the layout measurements to determine the size for paint
        let measurements = self.measure(text, style, align, max_lines, ellipsis, width, fonts, id);
        let layout_size = (measurements.max_width, measurements.height);

        // Build the paragraph with paint applied (for rendering)
        let fill_paint = if !fills.is_empty() {
            // Use sk_paint_stack for all paint types (solid, gradient, image, multiple fills)
            cvt::sk_paint_stack(fills, 1.0, layout_size, images)
        } else {
            None
        };

        let mut paragraph_style = textlayout::ParagraphStyle::new();
        paragraph_style.set_text_direction(textlayout::TextDirection::LTR);
        paragraph_style.set_text_align(align.clone().into());
        paragraph_style.set_apply_rounding_hack(false);

        if let Some(max_lines) = max_lines {
            paragraph_style.set_max_lines(*max_lines);
            paragraph_style.set_ellipsis(ellipsis.as_ref().unwrap_or(&"...".to_string()));
        }

        let ctx = TextStyleRecBuildContext {
            color: fills
                .first()
                .and_then(|f| f.solid_color())
                .unwrap_or(CGColor::TRANSPARENT),
            user_fallback_fonts: fonts.user_fallback_families(),
        };
        let mut para_builder =
            textlayout::ParagraphBuilder::new(&paragraph_style, fonts.font_collection());
        let mut ts = textstyle(style, &Some(ctx));
        if let Some(ref paint) = fill_paint {
            ts.set_foreground_paint(paint);
        }
        para_builder.push_style(&ts);
        let transformed_text =
            crate::text::text_transform::transform_text(text, style.text_transform);
        para_builder.add_text(&transformed_text);
        let paragraph: skia_safe::textlayout::Paragraph = para_builder.build();
        para_builder.pop();

        let paragraph_rc = Rc::new(RefCell::new(paragraph));

        // Apply layout with the determined width
        let layout_width = width.unwrap_or(measurements.max_intrinsic_width);
        paragraph_rc.borrow_mut().layout(layout_width);

        paragraph_rc
    }

    /// Get baseline information for overlay purposes, only if paragraph is already cached by ID
    /// Returns None if paragraph is not in cache (respects "don't create new" requirement)
    pub fn get_baseline_info_if_cached_by_id(
        &self,
        id: &NodeId,
        width: Option<f32>,
    ) -> Option<(Vec<BaselineInfo>, f32)> {
        // Check if we have a cached paragraph by ID
        if let Some(entry) = self.entries_measurement_by_id.get(id) {
            let paragraph_rc = &entry.paragraph;

            // Apply layout if width is specified
            {
                let mut paragraph_ref = paragraph_rc.borrow_mut();

                // Apply layout if width is specified
                if let Some(w) = width {
                    paragraph_ref.layout(w);
                }
            }

            // Collect baseline info and layout height in a separate scope to avoid borrowing issues
            let (layout_height, baseline_info) = {
                let paragraph_ref = paragraph_rc.borrow();
                let lines = paragraph_ref.line_number();
                let mut baseline_info = Vec::new();
                for i in 0..lines {
                    if let Some(metrics) = paragraph_ref.get_line_metrics_at(i) {
                        baseline_info.push(BaselineInfo {
                            left: metrics.left as f32,
                            width: metrics.width as f32,
                            baseline_y: metrics.baseline as f32,
                        });
                    }
                }
                (paragraph_ref.height(), baseline_info)
            };
            return Some((baseline_info, layout_height));
        }

        None
    }

    pub fn invalidate(&mut self) {
        self.entries_measurement_by_id.clear();
        self.entries_measurement_by_shapekey_unstable.clear();
    }

    pub fn len(&self) -> usize {
        self.entries_measurement_by_id.len() + self.entries_measurement_by_shapekey_unstable.len()
    }
}
