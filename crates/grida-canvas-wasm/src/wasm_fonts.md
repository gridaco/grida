### WASM Bindings (with `wasm_bind` feature)

#### `WasmFontAnalysisResult`

WASM response structure for font family analysis.

```rust
pub struct WasmFontAnalysisResult {
    pub success: bool,
    pub family_name: String,
    pub axes: Vec<WasmFontFamilyAxis>,        // Family-level axes
    pub has_italic: bool,
    pub has_upright: bool,
    pub strategy: String,
    pub scenario: String,
    pub recipe_count: usize,
    pub faces: Vec<WasmFaceInfo>,             // Face-level information with instances
    pub styles: Vec<WasmFontStyleInstance>,   // UI-friendly font style instances
}
```

#### `WasmFaceInfo`

WASM response structure for individual font face information.

```rust
pub struct WasmFaceInfo {
    pub face_id: String,
    pub family_name: String,
    pub subfamily_name: String,
    pub postscript_name: String,
    pub weight_class: u16,
    pub width_class: u16,
    pub is_variable: bool,
    pub axes: Vec<WasmFontAxis>,              // Face-specific axes with defaults
    pub instances: Option<Vec<WasmFontInstance>>, // Variable font instances
    pub features: Vec<WasmFontFeature>,
}
```

#### `WasmFontStyleInstance`

WASM response structure for font style instances.

```rust
pub struct WasmFontStyleInstance {
    pub name: String,                         // User-friendly style name
    pub postscript_name: Option<String>,      // PostScript name (may be None)
    pub italic: bool,                         // Whether this style is italic
    pub weight: u16,                          // Weight class (100-900)
}
```

### WASM Communication

The library provides WASM bindings for web integration. The WASM API exposes the same high-level functionality with JSON serialization:

```rust
// WASM functions are automatically available:
// - _grida_fonts_analyze_family: Analyze font family with multiple faces
// - _grida_fonts_parse_font: Parse single font file

// The WASM API returns JSON with the same structure as UIFontFamilyResult:
// {
//   "success": true,
//   "family_name": "Inter",
//   "axes": [...],           // Family-level axes
//   "has_italic": true,
//   "has_upright": true,
//   "strategy": "DualVariableFonts",
//   "scenario": "DualVf",
//   "recipe_count": 2,
//   "faces": [...],          // Face-level information with instances
//   "styles": [...]          // UI-friendly font style instances
// }
```
