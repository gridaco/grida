use super::*;
use cg::cg::alignment::Alignment;
use math2::box_fit::BoxFit;

/// Image paint with non-default filter values: exposure, contrast, saturation, etc.
pub fn build() -> Scene {
    let s = 150.0;
    let gap = 170.0;

    // Bright + warm
    let bright_warm = rect(0.0, 0.0, s, s, Paint::Image(ImagePaint {
        active: true,
        image: ResourceRef::HASH(SYSTEM_IMAGE.to_owned()),
        fit: ImagePaintFit::Fit(BoxFit::Cover),
        filters: ImageFilters {
            exposure: 0.5,
            temperature: 0.4,
            ..ImageFilters::default()
        },
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        quarter_turns: 0,
        alignment: Alignment::CENTER,
    }));

    // High contrast + desaturated
    let contrast_desat = rect(gap, 0.0, s, s, Paint::Image(ImagePaint {
        active: true,
        image: ResourceRef::HASH(SYSTEM_IMAGE.to_owned()),
        fit: ImagePaintFit::Fit(BoxFit::Cover),
        filters: ImageFilters {
            contrast: 0.25,
            saturation: -0.8,
            ..ImageFilters::default()
        },
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        quarter_turns: 0,
        alignment: Alignment::CENTER,
    }));

    // Cool tint + shadow lift
    let cool_shadow = rect(gap * 2.0, 0.0, s, s, Paint::Image(ImagePaint {
        active: true,
        image: ResourceRef::HASH(SYSTEM_IMAGE.to_owned()),
        fit: ImagePaintFit::Fit(BoxFit::Cover),
        filters: ImageFilters {
            temperature: -0.6,
            tint: -0.3,
            shadows: 0.5,
            ..ImageFilters::default()
        },
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        quarter_turns: 0,
        alignment: Alignment::CENTER,
    }));

    // All filters non-zero
    let all_filters = rect(gap * 3.0, 0.0, s, s, Paint::Image(ImagePaint {
        active: true,
        image: ResourceRef::HASH(SYSTEM_IMAGE.to_owned()),
        fit: ImagePaintFit::Fit(BoxFit::Cover),
        filters: ImageFilters {
            exposure: 0.2,
            contrast: 0.1,
            saturation: 0.3,
            temperature: -0.2,
            tint: 0.15,
            highlights: -0.4,
            shadows: 0.3,
        },
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        quarter_turns: 0,
        alignment: Alignment::CENTER,
    }));

    flat_scene("L0 Image Filters", vec![bright_warm, contrast_desat, cool_shadow, all_filters])
}
