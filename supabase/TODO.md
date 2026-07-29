# Migrations TODOs.

## `grida_library`

- [ ] Consider moving raw object embeddings out of the public-read catalog
      surface. Clients only need search and similarity results, so the vectors
      could live in a private table and be exposed through narrow RPCs (or a
      view that omits the vectors). This is defense-in-depth, not a
      security-critical migration.

## `grida_forms`

- [ ] remove each mime specific block, (image, video, pdf, etc) and replace with 'viewer' block. with extra attributes.
