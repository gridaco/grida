## Inspecting & Optimizing Bundle Size

Keep the WebAssembly bundle as small as possible. Heavy transitive dependencies (e.g. `image`, `regex`, `reqwest`, full TLS stacks) can add multiple megabytes.

### Tools

**1. `cargo-bloat` — identify size-heavy crates**

```bash
cargo bloat --release --crates
cargo bloat --release --target wasm32-unknown-unknown --crates
```

Shows ranked list of crate size contributors. Works for `wasm32-unknown-emscripten` — analyzes Rust code before Emscripten adds JS/glue, so attribution is accurate.

**2. `cargo tree` — trace dependency paths**

```bash
cargo tree -i crate_name  # see why a crate is included
cargo tree -d              # find duplicate dependencies
```

Use `-i` to see which path brought in a heavy dependency. Use `-d` to find duplicates (same crate with different versions/features) that bloat the bundle.

### Workflow

1. Run `cargo bloat --crates` before/after adding dependencies
2. Identify large crates in the output
3. Use `cargo tree -i crate_name` to trace the dependency path
4. Check `cargo tree -d` for duplicates and resolve version conflicts
5. Remove, replace, or feature-gate heavy dependencies
6. Use `[workspace.dependencies]` in `Cargo.toml` to unify versions
