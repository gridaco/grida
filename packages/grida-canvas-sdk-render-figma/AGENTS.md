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

## Publishing

**TODO:** This is a temporary hack. Once `@grida/io-figma` and `@grida/schema` are published to npm, remove `scripts/prepack-publish.cjs` and `scripts/postpack-publish.cjs`, drop the prepack/postpack lifecycle from `package.json`, move those deps to `dependencies` with semver ranges, and use changesets normally. The prepack/postpack scripts exist only because we publish refig before its internal deps are on npm — they strip `workspace:*` from the manifest at pack time so the tarball has no unpublished deps.

From repo root:

```sh
pnpm install
pnpm -C packages/grida-canvas-sdk-render-figma build
pnpm publish ./packages/grida-canvas-sdk-render-figma --no-git-checks
```

Use `--dry-run` to test without uploading. Avoid `pnpm -C ... publish` — it can trigger npm EUSAGE; use the explicit path form instead.

Bump version before publish (manual or via changesets) if needed.

## How to develop

```sh
pnpm build
pnpm test
pnpm typecheck
```

From monorepo root: `pnpm turbo build --filter=@grida/refig`, `pnpm turbo test --filter=@grida/refig`.
