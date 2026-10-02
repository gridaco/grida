# Open API ownership

This application owns public, user-facing product operations. Start with the
[README](./README.md) for scope, environment ownership and release ordering.

- Do not import editor source or Next request context, including type imports.
- Keep HTTP adapters thin; domain operations and privileged clients live here.
- Share only neutral contracts/pure utilities through `@grida/forms`. Internal
  editor callers must not bypass the public API by importing its writer.
- Keep root `supabase/` as the sole migration source. Use local disposable
  fixtures for proof; never access production data as an automated agent.
- Treat respondent sessions as capabilities. Do not log URLs, request bodies,
  OTPs, credentials or raw provider errors.
- Required completion effects are awaited before success. Do not replay writes
  on timeout or error, or publish internal completion hooks.
- Changes to routes, configuration or dependencies must pass the Forms local
  HTTP proof as well as the relevant typecheck/build/contract checks.
