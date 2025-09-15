# WASM API Validation Tests

This directory contains tests for validating the WASM bindings API.

## Purpose

These tests validate that:

1. All expected functions from `main.rs` are properly exposed in the WASM module
2. Functions have the correct parameter counts
3. Runtime methods (GL, HEAP arrays, UTF8 functions) are available
4. Basic type safety is maintained

## Prerequisites

Before running tests, ensure the WASM module is built:

```bash
# Build the WASM module
just build

# Or for development
just dev
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test api-validation.test.ts
```

## Test Structure

- `api-validation.test.ts` - Main API validation tests
- `setup.ts` - Jest setup and mocks

## What the Tests Check

### Function Existence

- Verifies all functions from `main.rs` are exposed
- Checks function parameter counts match expectations
- Validates function types are correct

### Runtime Methods

- GL context management
- HEAP array access
- UTF8 string conversion
- Memory management functions

### Type Safety

- Return type validation for key functions
- Parameter type checking
- Basic function call validation

## Adding New Tests

When adding new functions to `main.rs`:

1. Add the function to `EXPECTED_FUNCTIONS` array in `api-validation.test.ts`
2. Include the correct parameter count
3. Add any specific type validation if needed
4. Run tests to ensure the new function is properly exposed

## Notes

- These tests focus on API validation, not behavior testing
- Tests require the actual WASM module to be loaded
- Some tests may be skipped if WASM module fails to load
- Test timeout is set to 30 seconds for WASM loading
