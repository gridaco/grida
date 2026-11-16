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

`providers.set_endpoint()` is the explicit Connect/Save consent action for the
displayed destination on new hosts. Detect the optional `endpoint_authorization`
and `update_endpoint_models` methods before relying on this behavior. Consent
is retained by Main across restarts and is bound to the endpoint ID and full
canonical base URL. `endpoint_authorization(id, baseUrl)` reads only: both the
current saved config and its receipt must match and the route must remain
eligible. A probe requires saved consent and cannot authorize a draft URL.
`update_endpoint_models()` merges only detected model fields into the current
authorized configuration, preserving human overrides and the default model; it never creates a config or a grant.
Background discovery must use this operation, never the explicit Save action.
Older hosts may prompt on Save/probe, so skip automatic discovery on them.

`window.open_settings()` opens or focuses the native Settings window through
the same action as the app's Settings menu. It accepts no arguments and leaves
the calling window mounted. Check that this optional method exists before
offering the action: older protocol-1 hosts do not expose it. Native Main owns
the destination and authenticated window admission.

`nativeChat` is an optional Desktop namespace. Check `status()` in the
current workspace. If it reports `native-starting`, call `status(true)` to
start the workspace chat. Known setup failures are fixed readiness values.
`native-gateway-unavailable` means scoped Gateway access could not be acquired;
it does not identify a worker or storage failure. `profiles()` remains available
before startup succeeds. An explicit `selectProfile()` can open a saved or
configured connection, with no implicit fallback or default retry.
The optional catalogue flag `modelChanges` advertises guarded replacement of
the workspace worker. A renderer must withhold existing-chat model changes
when this flag is absent. Selection validates the destination before closing
the previous connection, checks all chats for captured work, and saves a new
profile only after launch succeeds. A refusal keeps the previous worker;
`native_chat_model_change_failed_restored` requires loading the previous chat
again because the prior connection was reopened in a new worker.
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

Compatible native hosts supply optional `activityOrder` on exposed messages,
individual tool calls and child lifecycle events. Positive safe-integer
coordinates compare only within the owning turn; a child event names that
parent turn explicitly. Text replacement and tool outcomes retain first-known
positions. `activityOrderIncomplete: true` identifies a public message or call
whose retained position is unavailable. Activity pages can separately report
`orderComplete` for returned child events. Missing fields on older native
hosts remain valid.

Merge these facts before grouping consecutive tools. The renderer must not
assign a containing message the call's coordinate, compare child-conversation
coordinates with a parent turn, or infer missing placement from timestamps or
poll arrival. An incomplete fact may gain a genuinely retained position later;
incremental missing updates cannot erase a position already held by the view.
Fresh authoritative replay may explicitly lack that evidence. These
presentation coordinates grant no execution or observation authority.

The optional `subagentActivity()` and `subagentConversation()` reads require
the current parent snapshot's `subagentActivityAvailable` fact. They are
independent of legacy named-child list, assignment inspection and controls.
Activity pages contain up to 32 children, explicit Active/Done classification,
host timestamps and stable lifecycle events for those children. Pages follow
immutable creation order, newest first; loading more can reveal additional
active children. Active includes
ready, queued, paused and unresolved work, rather than counting only running
inference. Done contains settled outcomes without waiting work. Counts are
lower bounds when `counts.complete` is false because the host bounded its scan.
`eventsComplete: false` reports omitted older retained lifecycle history for
the loaded children; it does not claim all parent events are loaded.

A conversation read returns actual exposed messages and recorded activity,
captured execution metadata per turn and for the latest assignment, and an
opaque older-page continuation. Null effort means no explicit reasoning level
was captured; it must not borrow the parent's current setting. Live messages
are replacement snapshots merged by message identity, not append-only text
deltas. `live.available: false` reports a gap in uncommitted progress; a settled
page has no live gap. Actual in-flight messages carry `live: true`, independently
of that availability fact. Truncation is explicit. Reads are bounded to 128 records
and 256 KiB of visible text, with individual text capped at 64 KiB and a final
32 turn facts and a 768 KiB serialized response bound. An unavailable or invalid continuation
requires a fresh read. The continuation belongs to the exact parent attachment
and child and cannot be moved to another window or chat. Closing the viewer
starts no cancellation; reads start no inference and grant no ordinary child
session attachment or control authority. Older hosts omit the methods or
availability fact and keep their existing inspection/result behavior.

New hosts optionally expose `queuedMessage(attachmentId, observationId, inputId)`
for full multiline text and attachment display metadata from an input still
waiting in that observed queue. Queue pages may include the same bounded
attachment metadata, with an opaque `previewId` for a retained image. Fetch
its original bytes through the separate optional
`readQueuedAttachmentPreview(attachmentId, observationId, inputId, previewId)`;
the sent-message preview reader does not accept a queued token. Each byte read
is bounded to 20 MiB, and all chunk reads retain the exact queued input and
session revision. A changed queue, withdrawn or claimed input, wrong chat,
foreign token, or revoked attachment rejects. These reads start no inference
and grant no edit, dispatch, path or URL authority. Older hosts omit the methods
and queue attachment metadata; retain their text-only queue display.
`queuedText()` keeps its existing text-only mutation preflight: a displayable
image message does not become eligible for replacement or steering as text.
The optional `textOnly` fact on queue items and inspected messages describes
the original captured input independently from its display projection; false
withholds legacy replacement and steering even when a non-text part projects
as a text marker.

Text-preserving replacement requires the optional
`acceptsQueuedTextReplacement()` method to return true and the waiting input's
`textEditable` fact to be true. Read the actual caption through
`queuedMessage()`, then call `editQueue()` with `action: "replaceText"`, its
input ID, the observed queue identity and a stable request ID. Only the text
changes: captured attachments, reference identity, model, effort and operating
settings remain with the replacement. Empty text is accepted when non-text
parts remain. The original receipt becomes superseded and identifies the new
input; the same request and arguments return the original mutation receipt.
Goals, Library inputs and other specialized inputs can be ineligible.

Older preloads omit the capability method; older native hosts return false
and omit `textEditable`. Keep their strict text-only edit path. Never infer
eligibility from a filename or thumbnail, or fall back from `replaceText` to
`replace`: whole-input replacement would discard the retained parts. A stale,
foreign, withdrawn or claimed target refuses through the existing observation
and attachment boundaries. Inspection remains read-only and starts no work.

New hosts optionally expose `acceptsPermissionMode()`, `permissionMode(attachmentId)`
and `setPermissionMode(attachmentId, expectedRevision, requestId, mode, review)`. Offer
Full access only when the capability is true and the native state includes
`full_access` in its available modes. Default (`restricted`) keeps its existing
filesystem and command-network restrictions. Full access deliberately removes
command confinement and ordinary approval prompts; OS-user file permissions
still apply. `reviewPermissionMode` issues a short-lived intent for the exact
attached chat, revision and request. The owned React confirmation shows the
native chat title and friendly project name, then answers that intent. Cancel
returns null and changes nothing. Main rechecks the attachment and the native
host performs revision admission; a navigated or foreign frame cannot finish
the grant. This is confirmation in the trusted app UI, not an independent OS
user-presence proof against a compromised eligible renderer. The native owner persists this per-chat
choice separately from model/effort defaults; new chats begin restricted.
Changing access requires accepted work and background processes to finish or
stop. Stable request IDs bind retries to the original decision. Queries and
changes start no inference. Older hosts omit methods or return false; keep
the Default presentation and withhold the selection action.

New hosts optionally expose `selection(target)`, `updateSelection(...)`, and
`createFromDraft(draftId)`. A target names exactly one saved `sessionId` or
stable unsent `draftId`; these are opaque identities, never resource paths.
The renderer retains its draft identity across navigation and restart. A first
draft read snapshots the current new-chat defaults into its native record;
later reads restore that saved connection/model/effort without starting a
worker or changing defaults. `modelId` is the exact wire model identity.
An unavailable connection preserves the saved choice; a null selection reports
unresolved legacy identity and grants no fallback.

Catalogue reads can optionally report `newChatDefault`, the complete last
explicitly saved app default, independently from currently offered choices or
the untouched-chat recommendation. An unavailable saved connection keeps that
descriptor; it is not presented as an offered route or silently replaced by a
recommendation. Older hosts omit the field.

`updateSelection` is an explicit compare-and-save using the observed revision
and a stable operation ID. Main validates the profile, resolves its model, and
saves the complete resulting connection/effort pair as the new-chat default.
Retrying the same operation ID and arguments preserves its original outcome;
reusing the ID for different arguments, a stale revision or an unavailable
choice rejects without changing the saved selection.
Saving metadata grants no route authority. Worker activation continues through
`selectProfile()`. `createFromDraft` durably binds the draft to its native
destination and a `firstInputId` before returning an attachment. Use that
input identity for the first submission and every retry after navigation or
restart, so a lost response cannot create another chat or another first input.

After observing selection, capable clients include its `selectionRevision`
in text, image, file, reference, Library or Goal admission. A changed selection
rejects a fresh input before accepting either its text or attachment. A retry
of an accepted input retains its original capture even when selection has
changed. These fields are optional for older callers; use the optional
selection methods to detect whether the host supports revision binding.

`acceptsSelectedImage()` and `submitSelectedImage()` independently negotiate
the original selected raster `File`, separate from legacy inline PNG intake.
`file` freezes its exact original bytes when selected. An optional `originalFile`
keeps the person's original picker/drop File solely for preload to verify disk
origin. Preload hashes the frozen bytes; Main refuses a disk source that no
longer matches the selection. A preview or transformed derivative is never that
frozen source. Without verifiable disk origin, the frozen bytes become a managed
snapshot. Persisted browser File data cannot claim a surviving native origin.
The capability is false for a text-only selected model. Preload and Main
verify a native disk origin when possible and otherwise snapshot the selected
bytes; renderer input carries no trusted path, preview bytes or provider URL.
Text and image are admitted together under one input ID. If either optional
method is absent or the capability is false, preserve the draft and attachment
without silently trying an inline, file-reference or text-only submission.

An offered `NativeChatProfileChoice.imageInput: true` states that this exact
binding accepts the product's normalized PNG image input. Both canonical model
facts and the implemented native adapter must support it; absence is conservative
false on hosts providing this field. It grants no route or filesystem authority
and does not borrow capabilities from a different active worker. Fresh admission
still checks the selected binding and its actual negotiated capabilities.

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
