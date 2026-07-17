# History

## 2026-07 — the engine split

The Rust render engine (`crates/*`, `format/`, the engine WG docs, engine
fixtures and CI) moved to its own repository —
[gridaco/nothing](https://github.com/gridaco/nothing) — **with its full git
history carried over** via `git filter-repo`. This repo consumes the engine
only as the published `@grida/canvas-wasm` npm artifact (pinned in
`editor/package.json`).

- **Pre-split snapshot:** branch
  [`snapshot/pre-engine-split-at-202607`](https://github.com/gridaco/grida/tree/snapshot/pre-engine-split-at-202607)
  preserves this repo's last pre-split state (`main` @ `2c73d553a`).
- **SHA bridge:** the complete original → migrated commit map lives in the
  engine repo at
  [`docs/history/grida-migration-commit-map.txt`](https://github.com/gridaco/nothing/blob/main/docs/history/grida-migration-commit-map.txt)
  — use it to translate pre-split SHAs (old issues, PRs, blame links) into
  the engine repo's history.
- Four fixture directories (`fixtures/{fonts,images,test-grida,text-editor}`)
  remain here as **frozen snapshots** for staying tests; canon and history
  live with the engine (see `fixtures/README.md`).
