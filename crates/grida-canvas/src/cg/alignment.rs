use serde::Deserialize;

/// A 2D point expressed in **Centered Normalized Device Coordinates** (cNDC).
///
/// # Centered Normalized Device Coordinates (cNDC)
///
/// cNDC is a normalized coordinate system spanning `[-1.0, +1.0]` horizontally
/// and vertically, with the **geometric center** of the rectangle at `(0.0, 0.0)`.
/// A total span of **2.0 units** corresponds to the full width or height of the
/// rectangle.
///
/// This coordinate space is mathematically equivalent to the 2D subset of
/// *Normalized Device Coordinates* used in graphics pipelines, but applied to
/// rectangle-relative alignment rather than screen-space projection.
///
/// ## Mapping
///
/// Given a rectangle of width `w` and height `h`, an alignment `(x, y)`
/// corresponds to the pixel-space point:
///
/// ```text
/// px = x * (w / 2) + (w / 2)
/// py = y * (h / 2) + (h / 2)
/// ```
///
/// ## Semantic Interpretation
///
/// - `(-1.0, -1.0)` → top-left corner  
/// - `( 1.0,  1.0)` → bottom-right corner  
/// - `( 0.0,  0.0)` → center  
///
/// Values outside `[-1, 1]` represent points outside the rectangle.
///
/// ## Examples
///
/// - `(0.0, 3.0)` → centered horizontally, **one full height below** the rectangle  
/// - `(0.0, -0.5)` → halfway between the top edge and the center  
///
/// ## Comparison to UV Coordinates
/// - cNDC spans `[-1, +1]` and is center-based  
/// - UV spans `[0, 1]` and is domain-based  
///
/// cNDC is ideal for alignment, anchors, and directional positioning.
/// UV is ideal for sampling, textures, gradients, and shaders.
///
/// ## References
/// - Flutter `Alignment`: https://api.flutter.dev/flutter/painting/Alignment-class.html
///
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Alignment(pub f32, pub f32);

impl Alignment {
    pub const BOTTOM_CENTER: Alignment = Alignment(0.0, 1.0);
    pub const BOTTOM_LEFT: Alignment = Alignment(-1.0, 1.0);
    pub const BOTTOM_RIGHT: Alignment = Alignment(1.0, 1.0);
    pub const CENTER: Alignment = Alignment(0.0, 0.0);
    pub const CENTER_LEFT: Alignment = Alignment(-1.0, 0.0);
    pub const CENTER_RIGHT: Alignment = Alignment(1.0, 0.0);
    pub const TOP_CENTER: Alignment = Alignment(0.0, -1.0);
    pub const TOP_LEFT: Alignment = Alignment(-1.0, -1.0);
    pub const TOP_RIGHT: Alignment = Alignment(1.0, -1.0);

    #[inline]
    pub fn x(&self) -> f32 {
        self.0
    }

    #[inline]
    pub fn y(&self) -> f32 {
        self.1
    }

    /// Converts this alignment (cNDC) into normalized UV coordinates.
    ///
    /// # Conversion
    /// Maps `[-1, +1] → [0, 1]`:
    ///
    /// ```text
    /// u = (x + 1) * 0.5
    /// v = (y + 1) * 0.5
    /// ```
    ///
    pub fn to_uv(self) -> Uv {
        let Alignment(x, y) = self;
        Uv((x + 1.0) * 0.5, (y + 1.0) * 0.5)
    }

    /// Converts UV coordinates `[0,1]` into centered normalized coordinates (cNDC).
    ///
    /// # Conversion
    /// Maps `[0, 1] → [-1, +1]`:
    ///
    /// ```text
    /// x = u * 2 - 1
    /// y = v * 2 - 1
    /// ```
    ///
    pub fn from_uv(uv: Uv) -> Self {
        let Uv(u, v) = uv;
        Alignment(u * 2.0 - 1.0, v * 2.0 - 1.0)
    }
}

/// A point in **Normalized UV Coordinate Space**.
///
/// # Normalized UV Coordinates (UV Space)
///
/// UV coordinates define a unit-rectangle domain where:
///
/// - `u = 0.0` → left edge  
/// - `u = 1.0` → right edge  
/// - `v = 0.0` → top edge (or bottom, depending on convention)  
/// - `v = 1.0` → bottom edge  
///
/// The domain is always `[0.0, 1.0] × [0.0, 1.0]`.  
///
/// UV space is universally used in:
/// - texture sampling  
/// - shaders  
/// - Skia gradients  
/// - GPU pipelines  
/// - 2D/3D rendering  
///
/// ## Important
///
/// UV space is *not centered*.  
/// Its geometric midpoint is always `(0.5, 0.5)`, but this has **no inherent semantic meaning** unless an effect interprets it that way (e.g., radial gradients).
///
/// ## Comparison to cNDC
///
/// - UV: `[0, 1]` domain coordinates  
/// - cNDC: `[-1, 1]` centered coordinates  
///
/// ## References
/// - Khronos Texture Coordinates: https://www.khronos.org/opengl/wiki/Texture
/// - Skia Shader Coordinate Systems: https://skia.org/docs/user/api/skshader/
///
/// UV coordinates are the standard representation for normalized surface
/// positions in all GPU-based rendering systems.
///
/// ---
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Uv(pub f32, pub f32);

impl Uv {
    #[inline]
    pub fn u(&self) -> f32 {
        self.0
    }

    #[inline]
    pub fn v(&self) -> f32 {
        self.1
    }

    /// Converts these UV coordinates to centered normalized coordinates (cNDC).
    ///
    /// ```text
    /// x = u * 2 - 1
    /// y = v * 2 - 1
    /// ```
    #[inline]
    pub fn to_alignment(self) -> Alignment {
        Alignment::from_uv(self)
    }

    /// Converts cNDC alignment into UV coordinates.
    ///
    /// ```text
    /// u = (x + 1) * 0.5
    /// v = (y + 1) * 0.5
    /// ```
    #[inline]
    pub fn from_alignment(a: Alignment) -> Uv {
        a.to_uv()
    }
}
