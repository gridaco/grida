# @grida/desktop-bridge

Private renderer-visible contract for Grida Desktop's `window.grida` bridge.

This package exists so the Electron preload and the URL-loaded `/desktop/*`
renderer compile against the same bridge protocol without the editor importing
Desktop source files directly.

## Contract

- Owns the renderer-visible bridge protocol version.
- Owns the typed shape of `window.grida`.
- Owns Desktop-native capability names exposed to the renderer.
- Re-exports shared AgentHost DTOs from `@grida/ai-host` where the bridge forwards
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

`nativeChat` is an optional Desktop namespace. Check `status()` in the
current workspace. If it reports `native-starting`, call `status(true)` to
start the workspace chat. Known setup failures are fixed readiness values.
`native-gateway-unavailable` means scoped Gateway access could not be acquired;
it does not identify a worker or storage failure. `profiles()` remains available
before startup succeeds. An explicit `selectProfile()` can open a saved or
configured connection, with no implicit fallback or default retry.
On the Welcome screen, `welcomeProfiles()` lists the saved-endpoint and
built-in provider-key connections a first chat can choose before its
workspace opens. It starts nothing; the opened workspace selects the choice
as a new connection.
An unknown result after startup is unavailable. The app issues an attachment for each
renderer that creates or loads a chat. Submit keeps the caller's input ID.
Pause, Resume, and Stop use an observation issued for that attachment.
Streamed text carries message and turn IDs, a UTF-8 byte offset, and a
replacement flag. A resync notice or local delivery limit ends confidence in
the streamed view. The retained snapshot remains the source for task state.
`transcript` reads committed user and assistant text for the current attachment.
Reads are bounded at 1 MiB and 1,024 messages and report an explicit error if
the transcript exceeds either bound. A replay does not stop the live turn.
Navigating away releases attachments and subscriptions while accepted work
stays owned by the native host.

After the workbench chat connects, `takeNotificationFocus()` consumes its
latest pending notification click once. The result identifies the saved chat
and, when applicable, its model connection. A missing or stale click returns
`null`. The focus push wakes the same read.

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
