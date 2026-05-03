//! `SvgResourceContainer` — uniform contract for resource resolution.
//!
//! Every resource container (gradient, pattern, clipper, masker,
//! filter, marker) produces a *realized output* given a referencing
//! client's bbox. The realized output is the only thing paint
//! consumes; it's the type-system boundary between the resource and
//! paint phases.
//!
//! Per the Blink-aligned architecture rules: resource files may
//! produce Skia operation types as outputs (`Shader`, `ImageFilter`,
//! `Picture`) but **must not accept a `&Canvas` parameter from the
//! caller**. A `&Canvas` parameter is a paint-time concept and
//! belongs in `paint/`.
//!
//! Blink anchor: `core/layout/svg/layout_svg_resource_container.h`
//! defines `LayoutSVGResourceContainer` as the polymorphic base for
//! every resource type. Each subclass overrides a different
//! "produce realized X for client C" entry point. We model the same
//! shape with a generic associated type.
//!
//! Today this trait is intentionally not yet wired through every
//! resource. The trait definition locks the contract so future impls
//! can be added without API churn.

use skia_safe::Rect;

/// Uniform resource-container contract. Each impl picks its own
/// `Realized` type — `Shader` for gradients/patterns, `Path` for
/// clippers, `MaskInvocation` for maskers, etc.
pub trait SvgResourceContainer {
    /// The realized output type. Always a Skia value or operation
    /// type, never `()`. The realized form is what paint consumes.
    type Realized;

    /// Realize the resource for a referencing client. `client_bbox`
    /// is the client's object bounding box (used by `objectBoundingBox`-
    /// unit resolution).
    fn realize(&self, client_bbox: Rect) -> Self::Realized;
}
