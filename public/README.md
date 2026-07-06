# `public/` — the canonical web-published content tree

> **Everything in this directory is published to the world.** Adding a file
> here — or a mapping that points at one — is a publish decision. Review it
> like one: no secrets, no internal data, no drafts you wouldn't put on
> grida.co.

## Why this exists

Grida repeatedly produces **content that must be served on the web but whose
natural home is not the web app**:

- slide-deck templates authored as [`dotcanvas`](../packages/dotcanvas)
  bundles (the desktop home's template gallery),
- `.grida` artifacts produced by Rust builds,
- hand-authored static assets (preset artwork, sample files).

Before this directory, each producer solved delivery ad-hoc — dropped into
`editor/public/`, wired through a bespoke copy step, or left unshipped under
`fixtures/`. The same homelessness kept recurring, and no OSS tool serves this
exact niche (a JS monorepo with multiple asset producers and one served
origin — see [turborepo#2192](https://github.com/vercel/turborepo/issues/2192),
open and unresolved). So we consolidate the concern into **one directory, one
layer, one contract** — small enough to stay maintainable, which is the whole
point.

## What it is

**The origin tree for web-published content.** One canonical place that
producers write into and hosts consume from. The editor
(grida.co, a Next.js app) is _a_ host — the current one — not the owner.

Its shape:

- **Publishing units.** Each subdirectory holding a `publish.json` is a
  self-managed publishing unit: its own sources, its own build (code — a
  script, a cargo invocation, whatever fits; an optional `build.mjs` the
  resolver runs), and its own **publish map** declaring `source → url`.
  Build logic stays in code; the config is data only — _what_ is published
  _where_, never _how_ it is built. The map's three entry forms (the whole
  schema, frozen — see [`tools/publish.schema.json`](./tools/publish.schema.json)):

  ```jsonc
  {
    "publish": {
      "v1.json": "/schema/dotcanvas/v1.json", // file → exact URL
      "json/": "/schema/", // dir/ → URL prefix (recursive, as-is)
      "out/*.canvas.zip": "/templates/slides/", // glob → URL prefix (single-*)
    },
  }
  ```

- **Original + generated, side by side.** A unit may contain committed
  sources and gitignored build outputs. Each unit self-defines its gitignore
  (nested `.gitignore`). The enforcement is executable, not prose: a build
  must not ADD unignored files (before/after `git status` snapshot — a
  generated file missing from the unit's `.gitignore` fails the build).
- **A declared URL registry.** Because every published URL is enumerable from
  the publish maps, the resolver validates at build time: cross-unit URL
  collisions, mapped-but-missing files, hostile URLs. The sync guards the
  host: never overwrite a git-tracked file, no path escape, every synced
  path must be gitignored on the host. A URL change is a config diff —
  visible in review, a deliberate act.
- **Materialization, not serving.** A sync step copies the resolved tree into
  the host (today: `editor/public/`, because Next serves from there and does
  not follow symlinks out of the app dir). Future hosts (desktop packaged
  resources, a CDN bucket) consume the same tree.

## What it is not

- **Not Next.js's `public/`.** Directory layout here does NOT imply URL
  layout — the publish map does. Nothing is served from this path directly.
- **Not `fixtures/`.** Fixtures are deterministic _test inputs_. This is
  _product content_. A file can never be both; if a test needs one of these
  files, the test reads it from here explicitly.
- **Not a package registry.** Nothing here is imported by code or published
  to npm. Code contracts live in `packages/`; this tree holds bytes for the
  web.
- **Not the Grida Library.** [library.grida.co](https://library.grida.co) is
  the hosted, user-facing open-assets product. This tree is repo-shipped,
  version-controlled product content.
- **Not a dumping ground.** A new subdirectory = a new publishing unit = a
  deliberate decision with an owner, a build, and a map. "Where does X go?
  eh, `public/`" is the failure mode this README exists to prevent.

## Status

**Live.** The tooling is [`tools/`](./tools) — `node tools/cli.mjs
<build | sync --to <dir> | ls>` (`build` resolves + validates + writes the
manifest; `sync` materializes into a host; `ls` prints the URL registry),
pinned by `tools/tools.test.mjs`. The first tenant is
[`slides-templates/`](./slides-templates) (deterministic per-bundle
`<name>.canvas.zip` + index for the desktop home gallery); the editor syncs
on `predev`/`prebuild` via its `sync:public` script. The layer must stay
small (read maps → validate → materialize; low hundreds of lines, tested).
If it can't stay that small, it is becoming the legacy it was meant to
prevent — stop and reassess.

## Future plans

- **Route-conflict validation** against the host app's routes (the sync
  already guards tracked files, path escapes, and un-ignored paths).
- **More producers:** Rust-built `.grida` artifacts; migration of existing
  `editor/public` assets where it pays.
- **Graduation paths** (when scale demands, not before):
  - a **dedicated bucket/CDN origin** (S3/R2 + sync) — this tree becomes the
    bucket's source of truth, and the host copy step becomes a deploy step;
  - a **Bazel-class build system** — the publish maps translate naturally to
    filegroup/genrule declarations if the repo ever adopts one.

## Naming (recorded while the memory is fresh)

The name is **undecided**; `public` is the working choice. Candidates
considered:

| Name                   | Verdict                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public`               | **Working choice.** States the one load-bearing fact — world-published — on sight. Flaw: may suggest Next-style path=URL passthrough (corrected above). |
| `cdn`                  | Runner-up. Becomes the _more_ honest name the day a dedicated bucket exists; a natural rename marker for that migration.                                |
| `static`               | Rejected — half the tree is built, and "static" names a serving mode, not the domain.                                                                   |
| `assets` / `resources` | Rejected — accept everything, govern nothing; `resources` also collides with Electron packaged resources.                                               |
| `fixtures`             | Rejected hard — fixtures are test inputs; overloading the term destroys a crisp existing meaning.                                                       |
