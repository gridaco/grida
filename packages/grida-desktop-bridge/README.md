# @grida/desktop-bridge

Private renderer-visible contract for Grida Desktop's `window.grida` bridge.

This package exists so the Electron preload and the URL-loaded `/desktop/*`
renderer compile against the same bridge protocol without the editor importing
Desktop source files directly.

## Contract

- Owns the renderer-visible bridge protocol version.
- Owns the typed shape of `window.grida`.
- Owns Desktop-native capability names exposed to the renderer.
- Re-exports shared AgentHost DTOs from `@grida/agent` where the bridge forwards
  package-owned HTTP contracts.

`chatgpt.connect()` preserves the secret-free
`ChatGptSubscriptionStatus` object on success. An explicit user cancellation
resolves as `{ outcome: "cancelled" }`; every other failure rejects. Consumers
must classify the result by `outcome`, never by matching Electron error text.

`modelGeneration.generate()` exposes Tripo model generation only when
both the optional method and `caps.media.tripo` are present. A hosted renderer
must withhold Tripo key setup and generation choices from older native builds.
The request identifies a model and input variant; the response contains inline
GLB bytes, safe task metadata and an optional local media receipt.

`rigging.check()` and `rigging.generate()` require both optional methods and
`caps.media.rigging`. Older binaries may support generation without supporting
mesh upload/rigging; the rigging gate is independent. Checks return structured
eligibility with no model identity or media output. Explicit rigging returns
portable GLB bytes and an optional new local media receipt. Both operations
accept bounded inline mesh bytes, never input paths or provider URLs.

Desktop still owns Electron IPC channel names, preload implementation, native
window/dialog/shell behavior, and AgentHost supervision.

## Anti-goals

- Not an Electron IPC package.
- Not an AgentHost HTTP client.
- Not a native Desktop runtime.
- Not a public plugin or extension API.
- Not a place for secrets, route strings, fetch logic, or filesystem access.

Grida-funded Tripo additionally requires `caps.media.tripo_gg` for generation
or `caps.media.rigging_gg` for eligibility/rigging. These optional flags gate
new hosted input uploads independently from the older generic GG capability.
Requests explicitly select `provider: "gg"` or `provider: "tripo"`; omission
of a funded capability means the renderer must not advertise that lane.
