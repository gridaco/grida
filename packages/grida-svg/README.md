# @grida/svg

Grida-owned SVG tooling for parsing, transforming, and authoring SVG data.

The path-data layer is a parity port of [`svg-pathdata`](https://github.com/nfroidure/svg-pathdata) — same shape, same tests — exposed under `@grida/svg/pathdata`. Additional subpaths (`/parse`, `/parser`) cover SVG attribute strings and round-trip XML parsing. The root `@grida/svg` export is reserved for future SVG-wide APIs and does not re-export anything from the subpaths.

## Package layout

```txt
src/
  index.ts             # future root SVG-wide APIs; intentionally does not export path data
  pathdata/            # path[d] parser/encoder/transform implementation; kebab-case filenames
    __tests__/         # path-data parity tests, run with Vitest
  parse/               # SVG attribute-string parsing primitives (numbers, points, transform fragments)
    __tests__/
  parser/              # round-trip XML/SVG parser (preserves trivia for byte-equal save)
```

## Scripts

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm lint
pnpm fmt:check
```

## Current API

Each SVG domain is exposed through its own subpath so consumers only import what they need. The root `@grida/svg` export is reserved for future SVG-wide APIs and does not re-export anything from the subpaths.

### `@grida/svg/pathdata`

```ts
import { SVGPathData, encodeSVGPath } from "@grida/svg/pathdata";

const commands = new SVGPathData("M0 0L10 10").toAbs().commands;
const d = encodeSVGPath(commands);
```

### `@grida/svg/parse`

Pure SVG attribute-string parsing primitives. No DOM, no editor types — just regex-backed parsers for the fragments callers actually need (`number`, `points`, first `M` in a `d=`, leading `translate(...)` in a `transform=`).

```ts
import { svg_parse } from "@grida/svg/parse";

const pts = svg_parse.parse_points("10,20 30,40");
const move = svg_parse.parse_path_first_move("M 10 20 L 30 40");
```

### `@grida/svg/parser`

Minimal XML/SVG parser that preserves source trivia (attribute order, quote styles, whitespace, comments, prolog, doctype, namespace prefixes) so editors can round-trip `load(x) → serialize() === x` for trivial inputs.

```ts
import { parse_svg, type ParseResult } from "@grida/svg/parser";

const result: ParseResult = parse_svg(
  '<svg xmlns="http://www.w3.org/2000/svg" />'
);
```

## Upstream attribution

The initial path-data implementation and parity tests are derived from [svg-pathdata](https://github.com/nfroidure/svg-pathdata), originally authored by Nicolas Froidure and contributors, licensed under MIT. The original license is preserved in [LICENSE.svg-pathdata](./LICENSE.svg-pathdata).
