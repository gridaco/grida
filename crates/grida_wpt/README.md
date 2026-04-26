# grida_wpt

Rendering-test harness for the Grida Canvas (`cg`) crate.

**Two consumers:**

- the in-tree **refbrowser pipeline** — Chromium-parity checks on L0
  fixtures. Invoked via `grida_wpt render --suite …`. See
  [cg-reftest skill](../../.agents/skills/cg-reftest/SKILL.md).
- the upstream **Web Platform Tests** — spec-conformance checks
  driven by `wptrunner` calling `grida_wpt render --url …`. Plugin
  lives in the [`gridaco/wpt`](https://github.com/gridaco/wpt) fork;
  setup in [docs/contributing/wpt.md](../../docs/contributing/wpt.md).

Kept intentionally headless: **no winit/glutin/GL deps**. External
runners (Playwright TS, `wptrunner` Python, CI workers) can invoke
the binary without pulling a GUI toolchain.

The crate is named for its strategic anchor (WPT) but is expected to
grow to host adjacent test infra — the existing SVG reftest runner,
refig suites, and future paint reftests — as they are promoted out of
`grida_dev`.

## Usage

### Suite mode (matches the in-tree L0 refbrowser pipeline)

```sh
cargo run -p grida_wpt -- render \
  --suite   fixtures/test-html/suites/L0.exact.json \
  --out-dir target/refbrowser/L0.exact/actual
```

### Single fixture / directory

```sh
cargo run -p grida_wpt -- render --fixture path/to/test.html
cargo run -p grida_wpt -- render --dir     path/to/fixtures/
```

### URL mode (used by wptrunner)

```sh
cargo run -p grida_wpt -- render \
  --url http://127.0.0.1:8000/css/css-transforms/2d-rotate-001.html \
  --out /tmp/test.png \
  --width 800 --height 600
```

The executor in the [WPT fork](https://github.com/gridaco/wpt) shells
out to this mode once per reftest screenshot. External resources
(`<link rel="stylesheet">`, `<img src>`) are **not** resolved yet.

### Output

Default output directory: `${TMPDIR}/grida-htmlcss-goldens/`. Pass
`--out-dir` to override.

## Suite JSON schema

Shared with the TypeScript oracle
(`.agents/skills/cg-reftest/scripts/refbrowser_render.ts`) and
existing suite files at `fixtures/test-html/suites/*.json`.

```json
{
  "defaults": {
    "viewport": { "width": 600, "height": 800 },
    "extra_css": ["../_reftest/hide-text.css"]
  },
  "fixtures": [
    {
      "path": "../L0/box-dimensions.html",
      "viewport": { "width": 600, "height": 522 }
    }
  ]
}
```

Per-fixture entries inherit and override `defaults`. Paths resolve
relative to the suite file. Unknown fields (`gate`, `wait_for`,
`full_page`, `name`, `description`) are consumed by other tools and
ignored here.
