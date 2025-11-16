# SVG Reftest Testing

The `reftest` command in `grida-dev` provides a testing framework for evaluating SVG rendering accuracy by comparing rendered outputs against reference images.

## Overview

The reftest system:

- Renders SVG files to PNG at the target reference size (scaled using camera zoom)
- Compares rendered outputs with reference PNG images using the `dify` crate
- Calculates similarity scores (0.0 to 1.0) and difference percentages
- Generates comprehensive JSON reports with metrics
- Creates visual diff images (`d.png`) when differences are detected
- Organizes results into score-based categories

This is a **scoring system**, not a pass/fail assertion framework. It provides metrics to evaluate the current state of SVG rendering implementation.

## Prerequisites

- Test suite directory with:
  - SVG input files (can be nested, supports glob patterns)
  - Reference PNG images matching the SVG structure
- Optional: `reftest.toml` configuration file in the test suite directory

## Usage

### Basic Usage

```bash
cargo run -p grida-dev -- reftest \
  --suite-dir fixtures/local/W3C_SVG_11_TestSuite
```

This will:

- Load `reftest.toml` from the suite directory if present
- Discover all SVG/PNG test pairs
- Render each SVG to PNG at the reference PNG size
- Compare with reference images using `dify`
- Generate output files organized by score categories
- Generate a `report.json` in the output directory

### Output Directory

Default output directory: `target/reftests/{suite_name}`

The suite name is determined by:

1. `[test].name` in `reftest.toml` (if present)
2. The directory name of `--suite-dir` (fallback)

Override with `--output-dir`:

```bash
cargo run -p grida-dev -- reftest \
  --suite-dir fixtures/local/W3C_SVG_11_TestSuite \
  --output-dir custom-output
```

The output directory is cleared on each run by default. Use `--no-overwrite` to prevent accidental overwrites.

### Filtering Tests

Run only specific test categories:

```bash
cargo run -p grida-dev -- reftest \
  --suite-dir fixtures/local/W3C_SVG_11_TestSuite \
  --filter "shapes-*"
```

The filter uses simple pattern matching:

- `--filter "shapes-*"` - All tests starting with "shapes-"
- `--filter "gradient"` - Tests containing "gradient" in name

## Command-Line Options

| Option                | Required | Description                                                          |
| --------------------- | -------- | -------------------------------------------------------------------- |
| `--suite-dir <path>`  | Yes      | Path to test suite directory                                         |
| `--output-dir <path>` | No       | Directory for output files (default: `target/reftests/{suite_name}`) |
| `--filter <pattern>`  | No       | Filter test files by pattern (e.g., "shapes-\*")                     |
| `--threshold <float>` | No       | Dify threshold in YIQ space (default: 0.0, strict)                   |
| `--aa`                | No       | Enable anti-aliasing detection (default: off)                        |
| `--bg <white\|black>` | No       | Background to composite before diffing (default: black)              |
| `--overwrite`         | No       | Overwrite existing output directory (default: true)                  |
| `--no-overwrite`      | No       | Exit if output directory exists                                      |

## Output Structure

Output files are organized into score-based subdirectories:

- `S99/` - Similarity score ≥ 99%
- `S95/` - Similarity score ≥ 95% and < 99%
- `S90/` - Similarity score ≥ 90% and < 95%
- `S75/` - Similarity score < 90%
- `err/` - Rendering or comparison errors

Each test produces three files in its category directory:

- `{test-name}.current.png` - Actual rendering (our output)
- `{test-name}.expected.png` - Expected/reference image (from the suite)
- `{test-name}.diff.png` - Visual diff image (only generated when differences detected)

A `report.json` file is generated at the root of the output directory.

### Background Compositing

The diff comparer composites images over a solid background before pixel diffing to avoid transparency-related false positives.

- Default background: `black` (`--bg black`)
- For SVG test suites with black text, `--bg white` improves text-edge sensitivity
- Recommendation: use `--bg white` for SVG tests unless a specific test suite requires another color

Example:

```bash
cargo run -p grida-dev -- reftest \
  --suite-dir fixtures/local/W3C_SVG_11_TestSuite \
  --bg white
```

### Report Format

The `report.json` contains:

- `total`: Total number of tests executed
- `average_similarity`: Average similarity score across all tests (0.0-1.0)
- `min_similarity`: Lowest similarity score found
- `max_similarity`: Highest similarity score found
- `timestamp`: Unix timestamp when report was generated
- `suite_dir`: Path to the test suite directory
- `output_dir`: Path to the output directory
- `tests`: Array of individual test results

Each test result contains:

- `test_name`: Name of the test (without extension)
- `similarity_score`: Similarity score from 0.0 (completely different) to 1.0 (identical)
- `diff_percentage`: Percentage of pixels that differ (0.0-100.0)
- `output_png`: Path to `{test-name}.current.png`
- `diff_png`: Path to `{test-name}.diff.png` (null if not generated)
- `error`: Error message if test failed (null if successful)

### Interpreting Scores

- **similarity_score = 1.0**: Perfect match (identical rendering)
- **similarity_score ≥ 0.99**: Excellent match (S99 category)
- **similarity_score ≥ 0.95**: Very good match (S95 category)
- **similarity_score ≥ 0.90**: Good match (S90 category)
- **similarity_score < 0.90**: Needs improvement (S75 category)
- **similarity_score = 0.0**: Complete mismatch or error (err category)

## Configuration via `reftest.toml`

Place a `reftest.toml` in your test suite directory to configure test discovery and comparison settings.

### Configuration Structure

```toml
[test]
# Directory-friendly name (used for default output folder)
name = "W3C_SVG_11_TestSuite"

# Currently only "svg" is supported
type = "svg"

# Glob pattern for SVG inputs (relative to this file)
# ALWAYS USE A GLOB to handle nested directories
inputs = "svg/**/*.svg"

# Directory containing expected PNG files (relative to this file)
# PNGs should mirror the SVG structure (same relative paths, .png extension)
expects = "png"

# Background to composite before diffing: "black" or "white"
bg = "white"

[test.diff]
# Anti-aliasing detection (when true, AA pixels are not counted as diffs)
aa = true

# Dify threshold in YIQ space (0.0 = strict, count any difference)
threshold = 0.0
```

### Configuration Resolution

Settings are resolved in this order (later takes precedence):

1. `reftest.toml` defaults
2. Command-line arguments override config values

### Glob Patterns

The `inputs` field supports glob patterns to discover SVG files in nested directories:

- `svg/**/*.svg` - All SVG files recursively under `svg/`
- `scalable/**/*.svg` - All SVG files recursively under `scalable/`
- `svg/*.svg` - SVG files directly in `svg/` (no recursion)

Expected PNG paths are computed by:

1. Stripping the static prefix from the glob pattern
2. Mirroring the relative path structure into the `expects` directory
3. Changing the extension to `.png`

Example: If `inputs = "scalable/**/*.svg"` and `expects = "256x256"`, then `scalable/actions/open.svg` maps to `256x256/actions/open.png`.

## Rendering Behavior

- SVG content is rendered at the target reference PNG size using camera zoom scaling
- The renderer fits the scene bounds into the target dimensions while maintaining aspect ratio
- Images are composited over the specified background color before comparison

## Examples

### Run All Tests

```bash
cargo run -p grida-dev -- reftest \
  --suite-dir fixtures/local/W3C_SVG_11_TestSuite
```

### Test Only Shape Rendering

```bash
cargo run -p grida-dev -- reftest \
  --suite-dir fixtures/local/W3C_SVG_11_TestSuite \
  --filter "shapes-*"
```

### Test with White Background

```bash
cargo run -p grida-dev -- reftest \
  --suite-dir fixtures/local/W3C_SVG_11_TestSuite \
  --bg white \
  --threshold 0
```

### Custom Output Directory

```bash
cargo run -p grida-dev -- reftest \
  --suite-dir fixtures/local/W3C_SVG_11_TestSuite \
  --output-dir my-results \
  --no-overwrite
```

## Troubleshooting

### "SVG directory not found" or "PNG directory not found"

- Ensure the `--suite-dir` points to the correct test suite directory
- Verify that `inputs` and `expects` paths in `reftest.toml` are correct
- Check that glob patterns match your directory structure

### "Running 0 tests"

- Verify that `inputs` in `reftest.toml` uses a glob pattern (e.g., `svg/**/*.svg`)
- Ensure expected PNG files exist at the mirrored paths
- Check that the glob pattern matches your SVG file locations

### Rendering errors

- Check that SVG files are valid
- Some SVG features may not be fully supported yet
- Review the error message in `report.json` for details
- Failed tests are placed in the `err/` directory

### Low similarity scores

- This is expected for features not yet implemented
- Use diff images (`d.png`) to understand what's different
- Focus on improving high-priority features first
- Consider adjusting `--threshold` or `--aa` settings

### Missing diff.png files

- Diff images are only generated when `dify` detects differences
- If images are identical or differences are below threshold, no diff is generated
- This is expected behavior, not an error

## Integration with CI/CD

The reftest command can be integrated into CI/CD pipelines:

```bash
# Run tests
cargo run -p grida-dev -- reftest \
  --suite-dir fixtures/local/W3C_SVG_11_TestSuite \
  --output-dir ci-results

# Parse report.json to extract metrics
# Track similarity scores over time
# Set minimum thresholds for specific test categories
```

Since this is a scoring system, you may want to:

- Track similarity scores over time
- Set minimum thresholds for specific test categories
- Generate trend reports from multiple runs
- Monitor the distribution across score categories (S99, S95, S90, S75)

## See Also

- `crates/grida-dev/reftest.example.toml` for a configuration template
- Test suite configurations in `fixtures/local/*/reftest.toml`
