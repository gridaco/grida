# @app/database

Shared database types and client-injected adapters. `supabase/` remains the sole
SQL migration authority. `database-generated.types.ts` is generated;
`database.types.ts` documents its narrowly scoped manual overrides.

The root entry continues to export existing schema types. Explicit subpaths:

- `@app/database/commerce`: `GridaCommerceClient`, shared inventory/store/product
  operations using a caller-owned `grida_commerce` Supabase client. Applications
  choose the client's authority and perform authorization. The adapter neither
  creates clients nor reads environment, credentials or request context.
- `@app/database/errcode`: `PGXXError`, existing custom SQLSTATE constants.
- `@app/database/supabase-ext`: `Row`, `InsertDto`, `UpdateDto`, `UpsertDto` and
  `DontCastJsonProperties`, shared schema type helpers.

The commerce adapter preserves existing update order and failure behavior; it
does not introduce transactions, retries or atomicity guarantees. In particular,
an existing item's level adjustment precedes changes to negative-level policy;
a missing item is created before its level is adjusted. Its low-level methods
must not be treated as independently authorized public operations.

`pnpm test` exercises adapter policy with a query recorder and no live backend.
It complements the Forms HTTP proof with real Supabase; it does not replace it.
Run `pnpm typecheck` to check these adapters against the shared schema types.
