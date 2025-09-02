# Grida Canvas Font Generation

A specialized crate for generating fonts from various sources, with a focus on PNG to font conversion for emoji and bitmap fonts.

## 🎯 Features

- **PNG Processing**: Extract PNG data and dimensions for font generation
- **CBDT/CBLC Tables**: Generate color bitmap font tables (like Apple Color Emoji)
- **Font Validation**: Comprehensive font validation using multiple libraries
- **TTF Generation**: Create functional TTF font files
- **WASM Ready**: Designed for web and native environments

## 🚀 Quick Start

### Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
grida-canvas-fontgen = { path = "crates/grida-canvas-fontgen" }
```

### Basic Usage

```rust
use grida_canvas_fontgen::fontgen::{
    DynFontManager, FontFamily, FontGlyph, PngProcessor
};

// Create a font manager
let mut manager = DynFontManager::new();

// Create a font family
manager.create_family("My Emoji Font".to_string(), "Regular".to_string())?;

// Add PNG-based glyphs
let png_data = include_bytes!("emoji.png");
let glyph = FontGlyph::new('😀', png_data.to_vec());
manager.add_glyph("My Emoji Font", glyph)?;

// Generate TTF font
let ttf_data = manager.generate_font("My Emoji Font")?;
std::fs::write("emoji_font.ttf", ttf_data)?;
```

## 📁 Project Structure

```
src/
├── lib.rs                 # Main library entry point
├── fontgen/              # Core font generation logic
│   ├── mod.rs            # Main font generation module
│   ├── png_processor.rs  # PNG data extraction
│   ├── cbdt_cblc.rs      # Color bitmap table generation
│   └── font_validator.rs # Font validation utilities
├── bin/                  # Binary utilities
│   └── font_validator.rs # Font validation tool
examples/                 # Usage examples
├── golden_type_emoji_fontgen.rs  # Main emoji font example
goldens/                  # Test output images
benches/                  # Performance benchmarks
```

## 🔧 Examples

### Emoji Font Generation

Run the main example to generate an emoji font:

```bash
cargo run --example golden_type_emoji_fontgen
```

This will:

1. Load PNG emoji data from fixtures
2. Create a font family with all emojis
3. Generate a TTF file with CBDT/CBLC tables
4. Create a golden test image showing the rendered font

### Font Validation

Validate generated fonts using multiple libraries:

```bash
cargo run --bin font_validator -- path/to/font.ttf
```

## 🏗️ Architecture

### Core Components

- **`DynFontManager`**: Manages multiple font families and glyphs
- **`FontFamily`**: Represents a collection of related glyphs
- **`FontGlyph`**: Individual character with metrics and image data
- **`PngProcessor`**: Extracts PNG dimensions and data
- **`CbdtGenerator`**: Creates CBDT (Color Bitmap Data) tables
- **`CblcGenerator`**: Creates CBLC (Color Bitmap Location) tables
- **`FontValidator`**: Validates fonts using multiple libraries

### Font Table Structure

The generated fonts include these OpenType tables:

- **CBDT**: Contains actual PNG image data
- **CBLC**: Provides glyph metrics and location info
- **cmap**: Character to glyph mapping
- **name**: Font naming information
- **OS/2**: Typography metrics
- **post**: PostScript data

## 🧪 Testing

### Run Examples

```bash
# Generate emoji font
cargo run --example golden_type_emoji_fontgen

# Validate fonts
cargo run --bin font_validator
```

### Run Tests

```bash
cargo test
```

### Run Benchmarks

```bash
cargo bench
```

## 📚 Dependencies

- **`png`**: PNG image processing
- **`write-fonts`**: Font table construction and serialization
- **`read-fonts`**: Font parsing and validation
- **`ttf-parser`**: Additional TTF validation
- **`skia-safe`**: Graphics rendering (for examples)

## 🎨 Use Cases

- **Emoji Fonts**: Convert PNG emojis to color bitmap fonts
- **Icon Fonts**: Create icon fonts from PNG images
- **Custom Fonts**: Generate fonts with embedded image data
- **Font Validation**: Test and validate font files
- **Font Research**: Study font structure and table formats

## 🔍 Font Validation

The crate provides comprehensive font validation using:

1. **read-fonts**: Primary font parsing and validation
2. **ttf-parser**: Additional TTF-specific validation
3. **write-fonts**: Font structure validation

### Validation Results

- ✅ **Valid Fonts**: All validators pass
- ⚠️ **Partial Fonts**: Some validators pass, others fail
- ❌ **Broken Fonts**: All validators fail

## 🚧 Current Status

### ✅ Working Features

- PNG data extraction and processing
- CBDT/CBLC table generation
- Basic TTF structure creation
- Font validation framework
- Example emoji font generation

### 🔄 In Progress

- Complete OpenType table compliance
- Advanced glyph metrics calculation
- Vector glyph generation
- Font optimization

### 📋 TODO

- Add missing core tables (`head`, `maxp`, `hhea`, `loca`)
- Implement proper checksum calculation
- Add font hinting support
- Optimize for WASM bundle size
- Add more font format support

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests and examples
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🔗 Related Projects

- [Grida Canvas](https://github.com/grida-ai/grida): Main graphics library
- [write-fonts](https://github.com/google/fontations): Font generation library
- [read-fonts](https://github.com/google/fontations): Font parsing library
