/// Generate a 5x4 color matrix for SVG `feColorMatrix` with `type="saturate"`.
///
/// This function generates a color matrix that adjusts the saturation of an image.
/// The saturation value determines how much color information is preserved:
/// - `0.0` = grayscale (no color)
/// - `1.0` = original saturation
/// - `>1.0` = oversaturated (spec allows any real number)
///
/// The matrix transformation is defined as:
/// ```text
/// | R' |     |0.213+0.787s  0.715-0.715s  0.072-0.072s 0  0 |   | R |
/// | G' |     |0.213-0.213s  0.715+0.285s  0.072-0.072s 0  0 |   | G |
/// | B' |  =  |0.213-0.213s  0.715-0.715s  0.072+0.928s 0  0 | * | B |
/// | A' |     |           0            0             0  1  0 |   | A |
/// | 1  |     |           0            0             0  0  1 |   | 1 |
/// ```
///
/// # Arguments
///
/// * `s` - Saturation factor. Must be a real number (typically 0.0 to 1.0+).
///
/// # Returns
///
/// A 20-element array representing a 5x4 color matrix in row-major order.
///
/// # References
///
/// * [SVG Filter Effects - feColorMatrix](https://www.w3.org/TR/2000/CR-SVG-20000802/filters.html#feColorMatrix)
pub fn saturation(s: f32) -> [f32; 20] {
    #[rustfmt::skip]
    let matrix  = [
        0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.0, 0.0,
        0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.0, 0.0,
        0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0.0, 0.0,
        0.0,               0.0,               0.0,               1.0, 0.0,
    ];

    return matrix;
}

/// Generate a 5x4 color matrix for hue rotation (SVG/CSS-compatible).
///
/// This function generates a color matrix that rotates the hue of an image.
/// The rotation is performed in the HSL color space, shifting all colors
/// around the color wheel by the specified angle.
///
/// For `type="hueRotate"`, the operation is equivalent to the following matrix operation:
/// ```text
/// | R' |     | a00  a01  a02  0  0 |   | R |
/// | G' |     | a10  a11  a12  0  0 |   | G |
/// | B' |  =  | a20  a21  a22  0  0 | * | B |
/// | A' |     | 0    0    0    1  0 |   | A |
/// | 1  |     | 0    0    0    0  1 |   | 1 |
/// ```
///
/// where the terms a00, a01, etc. are calculated as follows:
/// ```text
/// | a00 a01 a02 |    [+0.213 +0.715 +0.072]
/// | a10 a11 a12 | =  [+0.213 +0.715 +0.072] +
/// | a20 a21 a22 |    [+0.213 +0.715 +0.072]
///                         [+0.787 -0.715 -0.072]
/// cos(hueRotate value) *  [-0.212 +0.285 -0.072] +
///                         [-0.213 -0.715 +0.928]
///
///                         [-0.213 -0.715+0.928]
/// sin(hueRotate value) *  [+0.143 +0.140-0.283]
///                         [-0.787 +0.715+0.072]
/// ```
///
/// # Arguments
///
/// * `angle` - Rotation angle in degrees. Positive values rotate clockwise,
///   negative values rotate counter-clockwise.
///
/// # Returns
///
/// A 20-element array representing a 5x4 color matrix in row-major order.
///
/// # References
///
/// * [SVG Filter Effects - feColorMatrix](https://www.w3.org/TR/2000/CR-SVG-20000802/filters.html#feColorMatrix)
pub fn hue_rotate(angle: f32) -> [f32; 20] {
    let angle_rad = angle.to_radians();
    let cos = angle_rad.cos();
    let sin = angle_rad.sin();

    #[rustfmt::skip]
    let matrix = [
        0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928, 0.0, 0.0,
        0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.140, 0.072 - cos * 0.072 - sin * 0.283, 0.0, 0.0,
        0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072, 0.0, 0.0,
        0.0,                               0.0,                               0.0,                               1.0, 0.0,
    ];

    return matrix;
}

#[rustfmt::skip]
const LUMINANCE_TO_ALPHA_MATRIX: [f32; 20] = [
    0.0,    0.0,    0.0,    0.0, 0.0, // R'
    0.0,    0.0,    0.0,    0.0, 0.0, // G'
    0.0,    0.0,    0.0,    0.0, 0.0, // B'
    0.2125, 0.7154, 0.0721, 0.0, 0.0, // A' = luminance
];

/// Generate a 5x4 color matrix that converts luminance to alpha channel.
///
/// This function generates a color matrix that computes the luminance of the
/// input image and uses it as the alpha channel of the output. The RGB channels
/// are set to zero, effectively creating a grayscale alpha mask based on the
/// brightness of the original image.
///
/// The luminance is calculated using the standard RGB to grayscale conversion:
/// `luminance = 0.2125*R + 0.7154*G + 0.0721*B`
///
/// The matrix transformation is:
/// ```text
/// | R' |     |      0        0        0  0  0 |   | R |
/// | G' |     |      0        0        0  0  0 |   | G |
/// | B' |  =  |      0        0        0  0  0 | * | B |
/// | A' |     | 0.2125   0.7154   0.0721  0  0 |   | A |
/// | 1  |     |      0        0        0  0  1 |   | 1 |
/// ```
///
/// # Returns
///
/// A 20-element array representing a 5x4 color matrix in row-major order.
///
/// # References
///
/// * [SVG Filter Effects - feColorMatrix](https://www.w3.org/TR/2000/CR-SVG-20000802/filters.html#feColorMatrix)
pub fn luminance_to_alpha() -> [f32; 20] {
    LUMINANCE_TO_ALPHA_MATRIX
}
