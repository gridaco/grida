# Skia GPU Microbenchmarks

Raw Skia performance measurements in isolation — no Grida engine involvement.
These benchmarks measure the GPU cost of individual Skia operations to inform
optimization decisions in the renderer.

All GPU benchmarks use `HeadlessGpu` (offscreen Metal/GL context, no window).

## Run

```bash
# Run a specific benchmark (always use --release for meaningful numbers)
cargo run -p cg --example skia_bench_<name> --features native-gl-context --release

# Examples:
cargo run -p cg --example skia_bench_effects --features native-gl-context --release
cargo run -p cg --example skia_bench_opacity --features native-gl-context --release
```

## Benchmarks

| Example                  | What it measures                                                           |
| ------------------------ | -------------------------------------------------------------------------- |
| `skia_bench_primitives`  | Rect fill, image blit, texture switching, SkPicture blur replay            |
| `skia_bench_effects`     | Per-effect cost ranking: blur, shadow, opacity, color filters, blend modes |
| `skia_bench_opacity`     | save_layer vs per-paint alpha — proves 15-200x speedup                     |
| `skia_bench_downscale`   | Whether smaller render target reduces effect cost                          |
| `skia_bench_atlas`       | Texture atlas vs separate textures — proves 5-35x speedup                  |
| `skia_bench_tiling`      | Tiling strategies with SkPicture                                           |
| `skia_bench_srcset`      | Image scaling / resolution selection strategies                            |
| `skia_bench_cache_image` | Image caching across DPR and canvas sizes                                  |
| `skia_bench_cache_text`  | Text paragraph SkPicture caching                                           |

## Results

Findings are documented in:

- `docs/wg/feat-2d/skia-gpu-primitives-benchmark.md`
- `docs/wg/feat-2d/optimization.md` (item 6b, item 7)
