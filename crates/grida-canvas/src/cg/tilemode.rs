use serde::{Deserialize, Serialize};

/// Specifies how a gradient or shader behaves when sampling outside its
/// original [0.0, 1.0] domain.
///
/// This enum is the **internal Grida representation** for tiling behavior,
/// unifying terminology across:
///
/// - **SVG**: `spreadMethod` (`pad`, `reflect`, `repeat`)
/// - **Flutter**: `TileMode` (`clamp`, `mirror`, `repeated`, `decal`)
/// - **Skia**: `SkTileMode` (`kClamp`, `kMirror`, `kRepeat`, `kDecal`)
///
/// # Overview
///
/// Many graphics systems define how gradients should behave when their
/// coordinate space is sampled outside the gradient's natural range.
/// `TileMode` abstracts these behaviors into four modes, matching Skia's
/// native model (and thereby Flutter's).
///
/// # Variants
///
/// ## `Clamp`
/// Extends the edge color infinitely in all directions.
///
/// Equivalent to:
/// - **SVG**: `spreadMethod="pad"`
/// - **Flutter**: `TileMode.clamp`
/// - **Skia**: `kClamp`
///
/// ## `Repeated`
/// Tiles (repeats) the gradient endlessly.
///
/// Equivalent to:
/// - **SVG**: `spreadMethod="repeat"`
/// - **Flutter**: `TileMode.repeated`
/// - **Skia**: `kRepeat`
///
/// ## `Mirror`
/// Repeats the gradient but flips (mirrors) every other tile.
///
/// Equivalent to:
/// - **SVG**: `spreadMethod="reflect"`
/// - **Flutter**: `TileMode.mirror`
/// - **Skia**: `kMirror`
///
/// ## `Decal`
/// Samples outside the gradient's bounds become **transparent**.  
/// This mode **does not exist** in SVG and will be lost or degraded when
/// exporting to SVG formats.
///
/// Equivalent to:
/// - **Flutter**: `TileMode.decal`
/// - **Skia**: `kDecal`
/// - **SVG**: *no equivalent*
///
/// # Serialization
///
/// The enum serializes into a lowercase string:
///
/// | Variant   | Serialized as | Aliases         |
/// |----------|----------------|-----------------|
/// | `Clamp`  | `"clamp"`      | —               |
/// | `Repeated` | `"repeated"` | `"repeat"`      |
/// | `Mirror` | `"mirror"`     | —               |
/// | `Decal`  | `"decal"`      | —               |
///
/// This aligns with Flutter/Skia conventions rather than SVG conventions,
/// since the internal IR is engine-oriented rather than format-oriented.
///
/// # Default
///
/// The default mode is [`Clamp`], matching Skia, Flutter, and SVG defaults.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TileMode {
    #[serde(rename = "clamp")]
    Clamp,
    #[serde(rename = "repeated", alias = "repeat")]
    Repeated,
    #[serde(rename = "mirror")]
    Mirror,
    #[serde(rename = "decal")]
    Decal,
}

impl Default for TileMode {
    fn default() -> Self {
        TileMode::Clamp
    }
}
