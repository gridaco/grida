# @grida/svg

Grida-owned SVG tooling for parsing, transforming, and authoring SVG data.

This package is being developed outside the main Grida monorepo first, then will be moved into the monorepo once the port is complete and verified. The first milestone preserves exact behavior and test coverage from `svg-pathdata` while exposing path-data-specific APIs only through `@grida/svg/pathdata`.

## Package layout

```txt
src/
  index.ts             # future root SVG-wide APIs; intentionally does not export path data
  pathdata/            # copied path[d] parser/encoder/transform implementation; kebab-case filenames
    __tests__/         # path-data parity tests, run with Vitest
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

Path data is intentionally exposed through a direct subpath export so consumers only import the SVG domain they need:

```ts
import { SVGPathData, encodeSVGPath } from "@grida/svg/pathdata";

const commands = new SVGPathData("M0 0L10 10").toAbs().commands;
const d = encodeSVGPath(commands);
```

The root `@grida/svg` export is reserved for future SVG-wide APIs and does not re-export path data.

## Upstream attribution

The initial path-data implementation and parity tests are derived from [svg-pathdata](https://github.com/nfroidure/svg-pathdata), originally authored by Nicolas Froidure and contributors, licensed under MIT. The original license is preserved in [LICENSE.svg-pathdata](./LICENSE.svg-pathdata).
