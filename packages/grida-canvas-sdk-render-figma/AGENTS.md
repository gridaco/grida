# @grida/refig

Headless Figma renderer — render `.fig` and REST API JSON to PNG/JPEG/WebP/PDF/SVG.

## Dependencies

**dependencies** — What npm consumers install. Must be resolvable from npm (no `workspace:*`).

- `@grida/canvas-wasm` — published on npm; kept external (WASM/binary).
- `commander` — kept external (CJS dynamic require does not bundle cleanly).

**devDependencies** — Build-time / bundled into `dist`. Uses `workspace:*` for monorepo packages.

- `@grida/io-figma`, `@grida/schema` — bundled via tsup `noExternal` regex.
- Other `@grida/*` pulled in transitively are bundled too.

**Note:** Project is premature; only a few packages are published on npm. The split between deps and devDeps reflects this. Will be cleaned up with proper semver + changeset; all runtime deps will live in `dependencies` once everything is published.

## Build

tsup bundles all `@grida/*` except `@grida/canvas-wasm`. `external: ["@grida/canvas-wasm", "commander"]`; `noExternal: [/^@grida\/(?!canvas-wasm$)/]`.

## Smoke test

We have a publish smoke test because of the extra config (deps vs devDeps split, bundling). `__tests__/refig.cli.smoke.test.ts` — packs the package, installs in an isolated temp dir, runs `npx refig --help` and a real render (minimal REST fixture → PNG). Ensures it works for npm consumers (no workspace deps at runtime, WASM loads). Must pass before publish.

## How to develop

```sh
pnpm build
pnpm test
pnpm typecheck
```

From monorepo root: `pnpm turbo build --filter=@grida/refig`, `pnpm turbo test --filter=@grida/refig`.
