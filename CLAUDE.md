# CLAUDE.md

## Important: Read AGENTS.md files

This project uses `AGENTS.md` files instead of `CLAUDE.md` for directory-specific guidance.

**Before starting any task**, read the relevant `AGENTS.md` files:

1. Always read the root [`AGENTS.md`](./AGENTS.md) first — it contains the project overview, structure, tech stack, and build/test commands.
2. When working in a subdirectory that has its own `AGENTS.md`, read that too. Key ones:
   - `editor/AGENTS.md` — editor architecture and conventions
   - `format/AGENTS.md` — file formats and schemas
   - `crates/grida-canvas/AGENTS.md` — Rust canvas core
   - `crates/grida-canvas-wasm/AGENTS.md` — WASM bindings
   - `supabase/AGENTS.md` — database and migrations
   - `docs/AGENTS.md` — documentation guidelines
3. If a subdirectory you're working in has an `AGENTS.md`, always prefer its guidance over general assumptions.
