# Agent Documentation

This document contains technical information for AI agents and developers working on the `fonts` crate.

## Testing

Run the test suite:

```bash
# All tests
cargo test

# With serde feature
cargo test --features serde

# Specific test categories
cargo test --test italic_level1
cargo test --test scenario_1_one_static
cargo test --test serde_test
```

### Test Categories

- **`italic_level1.rs`**: Core font selection and italic detection tests
- **`scenario_*.rs`**: Comprehensive scenario-specific tests
- **`italic_name_checking.rs`**: Name-based italic detection tests
- **`serde_test.rs`**: JSON serialization tests
- **`scenario_level2_*.rs`**: Level 2+ placeholder and limitation tests
- **`ui_parser_test.rs`**: High-level UI API tests (now using `parse_ui`)
- **`get_*_test.rs`**: Style matching and face retrieval tests

## Dependencies

### Required

- `ttf-parser = "0.25"` - Font parsing backend

### Optional

- `serde = "1.0"` (with `derive` feature) - JSON serialization
- `serde_json = "1.0"` (dev-dependency) - JSON testing

## Related Documentation

- **[Working Group: Italic Implementation](../docs/wg/feat-paragraph/impl-italic.md)** - Technical specification and implementation details
- **[Reference: Italic Fonts](../docs/reference/italic-fonts.md)** - Font family scenarios and examples
- **[Working Group: Canvas Architecture](../docs/wg/)** - Overall canvas system design

## Changelog

### v0.1.0

- **Complete Font Selection Pipeline** - Implements Blink (Chrome) font selection model
- **Modular Architecture** - Clean separation into `parse`, `selection`, `selection_italic`, `parse_ui`, and `serde` modules
- **High-Level UI API** - User-friendly interface for design tool integration
- **Core Font Selection** - Advanced font selection logic with family aggregation
- **Variable Font Support** - Full support for `fvar` and `STAT` tables
- **True Italic Detection** - Reliable italic classification using OS/2 bits and variable font axes
- **JSON Serialization** - WASM-ready serialization for web integration
- **Comprehensive Testing** - 100+ tests covering all scenarios and edge cases
- **Backward Compatibility** - Legacy API support for existing code
- **Performance Optimized** - Zero-copy parsing with minimal allocations
