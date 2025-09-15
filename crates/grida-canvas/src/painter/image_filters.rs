//! Image color filter implementations using Skia color matrix
//!
//! This module provides the core image filter functions that implement the
//! standard color adjustments as defined in the image filters proposal.
//! All filters use Skia's color matrix for efficient GPU-accelerated processing.

use crate::cg::types::ImageFilters;
use skia_safe::{self as sk, color_filters, ColorMatrix};

/// Creates a color filter for exposure adjustment
///
/// Exposure adjusts the brightness of an image by multiplying RGB values by a factor.
///
/// # Math
/// RGB' = RGB * k (where k = 2^E, E is exposure value)
///
/// # Arguments
/// * `exposure_factor` - The exposure factor (k = 2^E)
///   - 1.0 = neutral (no change)
///   - > 1.0 = brighter (positive exposure)
///   - < 1.0 = darker (negative exposure)
///
/// # Returns
/// A Skia ColorFilter that can be applied to images or paints
pub fn create_exposure_filter(exposure_factor: f32) -> sk::ColorFilter {
    // Exposure is a simple multiplication of RGB channels
    // We clamp the result to [0, 1] range
    #[rustfmt::skip]
    let matrix = ColorMatrix::new(
        exposure_factor, 0.0, 0.0, 0.0, 0.0, // R' = R * k
        0.0, exposure_factor, 0.0, 0.0, 0.0, // G' = G * k
        0.0, 0.0, exposure_factor, 0.0, 0.0, // B' = B * k
        0.0, 0.0, 0.0, 1.0, 0.0,             // A' = A (unchanged)
    );

    color_filters::matrix(&matrix, None)
}

/// Creates a color filter for contrast adjustment
///
/// Contrast adjusts the difference between light and dark areas by scaling around a pivot point.
///
/// # Math
/// c' = (c - p) * k + p
/// Where:
/// - c = input color value [0, 1]
/// - p = pivot point (typically 0.5 for sRGB)
/// - k = contrast factor
///
/// # Arguments
/// * `contrast_factor` - The contrast factor (k)
///   - 1.0 = neutral (no change)
///   - > 1.0 = higher contrast
///   - < 1.0 = lower contrast
///   - 0.0 = flat gray
///
/// # Returns
/// A Skia ColorFilter that can be applied to images or paints
pub fn create_contrast_filter(contrast_factor: f32) -> sk::ColorFilter {
    let pivot = 0.5; // sRGB pivot point

    // Contrast formula: c' = (c - p) * k + p
    // This can be rewritten as: c' = c * k + p * (1 - k)
    // In matrix form: [k, 0, 0, 0, p*(1-k)]
    #[rustfmt::skip]
    let matrix = ColorMatrix::new(
        contrast_factor, 0.0, 0.0, 0.0, pivot * (1.0 - contrast_factor), // R' = R * k + p * (1 - k)
        0.0, contrast_factor, 0.0, 0.0, pivot * (1.0 - contrast_factor), // G' = G * k + p * (1 - k)
        0.0, 0.0, contrast_factor, 0.0, pivot * (1.0 - contrast_factor), // B' = B * k + p * (1 - k)
        0.0, 0.0, 0.0, 1.0, 0.0,                                         // A' = A (unchanged)
    );

    color_filters::matrix(&matrix, None)
}

/// Creates a color filter for saturation adjustment
///
/// Saturation adjusts the intensity of colors by interpolating between the original color
/// and its grayscale equivalent.
///
/// # Math
/// color' = lerp(luma, color, k)
/// Where:
/// - luma = dot(RGB, [0.2126, 0.7152, 0.0722]) - sRGB luminance coefficients
/// - k = saturation factor
///
/// # Arguments
/// * `saturation_factor` - The saturation factor (k)
///   - 1.0 = neutral (no change)
///   - > 1.0 = more saturated
///   - < 1.0 = less saturated
///   - 0.0 = grayscale
///
/// # Returns
/// A Skia ColorFilter that can be applied to images or paints
pub fn create_saturation_filter(saturation_factor: f32) -> sk::ColorFilter {
    // sRGB luminance coefficients
    let luma_r = 0.2126;
    let luma_g = 0.7152;
    let luma_b = 0.0722;

    // Saturation formula: color' = lerp(luma, color, k)
    // This expands to: color' = luma * (1 - k) + color * k
    // In matrix form for each channel:
    // R' = R * (luma_r * (1-k) + k) + G * (luma_g * (1-k)) + B * (luma_b * (1-k))
    // G' = R * (luma_r * (1-k)) + G * (luma_g * (1-k) + k) + B * (luma_b * (1-k))
    // B' = R * (luma_r * (1-k)) + G * (luma_g * (1-k)) + B * (luma_b * (1-k) + k)

    let one_minus_k = 1.0 - saturation_factor;

    #[rustfmt::skip]
    let matrix = ColorMatrix::new(
        luma_r * one_minus_k + saturation_factor, luma_g * one_minus_k, luma_b * one_minus_k, 0.0, 0.0, // R'
        luma_r * one_minus_k, luma_g * one_minus_k + saturation_factor, luma_b * one_minus_k, 0.0, 0.0, // G'
        luma_r * one_minus_k, luma_g * one_minus_k, luma_b * one_minus_k + saturation_factor, 0.0, 0.0, // B'
        0.0, 0.0, 0.0, 1.0, 0.0,                                                                         // A' = A (unchanged)
    );

    color_filters::matrix(&matrix, None)
}

/// Creates a color filter for temperature adjustment
///
/// Temperature adjusts the white balance by scaling R and B channels relative to each other.
///
/// # Math
/// R' = R * rK, B' = B * bK
/// Where:
/// - rK = 1 + t (red channel multiplier)
/// - bK = 1 - t (blue channel multiplier)
/// - t = temperature adjustment
///
/// # Arguments
/// * `temperature` - The temperature adjustment (t)
///   - 0.0 = neutral (no change)
///   - > 0.0 = warmer (more red, less blue)
///   - < 0.0 = cooler (less red, more blue)
///
/// # Returns
/// A Skia ColorFilter that can be applied to images or paints
pub fn create_temperature_filter(temperature: f32) -> sk::ColorFilter {
    // Temperature formula: R' = R * (1 + t), B' = B * (1 - t)
    // G channel remains unchanged to preserve luminance
    let red_multiplier = 1.0 + temperature;
    let blue_multiplier = 1.0 - temperature;

    #[rustfmt::skip]
    let matrix = ColorMatrix::new(
        red_multiplier, 0.0, 0.0, 0.0, 0.0, // R' = R * (1 + t)
        0.0, 1.0, 0.0, 0.0, 0.0,            // G' = G (unchanged)
        0.0, 0.0, blue_multiplier, 0.0, 0.0, // B' = B * (1 - t)
        0.0, 0.0, 0.0, 1.0, 0.0,            // A' = A (unchanged)
    );

    color_filters::matrix(&matrix, None)
}

/// Creates a color filter for tint adjustment
///
/// Tint adjusts the green-magenta balance by scaling the G channel relative to R and B.
///
/// # Math
/// G' = G * gK
/// Where:
/// - gK = green channel multiplier
///
/// # Arguments
/// * `green_multiplier` - The green channel multiplier (gK)
///   - 1.0 = neutral (no change)
///   - > 1.0 = more green (less magenta)
///   - < 1.0 = less green (more magenta)
///
/// # Returns
/// A Skia ColorFilter that can be applied to images or paints
pub fn create_tint_filter(green_multiplier: f32) -> sk::ColorFilter {
    // Tint formula: G' = G * gK
    // R and B channels remain unchanged
    #[rustfmt::skip]
    let matrix = ColorMatrix::new(
        1.0, 0.0, 0.0, 0.0, 0.0,            // R' = R (unchanged)
        0.0, green_multiplier, 0.0, 0.0, 0.0, // G' = G * gK
        0.0, 0.0, 1.0, 0.0, 0.0,            // B' = B (unchanged)
        0.0, 0.0, 0.0, 1.0, 0.0,            // A' = A (unchanged)
    );

    color_filters::matrix(&matrix, None)
}

/// Combines multiple color filters into a single filter for efficient processing
///
/// This function allows combining multiple linear color adjustments into a single
/// color matrix operation, which is more efficient than applying filters sequentially.
///
/// # Arguments
/// * `filters` - A slice of Skia ColorFilters to combine
///
/// # Returns
/// A combined Skia ColorFilter, or None if the slice is empty
pub fn combine_color_filters(filters: &[sk::ColorFilter]) -> Option<sk::ColorFilter> {
    if filters.is_empty() {
        return None;
    }

    if filters.len() == 1 {
        return Some(filters[0].clone());
    }

    // For multiple filters, we need to combine them
    // This is a simplified implementation - in practice, you might want to
    // combine the color matrices directly for better performance
    let mut combined = filters[0].clone();
    for filter in &filters[1..] {
        if let Some(new_combined) = color_filters::compose(filter, &combined) {
            combined = new_combined;
        } else {
            // If composition fails, return None
            return None;
        }
    }

    Some(combined)
}

/// Creates a combined color filter from ImageFilters struct
///
/// This function takes an ImageFilters struct and creates a single combined
/// color filter that applies all the specified filters in the correct order.
/// The filters are applied in the order: Exposure -> Contrast -> Saturation -> Temperature -> Tint
///
/// # Arguments
/// * `filters` - The ImageFilters struct containing filter parameters
///
/// # Returns
/// A combined Skia ColorFilter, or None if no filters are specified
pub fn create_image_filters_color_filter(filters: &ImageFilters) -> Option<sk::ColorFilter> {
    let mut color_filters = Vec::new();

    // Apply filters in the correct order for optimal results
    // 1. Exposure (brightness adjustment)
    if let Some(exposure) = filters.exposure {
        color_filters.push(create_exposure_filter(exposure));
    }

    // 2. Contrast (dynamic range adjustment)
    if let Some(contrast) = filters.contrast {
        color_filters.push(create_contrast_filter(contrast));
    }

    // 3. Saturation (color intensity adjustment)
    if let Some(saturation) = filters.saturation {
        color_filters.push(create_saturation_filter(saturation));
    }

    // 4. Temperature (warm/cool color adjustment)
    if let Some(temperature) = filters.temperature {
        color_filters.push(create_temperature_filter(temperature));
    }

    // 5. Tint (green/magenta adjustment)
    if let Some(tint) = filters.tint {
        color_filters.push(create_tint_filter(tint));
    }

    // Combine all filters into a single color filter
    combine_color_filters(&color_filters)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_exposure_filter_neutral() {
        let _filter = create_exposure_filter(1.0);
        // Test that neutral exposure doesn't change colors
        // This would require more complex testing with actual color values
        // The filter creation should not panic
    }

    #[test]
    fn test_contrast_filter_neutral() {
        let _filter = create_contrast_filter(1.0);
        // The filter creation should not panic
    }

    #[test]
    fn test_saturation_filter_neutral() {
        let _filter = create_saturation_filter(1.0);
        // The filter creation should not panic
    }

    #[test]
    fn test_temperature_filter_neutral() {
        let _filter = create_temperature_filter(0.0);
        // The filter creation should not panic
    }

    #[test]
    fn test_tint_filter_neutral() {
        let _filter = create_tint_filter(1.0);
        // The filter creation should not panic
    }

    #[test]
    fn test_combine_empty_filters() {
        let result = combine_color_filters(&[]);
        assert!(result.is_none());
    }

    #[test]
    fn test_combine_single_filter() {
        let filter = create_exposure_filter(1.5);
        let result = combine_color_filters(&[filter]);
        assert!(result.is_some());
    }

    #[test]
    fn test_create_image_filters_color_filter_empty() {
        let filters = ImageFilters::default();
        let result = create_image_filters_color_filter(&filters);
        assert!(result.is_none());
    }

    #[test]
    fn test_create_image_filters_color_filter_single() {
        let mut filters = ImageFilters::default();
        filters.exposure = Some(1.5);
        let result = create_image_filters_color_filter(&filters);
        assert!(result.is_some());
    }

    #[test]
    fn test_create_image_filters_color_filter_multiple() {
        let mut filters = ImageFilters::default();
        filters.exposure = Some(1.2);
        filters.contrast = Some(1.1);
        filters.saturation = Some(0.8);
        let result = create_image_filters_color_filter(&filters);
        assert!(result.is_some());
    }
}
