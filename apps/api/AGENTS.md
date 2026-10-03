# Open API ownership

This application owns public, user-facing product operations. Start with the
[README](./README.md) for scope, environment ownership and release ordering.

- Do not import editor source or Next request context, including type imports.
- Keep HTTP adapters thin; domain operations and privileged clients live here.
- The API host serves multiple products. Forms owns only `/v1/forms` and its
  descendants, with paths supplied by `@grida/forms`. Do not add aliases at
  unqualified `/v1` paths. Platform middleware owns request IDs and common
  security headers; Forms CORS/preflight policy must stay inside its namespace.
- Use the shared producers listed in the README: `@grida/forms` for contracts,
  `@grida/postgrest` for schema interpretation, `@workspace/utils` for explicit
  HTTP/OTP primitives, and `@workspace/translations` / `@workspace/emails` for
  product copy and presentation. Do not copy these implementations into an app.
- `@app/database` supplies generated types and client-injected adapters. The
  application creates the client and owns its credentials and authorization.
- Shared producers must not import applications, read ambient environment or
  perform their own network I/O. Their approved dependencies are checked in
  `tests/ownership.test.ts`. Node crypto is limited to the OTP entrypoint;
  database adapters may execute through the supplied client.
- Keep Forms copy in `data/translations`; only the translations package imports
  those JSON catalogs. Its build embeds them and its Turbo inputs track them.
  Use request-local translators on the server; do not mutate shared language
  state per request. Email packages own rendering, not delivery or OTP creation.
- Internal editor callers must not bypass the public API by importing its writer.
- Keep root `supabase/` as the sole migration source. Use local disposable
  fixtures for proof; never access production data as an automated agent.
- Treat respondent sessions as capabilities. Do not log URLs, request bodies,
  OTPs, credentials or raw provider errors.
- Required completion effects are awaited before success. Do not replay writes
  on timeout or error, or publish internal completion hooks.
- Changes to routes, configuration or dependencies must pass the Forms local
  HTTP proof as well as the relevant typecheck/build/contract checks.
- Build shared dependencies with `pnpm turbo build --filter='@grida/api^...'`
  before direct API commands or the local proof. Check changed producers with
  their own tests and typechecks; `@app/database` has no build script. The proof
  hashes linked producer sources, compiled outputs and canonical translation
  JSON, so a stale package build is not an acceptable verification input.
