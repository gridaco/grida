# @grida/reftest

General-purpose, language-agnostic reference-test CLI and library for
image-based visual comparison. Canonical diff/score/report implementation
for the Grida project; peer of `grida-dev reftest` (Rust, SVG-specific).

Non-goals: rendering, format parsing, watch mode, JUnit/TAP output,
multi-suite orchestration.

## CLI

```sh
# Single-pair compare — exits non-zero if similarity is below the threshold.
reftest compare actual.png expected.png --threshold 0.1 --bg white

# Suite mode — reads reftest.toml / reftest.json from --suite-dir.
reftest --suite-dir ./fixtures/my-suite

# Ad-hoc pair mode — two directories, no config file.
reftest \
  --actual-dir   out/refig-standard/renders \
  --expected-dir fixtures/local/refig/refig-standard/exports \
  --output-dir   target/reftests/refig-standard
```

The suite runner is a **scoring tool**, not a pass/fail gate: it always
exits 0 on completion. Wrap it in `jq '.average_similarity > 0.9'` if
you need a gate. The `compare` subcommand is the exception — it exits
non-zero when similarity is below `(1 - threshold)`, for ergonomic use
in shell pipes.

### Output layout

```
<output-dir>/
├── S99/<test>.{current,expected,diff}.png   ≥ 0.99
├── S95/…                                     ≥ 0.95
├── S90/…                                     ≥ 0.90
├── S75/…                                     < 0.90
├── err/                                      dimension mismatch / no oracle
└── report.json
```

`report.json` matches the schema produced by the Rust `grida-dev reftest`
tool exactly (snake_case field names). See
`crates/grida-dev/src/reftest/report.rs`.

## Programmatic API

Option 1: file-based — actuals already on disk.

```ts
import { reftest } from "@grida/reftest";

const report = await reftest({
  name: "refig-standard",
  expectedDir: "./exports",
  actualDir: "./renders",
  outputDir: "./target/reftests/refig-standard",
  diff: { threshold: 0.1, aa: true },
  scoring: { mask: "alpha" },
  bg: "white",
});

console.log(`average similarity: ${report.averageSimilarity}`);
```

Option 2: callback-based — render in-process.

```ts
import { reftest } from "@grida/reftest";

const report = await reftest({
  name: "my-suite",
  expectedDir: "./exports",
  outputDir: "./target/reftests/my-suite",
  renderOne: async (testCase) => {
    // testCase.name is the filename stem, e.g. "1_5216"
    // testCase.expectedPath / testCase.expectedSize tell you what to render
    return await renderMyThing(testCase); // return a Buffer of PNG bytes
  },
});
```

The callback path is implemented literally as "write renderOne outputs
to a scratch dir, then call the file-based runner" — there is no
separate in-memory scoring code path. This guarantees CLI and library
produce byte-identical reports.

Ad-hoc single-pair compare:

```ts
import { compare } from "@grida/reftest";

const result = await compare({
  actual: "./a.png",
  expected: "./b.png",
  threshold: 0.1,
});
// → { similarity, diffPercentage, diffPixels, totalPixels, width, height, error }
```

## Config file

`reftest.toml` or `reftest.json` in the suite directory. CLI flag values
override config values.

```toml
[test]
name    = "refig-standard"
inputs  = "renders/**/*.png"        # glob under suite-dir for actuals
expects = "exports"                  # expected PNGs dir under suite-dir
bg      = "white"

[test.diff]
aa        = true
threshold = 0.1

[test.scoring]
mask = "alpha"
```

## Scoring

Mirrors `crates/grida-dev/src/reftest/compare.rs` exactly:

```
scoring_pixels = mask === "alpha"
  ? count(actual.a > 0 OR expected.a > 0)
  : width * height

similarity_score = 1 - min(diff_pixels / scoring_pixels, 1.0)
diff_percentage  = (diff_pixels / scoring_pixels) * 100
```

Both values are clamped to `[0.0, 1.0]` and `[0.0, 100.0]` respectively.
An enforced parity test (`__tests__/parity.test.ts`) asserts the TS
scores stay within ±0.005 of the Rust tool on committed fixture pairs.

## Intentional divergence from Rust

- **Default threshold** — `0.1` here vs `0.0` in Rust. Rationale:
  pixelmatch at `0.0` counts any YIQ delta > 0 as a diff, which is too
  strict for any cross-rasterizer comparison. Rust's dify at `0.0` is
  actually not as strict as pixelmatch at `0.0` (different internal
  threshold semantics), so "the same `0.0`" is a fiction anyway. The
  `compare` subcommand and the suite runner both default to `0.1`;
  pass `--threshold 0` for strict mode.
- **Default background** — `white` vs Rust's `black`. Matches the typical
  "renderer on a white page" expectation for design-tool output.

## Dev

```sh
pnpm --filter @grida/reftest test        # vitest run
pnpm --filter @grida/reftest typecheck   # tsc --noEmit
pnpm --filter @grida/reftest build       # emits ./dist via tsc
```

The M4 parity test (`__tests__/parity.test.ts`) needs the Rust binary at
`<repo>/target/debug/grida-dev`. Run `cargo build -p grida-dev` once to
enable it; it skips cleanly if the binary is missing.
