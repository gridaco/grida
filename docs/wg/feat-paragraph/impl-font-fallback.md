# Paragraph - `font-fallback`

| feature id      | status        | description                                              |
| --------------- | ------------- | -------------------------------------------------------- |
| `font-fallback` | not supported | support font fallback in both implicit and explicit mode |

Font fallback is a mechanism used to ensure that text is displayed correctly even when the primary font does not contain glyphs for certain characters. When rendering text, the system first attempts to use the specified primary font. If the font lacks glyphs for some characters, the fallback mechanism searches through a list of alternative fonts to find one that supports those missing glyphs. This process can be implicit, where the system automatically selects fallback fonts based on language and script, or explicit, where specific fallback fonts are provided. The goal is to provide seamless text rendering without visual gaps or missing characters, maintaining the intended appearance and readability across diverse languages and symbols.

---

## Implementation - Level 1

Level 1 exposes a dedicated option for fallback order and blindly passes the specified fonts to Skia. Skia handles the fallback internally, which works well with wide coverage fonts such as Noto Sans CJK. This is the initial supported level.

### Goal

**Implicit fallback** - operates like a browser, automatically selecting fallback fonts when the primary font lacks glyphs. If the fallback fonts are consistent across platforms, this approach provides consistent rendering output.

**Problem**: Since we cannot determine which fonts are actually needed for a given text, the system must load all reasonable fallback fonts upfront. This leads to unnecessary memory and storage consumption, as many fonts may never be used.

```rust
/// Font fallback manager for Level 1 implementation
/// Handles basic font loading and fallback configuration
impl Interface {
    /// Load a font from the given source (file path, bytes, etc.)
    /// Returns true if the font was successfully loaded and registered
    pub fn load_font(&mut self, source: FontSource) -> bool;

    /// List all available font names that can be used for fallback
    /// Returns a collection of font family names
    pub fn list_available_fonts(&self) -> Vec<String>;

    /// Set the default fallback fonts by their family names
    /// These fonts will be used in order when primary font lacks glyphs
    pub fn set_default_fallback_fonts(&mut self, font_names: Vec<String>);

    /// Get the current default fallback fonts by their family names
    /// Returns the ordered list of fallback fonts
    pub fn get_default_fallback_fonts(&self) -> Vec<String>;
}
```

## Implementation - Level 2

Level 2 involves the engine detecting missing glyphs and exposing APIs to the editor/frontend to identify which characters require additional font loading. It resolves all fallback fonts explicitly before passing the text to Skia. This approach implies persistence, as the fallback information needs to be stored in the design document. The benefit is that designs render identically across platforms as long as the fallback set remains stable.

### Goal

**Explicit fallback** - exposes full APIs for testing and resolving text/font relationships in an explicit manner. This approach aims to provide the capability for clients to specify the exact fonts for missing characters, ensuring a persistent storage model that maintains design consistency across different environments.

```rust
/// Font fallback manager for Level 2 implementation
/// Provides advanced glyph analysis and explicit font resolution
impl Interface {
    // ... existing Level 1 methods ...

    /// Analyze which characters in the given text cannot be rendered
    /// with the current font set. Returns analysis result for editor use.
    /// Editor will use this to find/load/fetch fonts from server and register them.
    pub fn analyze_character_font_availability(&self, text: &str, primary_font: &str) -> FontAvailabilityAnalysis;

    /// Get characters that will be resolved by the given analysis result
    /// This helps the editor understand which characters need font resolution
    /// before rendering to ensure all runs explicitly have a font assigned.
    pub fn get_characters_for_resolution(&self, analysis: &FontAvailabilityAnalysis) -> Vec<char>;
}
```

---

## Implementation - Status

Level 1 will be supported. Level 2 is not planned.

## See Also

- [Grida Canvas Editor Default Fonts](../../editor/canvas-languages-and-fonts.md)
