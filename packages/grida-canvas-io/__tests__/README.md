# Grida Canvas IO Tests

This directory contains comprehensive tests for the `grida-canvas-io` package, specifically focusing on the archive functionality with image support.

## Test Files

### `archive.test.ts`

Comprehensive tests for the archive functionality with real image files:

- **Pack with mock data**: Basic document packing with simple mock images
- **Pack with real files**: Packing with actual PNG, JPG, and large image files from fixtures
- **Unpack with mock data**: Unpacking and data integrity verification with mock images
- **Unpack with real files**: Unpacking with real image files and byte-perfect verification
- **Round-trip with mock data**: Complete pack/unpack cycles with mock data
- **Round-trip with real files**: Complete pack/unpack cycles with real files
- **ZIP file detection**: Validating ZIP file structure and magic numbers
- **Performance**: Testing with large files (4K, 8K images) and performance benchmarks
- **File size analysis**: Archive size analysis for different file types
- **Edge cases**: Empty images, undefined parameters, large data, special filenames
- **ZIP structure validation**: Validating proper ZIP file creation

### `clipboard.test.ts`

Tests clipboard functionality:

- Clipboard data encoding/decoding
- Browser compatibility
- Error handling

## Running Tests

### Using pnpm (Recommended)

```bash
# From the package directory
pnpm test

# Or run specific test files
pnpm test -- archive.test.ts
pnpm test -- clipboard.test.ts

# Run with specific test patterns
pnpm test -- --testNamePattern="archive comprehensive"
```

### Using turbo (Monorepo)

```bash
# From the root directory
pnpm turbo test --filter='./packages/grida-canvas-io'

# Run specific test patterns
pnpm turbo test --filter='./packages/grida-canvas-io' -- --testNamePattern="archive comprehensive"
```

### Using other test runners

The tests are written in standard Jest format and should work with:

- Jest
- Vitest
- Node.js built-in test runner
- Any other Jest-compatible test framework

## Test Coverage

The tests cover:

### Archive Functions

- ✅ `pack()` with optional images parameter
- ✅ `unpack()` with image extraction
- ✅ ZIP file structure validation
- ✅ Data integrity preservation
- ✅ Round-trip pack/unpack cycles
- ✅ Performance with large files (4K, 8K images)

### Real File Testing

- ✅ PNG files from fixtures
- ✅ JPG files from fixtures
- ✅ Large image files (4K, 8K)
- ✅ Mixed file types
- ✅ Byte-perfect data integrity

### Edge Cases

- ✅ Empty images object
- ✅ Undefined images parameter
- ✅ Large image files
- ✅ Special characters in filenames
- ✅ Multiple pack/unpack cycles
- ✅ ZIP file detection and validation

### Clipboard Functions

- ✅ Clipboard data encoding/decoding
- ✅ Browser compatibility
- ✅ Error handling

## Test Data

The tests use both mock and real data:

### Mock Data

- **Document**: Complete document structure with nodes, scenes, and bitmaps
- **Images**: Simple mock binary data for basic testing
- **Bitmaps**: Processed bitmap data with dimensions

### Real Fixture Data

- **PNG Images**: `checker.png`, `stripes.png` from fixtures
- **JPG Images**: `1024.jpg`, `512.jpg`, `4k.jpg`, `8k.jpg` from fixtures
- **Large Files**: 4K and 8K images for performance testing
- **Mixed Types**: Combination of PNG and JPG files

## Browser vs Node.js

These tests are designed to run in Node.js environments without browser dependencies:

- Uses `MockFile` class instead of browser `File` API
- No DOM dependencies
- Pure JavaScript/TypeScript
- Compatible with CI/CD environments

## Test Artifacts

The tests generate ZIP artifacts for inspection:

- **Location**: `__tests__/artifacts/` directory
- **Files**: Various ZIP files with different content types
- **Purpose**: Manual inspection of archive structure and contents
- **Git**: Artifacts are ignored by git (see `.gitignore`)

### Generated Artifacts

- `document-without-images.zip` - Basic document structure
- `document-with-mock-images.zip` - Document with mock images
- `document-with-real-png.zip` - Document with real PNG files
- `document-with-real-jpg.zip` - Document with real JPG files
- `document-with-large-files.zip` - Document with large images (4K, 8K)
- `document-with-mixed-files.zip` - Document with mixed file types

## Adding New Tests

When adding new functionality to the archive system:

1. **Add unit tests** to `archive.test.ts` for new functions
2. **Add clipboard tests** to `clipboard.test.ts` for clipboard functionality
3. **Update this README** with new test coverage
4. **Consider adding artifacts** for manual inspection if needed

## Test Structure

```typescript
describe("feature", () => {
  describe("basic functionality", () => {
    it("should handle normal case", () => {
      // Test implementation
    });
  });

  describe("edge cases", () => {
    it("should handle edge case", () => {
      // Test implementation
    });
  });
});
```

## Dependencies

The tests require:

- `@grida/schema` - For type definitions
- `@grida/cmath` - For bitmap types
- `fflate` - For ZIP compression
- `fast-png` - For PNG encoding/decoding
- `fast-xml-parser` - For XML parsing
- `image-size` - For image dimension detection and type inference

All dependencies are already included in the package.

## Performance Notes

The tests include performance benchmarks:

- **Large files**: 4K and 8K images for testing with substantial data
- **Time limits**: Performance tests have time constraints (5-15 seconds)
- **Memory usage**: Tests verify memory efficiency with large datasets
- **Archive sizes**: Console output shows archive sizes for different file types
