# `editor`

## Universal routing (docs-friendly links)

Grida supports **universal routing** so documentation can link to stable, tenant-agnostic URLs like `https://grida.co/_/<path>` and have them resolved to canonical tenant/document routes at runtime.

- When you add a **new user-facing page** that should be referenced from docs, ensure it is registered in **universal routing**.
- When debugging docs links that point to the editor, start from the universal routing spec: `docs/wg/platform/universal-docs-routing.md`.
