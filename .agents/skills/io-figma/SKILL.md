---
name: io-figma
description: >
  Guides work on the Figma I/O package (@grida/io-figma, packages/grida-canvas-io-figma/).
  Covers the fig-kiwi binary parser, Kiwi→REST→Grida conversion pipeline, fig2grida CLI,
  REST API JSON conversion, and testing with clipboard/fig/REST fixtures.
  Use when adding node type support, fixing conversion bugs, extending fig2grida,
  working on the fig-kiwi parser, writing tests for Figma import, or debugging
  clipboard paste failures after a Figma update.
---

# Figma I/O — `@grida/io-figma`

Package: `packages/grida-canvas-io-figma/`

## Architecture

```text
.fig bytes / HTML clipboard
  → fig-kiwi parser       (fig-kiwi/)          low-level, zero-opinion
  → NodeChange[]          (Kiwi schema types)
  → iofigma.fromKiwi*()   (lib.ts)              Kiwi → Grida node

Figma REST API JSON
  → iofigma.fromRest*()   (lib.ts)              REST → Grida node

Orchestration:
  fig2grida-core.ts       — browser-safe: input detection, page loop, pack
  fig2grida.ts            — CLI wrapper (Node.js only, uses fs + process.argv)
```

**Key invariant**: The Kiwi path converts to REST format first (`Kiwi → REST → Grida`). `lib.ts` is the single source of truth for node conversion; it does not know the input origin.

**Output**: Grida format (`.grida` ZIP — FlatBuffers + images). See `io-grida` skill for format details, Rust loading, and round-trip testing.

## fig2grida Input Formats

`fig2grida(input)` in `fig2grida-core.ts` auto-detects the input:

| Input            | Detection                                             | Path            |
| ---------------- | ----------------------------------------------------- | --------------- |
| `.fig` bytes     | ZIP without `document.json`, or raw Kiwi              | fig-kiwi parser |
| REST archive ZIP | ZIP containing `document.json` (+ optional `images/`) | REST JSON path  |
| REST JSON bytes  | Starts with `{`                                       | REST JSON path  |
| REST JSON object | Non-Uint8Array object                                 | REST JSON path  |

The REST JSON path (`extractCanvases`) accepts multiple response shapes:

- `{ document: { type: "DOCUMENT", children: [CANVAS, …] } }` — full `GET /v1/files/:key`
- `{ document: { type: "CANVAS", children: […] } }` — single-page node fetch
- `{ nodes: { "id": { document: … }, … } }` — `GET /v1/files/:key/nodes?ids=…`
- `{ type: "DOCUMENT", children: … }` — document node directly
- `{ type: "CANVAS", children: … }` — single CANVAS node
- `{ children: […] }` — bare object with children

**Public APIs** (both in `fig2grida-core.ts`):

- `fig2grida(input, options?)` → `.grida` ZIP bytes (`Fig2GridaResult`)
- `restJsonToGridaDocument(json, options?)` → in-memory `Document` + assets (no ZIP packing)

## Key Files

| File                      | Role                                                      |
| ------------------------- | --------------------------------------------------------- |
| `lib.ts`                  | All `iofigma.from*` converters (Kiwi→REST and REST→Grida) |
| `fig2grida-core.ts`       | Orchestrator (`.fig`, REST JSON, REST ZIP)                |
| `fig2grida.ts`            | CLI entry point (Node.js only)                            |
| `fig-kiwi/index.ts`       | Low-level parser public API                               |
| `fig-kiwi/blob-parser.ts` | Vector network + commands blob decoding                   |
| `fig-kiwi/schema.ts`      | Kiwi type definitions (NodeChange, Message, …)            |

## References

| Path                                       | What                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `.ref/figma/`                              | Kiwi schema (`fig.kiwi`, `fig.kiwi.d.ts`), extraction tool (`fig2kiwi.ts`), Figma REST & Plugin API typings |
| `docs/wg/feat-fig/glossary/fig.kiwi.md`    | Deep-dive: node types, vector blob format, GROUP/FRAME detection, text/font mapping                         |
| `packages/grida-canvas-io-figma/README.md` | Feature matrix, limitations, usage                                                                          |

## Common Tasks

### Add support for a new Figma property

1. Find the property in `fig-kiwi/schema.ts` (Kiwi) or REST JSON in `fixtures/test-figma/`.
2. Add mapping in `lib.ts` under the relevant `iofigma.from*` converter.
3. Add a test in `__tests__/` against an existing fixture.

### Debug a clipboard paste failure

Clipboard issues = Figma changed their Kiwi schema.

1. Save the failing HTML clipboard as a fixture.
2. Run `readHTMLMessage(html)` → inspect raw `Message`.
3. Diff parsed `NodeChange[]` against `fig-kiwi/schema.ts`.
4. Update `schema.ts` (field changes) or `blob-parser.ts` (blob layout changes).

### Run fig2grida

```sh
pnpm --filter @grida/io-figma fig2grida input.fig
npx tsx packages/grida-canvas-io-figma/fig2grida.ts input.fig --pages 0,2
npx tsx packages/grida-canvas-io-figma/fig2grida.ts input.fig --info
```

### Figma API token

`figma_archive.py` requires a Figma Personal Access Token. The script
checks `FIGMA_TOKEN` then `X_FIGMA_TOKEN` env vars, or accepts
`--x-figma-token` on the CLI. It fails fast with a clear error if none
is set.

The root `.env` file is **not** a standard part of this project — it may
not exist on every machine. **Never read `.env` directly** (for security
reasons). Instead, if a token is needed and not already in the
environment, ask the user to provide one and have them export it:

```sh
export FIGMA_TOKEN=figd_...
```

### Create REST API fixtures

Use `scripts/figma_archive.py`. See the script header for full documentation, output layout, and `--export` behaviour.

```sh
python .agents/skills/io-figma/scripts/figma_archive.py \
  --filekey <KEY> --archive-dir fixtures/test-figma/community/<name>

# With oracle PNGs (nodes must have export presets in Figma)
python .agents/skills/io-figma/scripts/figma_archive.py \
  --filekey <KEY> --archive-dir fixtures/test-figma/rest-api/local/<name> --export
```

## Tests

```sh
pnpm --filter @grida/io-figma test                              # all
pnpm --filter @grida/io-figma test -- __tests__/iofigma.kiwi.test.ts  # specific
```

| Test file                                       | Covers                         |
| ----------------------------------------------- | ------------------------------ |
| `iofigma.kiwi.test.ts`                          | Kiwi clipboard → Grida         |
| `iofigma.kiwi.fig.test.ts`                      | `.fig` file parsing            |
| `iofigma.kiwi.vector-network.test.ts`           | Vector network blob decoding   |
| `iofigma.kiwi.clipboard-overrides.test.ts`      | Component instance overrides   |
| `iofigma.kiwi.clipboard-components.test.ts`     | Component / instance clipboard |
| `iofigma.kiwi.clipboard-text-overrides.test.ts` | Text style overrides           |
| `iofigma.rest-api.no-geometry.test.ts`          | REST API (no geometry)         |
| `iofigma.rest-api.vector.test.ts`               | REST API vector paths          |
| `fig2grida.test.ts`                             | End-to-end pipeline            |
| `fig-kiwi/__tests__/`                           | Low-level parser units         |

**Fixtures:** `fixtures/test-figma/rest-api/` (committed REST JSON), `fixtures/test-figma/community/` (archived files), `fixtures/local/` (gitignored, manual testing).

## Known Limitations

- Component sets, FigJam nodes (STICKY, CONNECTOR, TABLE) not supported
- `characterStyleOverrides` / `styleOverrideTable` partially mapped from Kiwi
- Style/variable bindings not preserved
- Kiwi is undocumented — can break after Figma updates

Check the README's limitations section before writing new code. If lifting a limitation, update the README.

## Verification

```sh
pnpm turbo typecheck --filter='./packages/grida-canvas-io-figma'
pnpm turbo test --filter='./packages/grida-canvas-io-figma'
```
