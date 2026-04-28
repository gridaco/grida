//! Host-facing render context for `htmlcss::svg`.
//!
//! The SVG renderer has three host dependencies: decoded images,
//! external stylesheets, and fonts. Keep them behind one SVG-owned
//! context so the rest of `htmlcss` does not grow SVG-specific public
//! API surface.

use crate::htmlcss::ImageProvider;

/// Resource loader for external CSS referenced by SVG `@import` rules.
///
/// The renderer does not fetch from disk or the network. Hosts that
/// support external stylesheets provide their own loader; hosts that
/// render sandboxed content use [`NoCss`].
pub trait CssLoader {
    /// Return the body of the stylesheet at `path`, or `None` if it
    /// cannot be resolved.
    fn get(&self, path: &str) -> Option<&str>;
}

/// Null CSS loader — every `@import` resolves to nothing.
pub struct NoCss;

impl CssLoader for NoCss {
    fn get(&self, _path: &str) -> Option<&str> {
        None
    }
}

/// Pre-loaded CSS provider backed by a `HashMap`.
pub struct PreloadedCss {
    sheets: std::collections::HashMap<String, String>,
}

impl PreloadedCss {
    pub fn new() -> Self {
        Self {
            sheets: std::collections::HashMap::new(),
        }
    }

    pub fn insert(&mut self, path: impl Into<String>, body: impl Into<String>) {
        self.sheets.insert(path.into(), body.into());
    }

    pub fn len(&self) -> usize {
        self.sheets.len()
    }

    pub fn is_empty(&self) -> bool {
        self.sheets.is_empty()
    }
}

impl Default for PreloadedCss {
    fn default() -> Self {
        Self::new()
    }
}

impl CssLoader for PreloadedCss {
    fn get(&self, path: &str) -> Option<&str> {
        self.sheets.get(path).map(|s| s.as_str())
    }
}

/// Host-supplied typeface resolver consulted by SVG text painting.
pub trait FontResolver {
    /// Resolve a single CSS `font-family` token at the given style.
    fn resolve(&self, family: &str, style: skia_safe::FontStyle) -> Option<skia_safe::Typeface>;

    /// Resolver-supplied default for missing or fully unresolved
    /// `font-family` lists.
    fn fallback(&self, style: skia_safe::FontStyle) -> Option<skia_safe::Typeface>;
}

/// System-font resolver.
pub struct SystemFonts;

impl FontResolver for SystemFonts {
    fn resolve(&self, family: &str, style: skia_safe::FontStyle) -> Option<skia_safe::Typeface> {
        skia_safe::FontMgr::default().match_family_style(family, style)
    }

    fn fallback(&self, style: skia_safe::FontStyle) -> Option<skia_safe::Typeface> {
        skia_safe::FontMgr::default().legacy_make_typeface(None, style)
    }
}

/// Pre-loaded font set backed by Skia's `TypefaceFontProvider`.
pub struct PreloadedFonts {
    provider: skia_safe::textlayout::TypefaceFontProvider,
    generics: std::collections::HashMap<String, String>,
    default_family: Option<String>,
    loader: skia_safe::FontMgr,
}

impl PreloadedFonts {
    pub fn new() -> Self {
        Self {
            provider: skia_safe::textlayout::TypefaceFontProvider::new(),
            generics: std::collections::HashMap::new(),
            default_family: None,
            loader: skia_safe::FontMgr::new(),
        }
    }

    pub fn register(&mut self, bytes: &[u8]) -> Option<String> {
        let tf = self.loader.new_from_data(bytes, None)?;
        let family = tf.family_name();
        self.provider.register_typeface(tf, Some(family.as_str()));
        Some(family)
    }

    pub fn register_as(&mut self, bytes: &[u8], family_alias: &str) -> bool {
        let Some(tf) = self.loader.new_from_data(bytes, None) else {
            return false;
        };
        self.provider.register_typeface(tf, Some(family_alias));
        true
    }

    pub fn set_generic(&mut self, generic: &str, family: &str) {
        self.set_alias(generic, family);
    }

    pub fn set_alias(&mut self, name: &str, target_family: &str) {
        self.generics
            .insert(name.to_ascii_lowercase(), target_family.to_string());
    }

    pub fn set_default_family(&mut self, family: &str) {
        self.default_family = Some(family.to_string());
    }
}

impl Default for PreloadedFonts {
    fn default() -> Self {
        Self::new()
    }
}

impl FontResolver for PreloadedFonts {
    fn resolve(&self, family: &str, style: skia_safe::FontStyle) -> Option<skia_safe::Typeface> {
        let name = match self.generics.get(&family.to_ascii_lowercase()) {
            Some(target) => target.as_str(),
            None => family,
        };
        self.provider.match_family_style(name, style)
    }

    fn fallback(&self, style: skia_safe::FontStyle) -> Option<skia_safe::Typeface> {
        let family = self.default_family.as_deref()?;
        self.provider.match_family_style(family, style)
    }
}

/// All host-owned resources visible to one SVG render pass.
#[derive(Clone, Copy)]
pub struct RenderContext<'a> {
    pub images: &'a dyn ImageProvider,
    pub css: &'a dyn CssLoader,
    pub fonts: &'a dyn FontResolver,
}

impl<'a> RenderContext<'a> {
    pub fn new(
        images: &'a dyn ImageProvider,
        css: &'a dyn CssLoader,
        fonts: &'a dyn FontResolver,
    ) -> Self {
        Self { images, css, fonts }
    }

    pub fn with_images(images: &'a dyn ImageProvider) -> Self {
        Self {
            images,
            css: &NoCss,
            fonts: &SystemFonts,
        }
    }
}

impl Default for RenderContext<'_> {
    fn default() -> Self {
        Self {
            images: &crate::htmlcss::NoImages,
            css: &NoCss,
            fonts: &SystemFonts,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{FontResolver, PreloadedFonts, SystemFonts};
    use skia_safe::FontStyle;

    fn geist_bytes() -> &'static [u8] {
        crate::embedded_fonts::geist::BYTES
    }

    #[test]
    fn registers_under_built_in_family_name() {
        let mut fonts = PreloadedFonts::new();
        let family = fonts.register(geist_bytes()).expect("font decoded");
        assert!(!family.is_empty());
        assert!(fonts.resolve(&family, FontStyle::normal()).is_some());
    }

    #[test]
    fn alias_overrides_built_in_family() {
        let mut fonts = PreloadedFonts::new();
        assert!(fonts.register_as(geist_bytes(), "MyAlias"));
        assert!(fonts.resolve("MyAlias", FontStyle::normal()).is_some());
    }

    #[test]
    fn unknown_family_returns_none() {
        let fonts = PreloadedFonts::new();
        assert!(fonts
            .resolve("Definitely Not Installed", FontStyle::normal())
            .is_none());
    }

    #[test]
    fn generic_keyword_forwards_to_bound_family() {
        let mut fonts = PreloadedFonts::new();
        let family = fonts.register(geist_bytes()).unwrap();
        fonts.set_generic("sans-serif", &family);
        assert!(fonts.resolve("sans-serif", FontStyle::normal()).is_some());
        assert!(fonts.resolve("SANS-SERIF", FontStyle::normal()).is_some());
        assert!(fonts.resolve("monospace", FontStyle::normal()).is_none());
    }

    #[test]
    fn set_alias_routes_lookups_to_target() {
        let mut fonts = PreloadedFonts::new();
        let family = fonts.register(geist_bytes()).unwrap();
        fonts.set_alias("Times New Roman", &family);
        assert!(fonts
            .resolve("Times New Roman", FontStyle::normal())
            .is_some());
        assert!(fonts
            .resolve("times new roman", FontStyle::normal())
            .is_some());
        assert!(fonts.resolve("Comic Sans", FontStyle::normal()).is_none());
    }

    #[test]
    fn fallback_returns_default_family_when_set() {
        let mut fonts = PreloadedFonts::new();
        let family = fonts.register(geist_bytes()).unwrap();
        assert!(fonts.fallback(FontStyle::normal()).is_none());
        fonts.set_default_family(&family);
        assert!(fonts.fallback(FontStyle::normal()).is_some());
    }

    #[test]
    fn system_fonts_consults_platform_fontmgr() {
        assert!(SystemFonts.fallback(FontStyle::normal()).is_some());
    }
}
