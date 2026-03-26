//! Bidirectional conversion between `cg` canvas types and
//! `grida_text_edit::attributed_text` types.
//!
//! The two type systems are structurally aligned by design (see
//! `docs/wg/feat-text-editing/attributed-text.md`). This module provides
//! lossless `From`/`Into` implementations so the canvas can construct
//! `AttributedText` from its `TextSpanNodeRec` and vice-versa.

use crate::cg::types::{
    AttributedString as CgAttributedString, FontFeature as CgFontFeature,
    FontOpticalSizing as CgFontOpticalSizing, FontVariation as CgFontVariation, FontWeight, Paint,
    StyledTextRun as CgStyledTextRun, TextDecorationLine as CgTextDecorationLine,
    TextDecorationRec, TextDecorationStyle as CgTextDecorationStyle, TextLetterSpacing,
    TextLineHeight, TextStyleRec, TextTransform as CgTextTransform, TextWordSpacing,
};

use grida_text_edit::attributed_text::{
    AttributedText, FontFeature as AttrFontFeature, FontOpticalSizing as AttrFontOpticalSizing,
    FontVariation as AttrFontVariation, StyledRun as AttrStyledRun,
    TextDecorationLine as AttrTextDecorationLine, TextDecorationStyle as AttrTextDecorationStyle,
    TextDimension, TextFill, TextStyle, TextTransform as AttrTextTransform, RGBA,
};

// ---------------------------------------------------------------------------
// TextTransform
// ---------------------------------------------------------------------------

impl From<CgTextTransform> for AttrTextTransform {
    fn from(v: CgTextTransform) -> Self {
        match v {
            CgTextTransform::None => AttrTextTransform::None,
            CgTextTransform::Uppercase => AttrTextTransform::Uppercase,
            CgTextTransform::Lowercase => AttrTextTransform::Lowercase,
            CgTextTransform::Capitalize => AttrTextTransform::Capitalize,
        }
    }
}

impl From<AttrTextTransform> for CgTextTransform {
    fn from(v: AttrTextTransform) -> Self {
        match v {
            AttrTextTransform::None => CgTextTransform::None,
            AttrTextTransform::Uppercase => CgTextTransform::Uppercase,
            AttrTextTransform::Lowercase => CgTextTransform::Lowercase,
            AttrTextTransform::Capitalize => CgTextTransform::Capitalize,
        }
    }
}

// ---------------------------------------------------------------------------
// TextDecorationLine
// ---------------------------------------------------------------------------

impl From<CgTextDecorationLine> for AttrTextDecorationLine {
    fn from(v: CgTextDecorationLine) -> Self {
        match v {
            CgTextDecorationLine::None => AttrTextDecorationLine::None,
            CgTextDecorationLine::Underline => AttrTextDecorationLine::Underline,
            CgTextDecorationLine::Overline => AttrTextDecorationLine::Overline,
            CgTextDecorationLine::LineThrough => AttrTextDecorationLine::LineThrough,
        }
    }
}

impl From<AttrTextDecorationLine> for CgTextDecorationLine {
    fn from(v: AttrTextDecorationLine) -> Self {
        match v {
            AttrTextDecorationLine::None => CgTextDecorationLine::None,
            AttrTextDecorationLine::Underline => CgTextDecorationLine::Underline,
            AttrTextDecorationLine::Overline => CgTextDecorationLine::Overline,
            AttrTextDecorationLine::LineThrough => CgTextDecorationLine::LineThrough,
        }
    }
}

// ---------------------------------------------------------------------------
// TextDecorationStyle
// ---------------------------------------------------------------------------

impl From<CgTextDecorationStyle> for AttrTextDecorationStyle {
    fn from(v: CgTextDecorationStyle) -> Self {
        match v {
            CgTextDecorationStyle::Solid => AttrTextDecorationStyle::Solid,
            CgTextDecorationStyle::Double => AttrTextDecorationStyle::Double,
            CgTextDecorationStyle::Dotted => AttrTextDecorationStyle::Dotted,
            CgTextDecorationStyle::Dashed => AttrTextDecorationStyle::Dashed,
            CgTextDecorationStyle::Wavy => AttrTextDecorationStyle::Wavy,
        }
    }
}

impl From<AttrTextDecorationStyle> for CgTextDecorationStyle {
    fn from(v: AttrTextDecorationStyle) -> Self {
        match v {
            AttrTextDecorationStyle::Solid => CgTextDecorationStyle::Solid,
            AttrTextDecorationStyle::Double => CgTextDecorationStyle::Double,
            AttrTextDecorationStyle::Dotted => CgTextDecorationStyle::Dotted,
            AttrTextDecorationStyle::Dashed => CgTextDecorationStyle::Dashed,
            AttrTextDecorationStyle::Wavy => CgTextDecorationStyle::Wavy,
        }
    }
}

// ---------------------------------------------------------------------------
// FontOpticalSizing
// ---------------------------------------------------------------------------

impl From<CgFontOpticalSizing> for AttrFontOpticalSizing {
    fn from(v: CgFontOpticalSizing) -> Self {
        match v {
            CgFontOpticalSizing::Auto => AttrFontOpticalSizing::Auto,
            CgFontOpticalSizing::None => AttrFontOpticalSizing::None,
            CgFontOpticalSizing::Fixed(f) => AttrFontOpticalSizing::Fixed(f),
        }
    }
}

impl From<AttrFontOpticalSizing> for CgFontOpticalSizing {
    fn from(v: AttrFontOpticalSizing) -> Self {
        match v {
            AttrFontOpticalSizing::Auto => CgFontOpticalSizing::Auto,
            AttrFontOpticalSizing::None => CgFontOpticalSizing::None,
            AttrFontOpticalSizing::Fixed(f) => CgFontOpticalSizing::Fixed(f),
        }
    }
}

// ---------------------------------------------------------------------------
// FontFeature
// ---------------------------------------------------------------------------

impl From<CgFontFeature> for AttrFontFeature {
    fn from(v: CgFontFeature) -> Self {
        AttrFontFeature {
            tag: v.tag,
            value: v.value,
        }
    }
}

impl From<AttrFontFeature> for CgFontFeature {
    fn from(v: AttrFontFeature) -> Self {
        CgFontFeature {
            tag: v.tag,
            value: v.value,
        }
    }
}

// ---------------------------------------------------------------------------
// FontVariation
// ---------------------------------------------------------------------------

impl From<CgFontVariation> for AttrFontVariation {
    fn from(v: CgFontVariation) -> Self {
        AttrFontVariation {
            axis: v.axis,
            value: v.value,
        }
    }
}

impl From<AttrFontVariation> for CgFontVariation {
    fn from(v: AttrFontVariation) -> Self {
        CgFontVariation {
            axis: v.axis,
            value: v.value,
        }
    }
}

// ---------------------------------------------------------------------------
// Spacing / dimension types
//
// cg uses separate enums per dimension; attributed_text uses a unified
// `TextDimension` enum. The mapping is straightforward.
// ---------------------------------------------------------------------------

impl From<TextLetterSpacing> for TextDimension {
    fn from(v: TextLetterSpacing) -> Self {
        match v {
            TextLetterSpacing::Fixed(f) => TextDimension::Fixed(f),
            TextLetterSpacing::Factor(f) => TextDimension::Factor(f),
        }
    }
}

impl From<TextWordSpacing> for TextDimension {
    fn from(v: TextWordSpacing) -> Self {
        match v {
            TextWordSpacing::Fixed(f) => TextDimension::Fixed(f),
            TextWordSpacing::Factor(f) => TextDimension::Factor(f),
        }
    }
}

impl From<TextLineHeight> for TextDimension {
    fn from(v: TextLineHeight) -> Self {
        match v {
            TextLineHeight::Normal => TextDimension::Normal,
            TextLineHeight::Fixed(f) => TextDimension::Fixed(f),
            TextLineHeight::Factor(f) => TextDimension::Factor(f),
        }
    }
}

/// Convert `TextDimension` back to `TextLetterSpacing`.
///
/// `TextDimension::Normal` maps to `Fixed(0.0)` since `TextLetterSpacing`
/// has no `Normal` variant.
impl From<TextDimension> for TextLetterSpacing {
    fn from(v: TextDimension) -> Self {
        match v {
            TextDimension::Normal => TextLetterSpacing::Fixed(0.0),
            TextDimension::Fixed(f) => TextLetterSpacing::Fixed(f),
            TextDimension::Factor(f) => TextLetterSpacing::Factor(f),
        }
    }
}

/// Convert `TextDimension` back to `TextWordSpacing`.
///
/// `TextDimension::Normal` maps to `Fixed(0.0)`.
impl From<TextDimension> for TextWordSpacing {
    fn from(v: TextDimension) -> Self {
        match v {
            TextDimension::Normal => TextWordSpacing::Fixed(0.0),
            TextDimension::Fixed(f) => TextWordSpacing::Fixed(f),
            TextDimension::Factor(f) => TextWordSpacing::Factor(f),
        }
    }
}

impl From<TextDimension> for TextLineHeight {
    fn from(v: TextDimension) -> Self {
        match v {
            TextDimension::Normal => TextLineHeight::Normal,
            TextDimension::Fixed(f) => TextLineHeight::Fixed(f),
            TextDimension::Factor(f) => TextLineHeight::Factor(f),
        }
    }
}

// ---------------------------------------------------------------------------
// TextStyleRec <-> TextStyle (the main conversion)
// ---------------------------------------------------------------------------

/// Convert a `TextStyleRec` (canvas uniform style) into an attributed
/// `TextStyle`. The `fill` field defaults to solid black since
/// `TextStyleRec` does not carry fill — fills live on the node.
///
/// To provide a per-run fill, set the `fill` field on the returned
/// `TextStyle` after conversion, or use [`text_style_rec_to_attr_with_fill`].
impl From<&TextStyleRec> for TextStyle {
    fn from(rec: &TextStyleRec) -> Self {
        let (deco_line, deco_style, deco_color, deco_skip_ink, deco_thickness) =
            if let Some(ref d) = rec.text_decoration {
                (
                    d.text_decoration_line.into(),
                    d.text_decoration_style
                        .map(Into::into)
                        .unwrap_or(AttrTextDecorationStyle::Solid),
                    d.text_decoration_color.map(|c| RGBA {
                        r: c.r as f32 / 255.0,
                        g: c.g as f32 / 255.0,
                        b: c.b as f32 / 255.0,
                        a: c.a as f32 / 255.0,
                    }),
                    d.text_decoration_skip_ink.unwrap_or(true),
                    d.text_decoration_thickness.unwrap_or(1.0),
                )
            } else {
                (
                    AttrTextDecorationLine::None,
                    AttrTextDecorationStyle::Solid,
                    None,
                    true,
                    1.0,
                )
            };

        TextStyle {
            font_family: rec.font_family.clone(),
            font_size: rec.font_size,
            font_weight: rec.font_weight.0,
            font_width: rec.font_width.unwrap_or(100.0),
            font_style_italic: rec.font_style_italic,
            font_kerning: rec.font_kerning,
            font_optical_sizing: rec.font_optical_sizing.into(),
            font_features: rec
                .font_features
                .as_ref()
                .map(|v| v.iter().cloned().map(Into::into).collect())
                .unwrap_or_default(),
            font_variations: rec
                .font_variations
                .as_ref()
                .map(|v| v.iter().cloned().map(Into::into).collect())
                .unwrap_or_default(),
            letter_spacing: rec.letter_spacing.into(),
            word_spacing: rec.word_spacing.into(),
            line_height: rec.line_height.clone().into(),
            text_decoration_line: deco_line,
            text_decoration_style: deco_style,
            text_decoration_color: deco_color,
            text_decoration_skip_ink: deco_skip_ink,
            text_decoration_thickness: deco_thickness,
            text_transform: rec.text_transform.into(),
            fill: TextFill::default(), // caller must set from node fills
            hyperlink: None,
        }
    }
}

/// Convert an attributed `TextStyle` back into a canvas `TextStyleRec`.
///
/// The `fill` and `hyperlink` fields are discarded since `TextStyleRec`
/// does not carry them (fill lives on the node; hyperlink is not yet
/// supported in the canvas schema).
impl From<&TextStyle> for TextStyleRec {
    fn from(s: &TextStyle) -> Self {
        use crate::cg::color::CGColor;

        let text_decoration = if s.text_decoration_line == AttrTextDecorationLine::None {
            None
        } else {
            Some(TextDecorationRec {
                text_decoration_line: s.text_decoration_line.into(),
                text_decoration_style: Some(s.text_decoration_style.into()),
                text_decoration_color: s.text_decoration_color.map(|c| {
                    CGColor::from_rgba(
                        (c.r * 255.0) as u8,
                        (c.g * 255.0) as u8,
                        (c.b * 255.0) as u8,
                        (c.a * 255.0) as u8,
                    )
                }),
                text_decoration_skip_ink: Some(s.text_decoration_skip_ink),
                text_decoration_thickness: Some(s.text_decoration_thickness),
            })
        };

        TextStyleRec {
            text_decoration,
            font_family: s.font_family.clone(),
            font_size: s.font_size,
            font_weight: FontWeight(s.font_weight),
            font_width: if (s.font_width - 100.0).abs() < f32::EPSILON {
                None
            } else {
                Some(s.font_width)
            },
            font_style_italic: s.font_style_italic,
            font_kerning: s.font_kerning,
            font_optical_sizing: s.font_optical_sizing.into(),
            font_features: if s.font_features.is_empty() {
                None
            } else {
                Some(s.font_features.iter().cloned().map(Into::into).collect())
            },
            font_variations: if s.font_variations.is_empty() {
                None
            } else {
                Some(s.font_variations.iter().cloned().map(Into::into).collect())
            },
            letter_spacing: s.letter_spacing.into(),
            word_spacing: s.word_spacing.into(),
            line_height: s.line_height.into(),
            text_transform: s.text_transform.into(),
        }
    }
}

/// Convert a `TextStyleRec` to a `TextStyle` with an explicit fill color.
///
/// This is the preferred conversion when the node's fill paint is known
/// (e.g. the first active solid fill from the node's paint stack).
pub fn text_style_rec_to_attr_with_fill(rec: &TextStyleRec, fill: TextFill) -> TextStyle {
    let mut style: TextStyle = rec.into();
    style.fill = fill;
    style
}

// ---------------------------------------------------------------------------
// StyledTextRun <-> StyledRun
// ---------------------------------------------------------------------------

impl From<&CgStyledTextRun> for AttrStyledRun {
    fn from(run: &CgStyledTextRun) -> Self {
        let mut style: TextStyle = (&run.style).into();
        // Map per-run fills into the attributed TextStyle fill.
        // Only the first solid color is preserved — the attributed_text editor
        // model supports a single TextFill, not a full paint stack.
        if let Some(ref fills) = run.fills {
            if let Some(color) = fills.iter().find_map(|p| p.solid_color()) {
                style.fill = TextFill::Solid(RGBA {
                    r: color.r as f32 / 255.0,
                    g: color.g as f32 / 255.0,
                    b: color.b as f32 / 255.0,
                    a: color.a as f32 / 255.0,
                });
            }
        }
        AttrStyledRun {
            start: run.start,
            end: run.end,
            style,
        }
    }
}

impl From<&AttrStyledRun> for CgStyledTextRun {
    fn from(run: &AttrStyledRun) -> Self {
        use crate::cg::color::CGColor;

        let fills = match &run.style.fill {
            TextFill::Solid(rgba) => {
                let color = CGColor::from_rgba(
                    (rgba.r * 255.0) as u8,
                    (rgba.g * 255.0) as u8,
                    (rgba.b * 255.0) as u8,
                    (rgba.a * 255.0) as u8,
                );
                Some(vec![Paint::from(color)])
            }
        };
        CgStyledTextRun {
            start: run.start,
            end: run.end,
            style: (&run.style).into(),
            fills,
            strokes: None,
            stroke_width: None,
            stroke_align: None,
        }
    }
}

// ---------------------------------------------------------------------------
// AttributedString <-> AttributedText
// ---------------------------------------------------------------------------

impl From<&CgAttributedString> for AttributedText {
    fn from(attr: &CgAttributedString) -> Self {
        let runs: Vec<AttrStyledRun> = attr.runs.iter().map(Into::into).collect();
        let default_style = runs.first().map(|r| r.style.clone()).unwrap_or_default();
        AttributedText::from_parts(attr.text.clone(), default_style, Default::default(), runs)
    }
}

impl From<&AttributedText> for CgAttributedString {
    fn from(attr: &AttributedText) -> Self {
        let runs: Vec<CgStyledTextRun> = attr.runs().iter().map(Into::into).collect();
        CgAttributedString::from_runs(attr.text().to_string(), runs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cg::prelude::Paint;

    #[test]
    fn roundtrip_text_style_rec() {
        let rec = TextStyleRec::from_font("Inter", 16.0);
        let attr: TextStyle = (&rec).into();
        let rec2: TextStyleRec = (&attr).into();

        assert_eq!(rec.font_family, rec2.font_family);
        assert_eq!(rec.font_size, rec2.font_size);
        assert_eq!(rec.font_weight.0, rec2.font_weight.0);
        assert_eq!(rec.font_style_italic, rec2.font_style_italic);
    }

    #[test]
    fn text_dimension_roundtrip_letter_spacing() {
        let ls = TextLetterSpacing::Fixed(1.5);
        let dim: TextDimension = ls.into();
        let ls2: TextLetterSpacing = dim.into();
        match ls2 {
            TextLetterSpacing::Fixed(f) => assert!((f - 1.5).abs() < f32::EPSILON),
            _ => panic!("expected Fixed"),
        }
    }

    #[test]
    fn text_dimension_line_height_normal_roundtrip() {
        let lh = TextLineHeight::Normal;
        let dim: TextDimension = lh.into();
        let lh2: TextLineHeight = dim.into();
        match lh2 {
            TextLineHeight::Normal => {}
            _ => panic!("expected Normal"),
        }
    }

    #[test]
    fn roundtrip_attributed_string() {
        use crate::cg::color::CGColor;

        let mut bold = TextStyleRec::from_font("Inter", 16.0);
        bold.font_weight = FontWeight(700);

        let cg_attr = CgAttributedString::from_runs(
            "Hello World".to_string(),
            vec![
                CgStyledTextRun {
                    start: 0,
                    end: 6,
                    style: TextStyleRec::from_font("Inter", 16.0),
                    fills: Some(vec![Paint::from(CGColor::BLACK)]),
                    strokes: None,
                    stroke_width: None,
                    stroke_align: None,
                },
                CgStyledTextRun {
                    start: 6,
                    end: 11,
                    style: bold,
                    fills: Some(vec![Paint::from(CGColor::RED)]),
                    strokes: None,
                    stroke_width: None,
                    stroke_align: None,
                },
            ],
        );

        // cg -> attributed_text
        let attr: AttributedText = (&cg_attr).into();
        assert_eq!(attr.text(), "Hello World");
        assert_eq!(attr.runs().len(), 2);
        assert_eq!(attr.runs()[0].start, 0);
        assert_eq!(attr.runs()[0].end, 6);
        assert_eq!(attr.runs()[1].style.font_weight, 700);

        // attributed_text -> cg
        let cg_attr2: CgAttributedString = (&attr).into();
        assert_eq!(cg_attr2.text, "Hello World");
        assert_eq!(cg_attr2.runs.len(), 2);
        assert_eq!(cg_attr2.runs[1].style.font_weight.0, 700);
    }
}
