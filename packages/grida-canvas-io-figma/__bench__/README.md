# Benchmark Fixtures

This directory holds large fixture files used by `__tests__/fig2grida.bench.ts`.
Files here are **gitignored** — you must supply them locally.

Benchmarks that reference missing fixtures are **skipped automatically**.

## Expected files

| File                 | Description                                                                 | How to obtain                                                  |
| -------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `rest-large.json.gz` | Gzipped Figma REST API response (`GET /v1/files/:key`), ideally 100k+ nodes | Export any large Figma file via the REST API and gzip the JSON |
