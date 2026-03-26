//! Conversion helpers between `cg::types` scene-graph types and text-edit types.
//!
//! Now that both live in the same crate, enum/struct types are shared directly.
//! Only `TextStyleRec ↔ TextStyle` and `StyledTextRun ↔ StyledRun` conversions
//! remain, plus the `TextDimension ↔ TextLetterSpacing/WordSpacing/LineHeight`
//! bridging (the scene graph uses separate per-dimension enums).

use crate::cg::types::{
    AttributedString as CgAttributedString, FontWeight, Paint, Paints,
    StyledTextRun as CgStyledTextRun, TextDecorationLine, TextDecorationRec,
    TextDecorationStyle, TextLetterSpacing, TextLineHeight, TextStyleRec,
    TextWordSpacing,
};

use super::{
    AttributedText, StyledRun, TextDimension, TextStroke, TextStyle,
};

// ---------------------------------------------------------------------------
// TextDimension ↔ spacing enums
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

impl From<TextDimension> for TextLetterSpacing {
    fn from(v: TextDimension) -> Self {
        match v {
            TextDimension::Normal => TextLetterSpacing::Fixed(0.0),
            TextDimension::Fixed(f) => TextLetterSpacing::Fixed(f),
            TextDimension::Factor(f) => TextLetterSpacing::Factor(f),
        }
    }
}

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
// TextStyleRec ↔ TextStyle
// ---------------------------------------------------------------------------

impl From<&TextStyleRec> for TextStyle {
    fn from(rec: &TextStyleRec) -> Self {
        let (deco_line, deco_style, deco_color, deco_skip_ink, deco_thickness) =
            if let Some(ref d) = rec.text_decoration {
                (
                    d.text_decoration_line,
                    d.text_decoration_style.unwrap_or(TextDecorationStyle::Solid),
                    d.text_decoration_color,
                    d.text_decoration_skip_ink.unwrap_or(true),
                    d.text_decoration_thickness.unwrap_or(1.0),
                )
            } else {
                (TextDecorationLine::None, TextDecorationStyle::Solid, None, true, 1.0)
            };

        TextStyle {
            font_family: rec.font_family.clone(),
            font_size: rec.font_size,
            font_weight: rec.font_weight.0,
            font_width: rec.font_width.unwrap_or(100.0),
            font_style_italic: rec.font_style_italic,
            font_kerning: rec.font_kerning,
            font_optical_sizing: rec.font_optical_sizing,
            font_features: rec.font_features.as_ref().cloned().unwrap_or_default(),
            font_variations: rec.font_variations.as_ref().cloned().unwrap_or_default(),
            letter_spacing: rec.letter_spacing.into(),
            word_spacing: rec.word_spacing.into(),
            line_height: rec.line_height.clone().into(),
            text_decoration_line: deco_line,
            text_decoration_style: deco_style,
            text_decoration_color: deco_color,
            text_decoration_skip_ink: deco_skip_ink,
            text_decoration_thickness: deco_thickness,
            text_transform: rec.text_transform,
            fills: Vec::new(), // caller must set from node fills
            stroke: None,
            hyperlink: None,
        }
    }
}

impl From<&TextStyle> for TextStyleRec {
    fn from(s: &TextStyle) -> Self {
        let text_decoration = if s.text_decoration_line == TextDecorationLine::None {
            None
        } else {
            Some(TextDecorationRec {
                text_decoration_line: s.text_decoration_line,
                text_decoration_style: Some(s.text_decoration_style),
                text_decoration_color: s.text_decoration_color,
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
            font_optical_sizing: s.font_optical_sizing,
            font_features: if s.font_features.is_empty() {
                None
            } else {
                Some(s.font_features.clone())
            },
            font_variations: if s.font_variations.is_empty() {
                None
            } else {
                Some(s.font_variations.clone())
            },
            letter_spacing: s.letter_spacing.into(),
            word_spacing: s.word_spacing.into(),
            line_height: s.line_height.into(),
            text_transform: s.text_transform,
        }
    }
}

/// Convert a `TextStyleRec` to a `TextStyle` with explicit fills.
pub fn text_style_rec_to_attr_with_fills(rec: &TextStyleRec, fills: Vec<Paint>) -> TextStyle {
    let mut style: TextStyle = rec.into();
    style.fills = fills;
    style
}

// ---------------------------------------------------------------------------
// StyledTextRun ↔ StyledRun
// ---------------------------------------------------------------------------

impl From<&CgStyledTextRun> for StyledRun {
    fn from(run: &CgStyledTextRun) -> Self {
        let mut style: TextStyle = (&run.style).into();

        // Direct copy — no serde round-trip needed.
        if let Some(ref fills) = run.fills {
            style.fills = fills.clone();
        }

        if let Some(ref strokes) = run.strokes {
            if !strokes.is_empty() {
                style.stroke = Some(TextStroke {
                    paints: strokes.as_slice().to_vec(),
                    width: run.stroke_width.unwrap_or(1.0),
                    align: run.stroke_align.unwrap_or_default(),
                });
            }
        }

        StyledRun {
            start: run.start,
            end: run.end,
            style,
        }
    }
}

impl From<&StyledRun> for CgStyledTextRun {
    fn from(run: &StyledRun) -> Self {
        let fills = if run.style.fills.is_empty() {
            None
        } else {
            Some(run.style.fills.clone())
        };

        let (strokes, stroke_width, stroke_align) = if let Some(ref stroke) = run.style.stroke {
            (
                Some(Paints::new(stroke.paints.clone())),
                Some(stroke.width),
                Some(stroke.align),
            )
        } else {
            (None, None, None)
        };

        CgStyledTextRun {
            start: run.start,
            end: run.end,
            style: (&run.style).into(),
            fills,
            strokes,
            stroke_width,
            stroke_align,
        }
    }
}

// ---------------------------------------------------------------------------
// AttributedString ↔ AttributedText
// ---------------------------------------------------------------------------

impl From<&CgAttributedString> for AttributedText {
    fn from(attr: &CgAttributedString) -> Self {
        let runs: Vec<StyledRun> = attr.runs.iter().map(Into::into).collect();
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
