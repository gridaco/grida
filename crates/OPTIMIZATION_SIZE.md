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

## A Walkthrough: How We Discovered What Really Bloats WASM

This section is written as a mini‑blog / engineering diary so future-us can remember _why_ we made certain optimization decisions and what we learned the hard way.

### 1. Serde Can Get Expensive, Fast

While adding support for large schemas (Figma, SVG, Markdown), we discovered that `serde` isn’t free:

- `Serialize` adds a little cost
- `Deserialize` adds **a lot** (Visitor, field-enum, map-walkers, string matches)
- Deeply nested schema trees cause monomorphization across many generic shapes (`Vec<T>`, `Option<T>`, etc.)

💡 **Takeaway:**  
When designing schemas, consider consolidating multiple structs, or planning the data model so you don't generate 200+ derived structs unnecessarily. Serde cost must be considered at system design time, not just build time.

---

### 2. `opt-level = "z"` Dramatically Reduces `.wasm` Size

When we switched the entire build to size‑optimized mode:

- Our `.wasm` dropped **~35%**, from **15.9 MB → 9.8 MB**
- This confirmed that a huge amount of code in our build is “static glue” (serde, parsing, state transform layers)

💡 **Takeaway:**  
`z` is incredibly powerful for reducing size — but it comes at a performance cost.

---

### 3. Why We Can’t Use `"z"` Everywhere

For engines (like Grida Canvas), runtime performance matters more than anything:

- layout engine
- renderer
- transform pipeline
- per-frame work
- input handling

These must run with **max optimization** (`opt-level = 3`).

We confirmed `"z"` **can** slow down hot paths, especially math-heavy or allocation-heavy code.

💡 **Takeaway:**  
Use `"3"` as the global baseline.

---

### 4. The Breakthrough: Use `"3"` for Core Engine, `"z"` for One‑Time‑Only Crates

Some crates only run during:

- file import
- SVG load
- Markdown parse
- JSON → IR transform
- non-interactive initialization

These are not per-frame, so their runtime performance doesn’t matter.

Perfect candidates for `opt-level = "z"`.

Example crates we tuned:

- `figma-api`
- `usvg`
- `pulldown-cmark`

This gave us the best of both worlds:

- **Full performance** for rendering engine
- **15% smaller** `.wasm` without touching hot paths

---

### 5. Timeline of What We Measured

| Size        | Description                                                        |
| ----------- | ------------------------------------------------------------------ |
| **13.2 MB** | Baseline (opt‑3) — models present but unused                       |
| **15.9 MB** | After enabling full serde (250+ structs)                           |
| **9.8 MB**  | `opt-level = "z"` for all crates                                   |
| **13.7 MB** | Balanced: `opt-level = 3` baseline + `"z"` for parser/model crates |
| **12.0 MB** | New baseline after stabilizing per‑crate optimization              |

---

### Final Lessons

1. **Serde design matters.** Avoid creating huge struct forests without planning — `Deserialize` is expensive.
2. **`opt-level = "z"` is insanely effective** for code that isn’t performance‑critical.
3. **Use per‑crate optimization** to mix `"3"` and `"z"` in the same build — Rust/Cargo is uniquely powerful here.
4. **Always benchmark with real snapshots.** WASM behavior changes depending on what code paths are activated.

This section preserves our engineering path so future contributors understand _why_ certain crates use `"z"` and why the engine core must always use `"3"`.

### Useful Resources

- https://doc.rust-lang.org/cargo/reference/profiles.html
- https://crates.io/crates/miniserde
- https://github.com/johnthagen/min-sized-rust
- https://www.warp.dev/blog/reducing-wasm-binary-size
