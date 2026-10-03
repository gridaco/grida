# @grida/postgrest

Private, application-independent interpretation of PostgREST's OpenAPI schema
metadata and the editor's `column.$.json.path` notation. The editor and public API
must use this same implementation.

- `SupabasePostgRESTOpenApi` owns property/schema/PK/FK parsing, table-method
  interpretation and their structural types. PostgreSQL type names remain open
  strings so custom types are retained. Composite foreign keys are not inferred
  from PostgREST's single-column description metadata.
- `FlatPostgREST` owns JSON-path encoding, decoding, reads and updates.

This package does not discover schemas, fetch OpenAPI documents, instantiate
database clients, read credentials or authorize operations. Those are application
adapters. The structural document types describe the fields these consumers use;
they do not perform runtime validation of an arbitrary OpenAPI document.

Run `pnpm test`, `pnpm typecheck` and `pnpm build` in this package after installing
workspace dependencies. The tests use local schema examples and need no server.
