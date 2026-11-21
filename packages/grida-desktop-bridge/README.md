# @grida/desktop-bridge

Private contract for Grida Desktop's `window.grida` bridge and public
hosted-editor compatibility metadata.

This package exists so the Electron preload and the URL-loaded `/desktop/*`
renderer compile against the same bridge protocol without the editor importing
Desktop source files directly.

## Contract

- Owns the renderer-visible bridge protocol version.
- Owns the typed shape of `window.grida`.
- Owns Desktop-native capability names exposed to the renderer.
- Re-exports shared AgentHost DTOs from `@grida/ai-host` where the bridge forwards
  package-owned HTTP contracts.

`DesktopCompatibility` validates the `desktopVersion` published by the
hosted editor. It requires an update for installed apps on an older major or
minor version and resolves installer links to exact stable release tags.
Desktop Main owns update checks, installation, and restart.
[Desktop release runbook](https://grida.co/docs/contributing/desktop-release)

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

`window.navigation` describes one adjacent entry in each direction in the
Desktop window's own history. Back and Forward take that exact step when the
entry is still within the Desktop route allowlist. The optional
`back_destination` and `forward_destination` fields are `"home"` only for the
plain Home route. Startup restoration and other parameterized routes have no
marker. Older hosts can omit both markers. The bridge publishes destination
markers and availability without exposing history URLs, titles or page state.

`nativeChat` is an optional Desktop namespace. Check `status()` in the
current workspace. If it reports `native-starting`, call the optional
`startWorkspaceChat(preferred?)` with the saved or newly chosen connection.
Main coordinates concurrent visits and provider fallback. The result contains
`readiness` and, when applicable, the actual `selectedProfileId`. File windows
and older Desktop builds use `status(true)`. Known setup failures are fixed
readiness values.
`native-gateway-unavailable` means scoped Gateway access could not be acquired;
it does not identify a worker or storage failure. `profiles()` remains available
before startup succeeds. An explicit `selectProfile()` can open a saved or
configured connection, with no implicit fallback or default retry.
The optional catalogue flag `inputRoutes` means the live workspace host can
accept inputs on different saved connections. After saving the chat selection,
submit or enqueue with its revision on the existing attachment. An accepted
input keeps its own connection across subsequent model calls and queue waits.
For hosts that require changing the workspace worker, the optional catalogue
flag `modelChanges` advertises guarded replacement. Replacement validates the destination before closing
the previous connection, checks all chats for captured work, and saves a new
profile only after launch succeeds. A refusal keeps the previous worker;
`native_chat_model_change_failed_restored` requires loading the previous chat
again because the prior connection was reopened in a new worker.
On the Welcome screen, `welcomeProfiles()` lists the saved-endpoint and
built-in provider-key connections a first chat can choose before its
workspace opens. It starts nothing; the opened workspace selects the choice
as a new connection.
The optional `welcomeTurnCapabilities(workspaceId, profileId)` previews
response speed and search availability for that destination and route. It
reports the effective connection and model or returns null when the route
cannot be resolved. It grants no chat access. The workspace verifies the
current route and capabilities when applying the first message's choices.
When all three optional Welcome Full access methods exist, the app can
prepare an expiring review for one new chat in the selected registered
workspace. Answer it in the same Welcome frame. With
`welcomeFullAccessAcrossPresets`, the review survives same-document Welcome
navigation that changes only the `preset` query parameter. An omitted flag
means navigation revokes the review. Confirmed reservations
survive the review timeout and can be revoked before use. Answering creates no
chat. Start consumes the confirmation once, applies Full access to the
returned chat with the requested model, effort, and optional per-chat speed,
and sends no input. Open
that exact session in the selected workspace to attach and submit through the
ordinary API. The confirmation does not authorize another window, workspace,
or chat.

For automatic review, call `acceptsAutomaticApprovalReview()` to check the
installed executable before showing the choice on Home or in a new workspace
draft. With `defaultsToAutomaticReview`, new project chats start in Auto
when their live worker supports it. Pass `true` as the second argument to
`createFromDraft` to keep a new chat in manual approval mode.
If supported, `prepareWelcomeAutomaticReview(workspaceId)` reserves
that mode. The same frame-bound answer and start methods consume it. The
receiving workspace verifies the exact mode and chat before sending the first
message. An attached chat reports its choices through `permissionMode`.

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

Compatible transcript pages mark a user message with `svgTextSelection: true`
when it carried a live SVG text binding at send. The historical fact exposes
no content, file path or target ID and grants no access. Older hosts omit it.

`submitMessage` accepts a named request carrying authored text and passive
message context. Context has model-facing text and ordered, versioned display
parts. Attachment submissions and Goal starts can carry the same context.
Transcript and queue projections expose the display parts with the authored
text. The bound is 16 KiB for the encoded context, including at most 16 display
parts. An unsupported host reports `native_chat_message_context_unavailable`.

Desktop features build both representations from the same captured selection.
Keep each feature's model vocabulary and display renderer in Desktop and teach
the model that vocabulary in the appropriate skill. Workflows is the first
consumer. The native host treats the display schema as opaque and supplies
model context at the request's existing authority.

`window.grida.chatCatalog?.list({ workspaceId?, limit?, cursor? })` discovers
unarchived chats for Home and the workbench. Omit the workspace to list across
the registered workspaces. The default and maximum page size is 32. Entries carry
workspace and chat IDs, the title, the last recorded message time and independent
running and input-needed flags. Newest messages appear first, and undated chats
follow. Continue with the returned opaque cursor and the same workspace filter.
Request the first page again to observe new activity. The method reads metadata
from live and closed stores and opens no chat. A registered workspace with no
saved chats contributes zero rows. If a participating store cannot be read,
the global query reports an error so clients can distinguish it from an empty
catalog. Older native builds can omit the namespace.

On supporting hosts, call `chatCatalog.observe({}, onChanged)` before the first
list. Pass `{ workspaceId }` to observe one workspace. Reread the first page
when notified, including after reconnection. The returned function releases
the subscription. A missing method or a `null` result means the client uses
its existing refresh behavior. Entries can also carry `readState` for the
latest reply.

For unarchived workspace chats, `list(cursor)` can return `runningSessionIds`
and `inputNeededSessionIds` alongside `sessionIds`. Each independent array
contains only IDs on the page. An empty array means no chat had that status
when read. Older hosts can omit either field. On a capable host, the workspace
picker uses message order and `nativeChat.observeCatalog`. Older hosts retain
creation order and refresh while the picker is open. An attached turn can also carry
`inputNeeded`. Only the frame holding a side chat combines its activity with
the parent's indicators.

Chat listings may carry optional `lastActivity` entries pairing a session ID
with `atMs`; organization entries and Settings archive rows use
`lastActivityAtMs`. These are nonnegative integer Unix milliseconds within
JavaScript's Date range. They describe the latest local turn's first settlement
time, or start time while unfinished, rather than exact message or archive
time. A chat without local turns or an older host omits the value. Listing
dates grant no attachment or control authority.

`organize` can return an opaque `archiveUndo` receipt after archiving a
workspace chat. Pass it to `undoArchive` in the same workspace frame to restore
the exact archived chat without attaching or switching chats. Receipts expire
and can be used once. Older bridges omit the receipt and method.

After `archives.unarchive` succeeds, `archives.openRestored` can use the same
opaque archive row ID to open the restored chat from that Settings document.
This optional action is separate from the metadata-only unarchive. It accepts
no workspace or session ID and its handle expires after use or timeout.

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

Successful activity output can include `images`, at most eight retained
`{ previewId, mimeType: "image/png", size }` descriptors, plus `omittedImages`
when further result images were withheld. The independent optional
`readToolImage(attachmentId, previewId)` reads the exact captured pixels, up to
384 KiB per image. The opaque token belongs to the attached chat and its exact
turn, successful tool call and result part; no source path or native media
identity reaches this API. Missing retained bytes reject instead of rereading
the source. Attachment and crop readers do not accept tool-image tokens. Reads
start no inference and rerun no tool. Older preloads omit the reader; older
native hosts omit the metadata, so keep a visible unavailable state alongside
the tool's text. Native readback independently negotiates
`co.grida/session/tool-images` before exposing metadata or sending a read.

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
`full_access` in its available modes. **Ask for approval** (`restricted`) and
**Auto** (`approve_for_me`) keep the filesystem and command-network restrictions.
Full access deliberately removes
command confinement and ordinary approval prompts; OS-user file permissions
still apply. `reviewPermissionMode` issues a short-lived intent for the exact
attached chat, revision and request. The owned React confirmation shows the
native chat title and friendly project name, then answers that intent. Cancel
returns null and changes nothing. Main rechecks the attachment and the native
host performs revision admission; a navigated or foreign frame cannot finish
the grant. This is confirmation in the trusted app UI, not an independent OS
user-presence proof against a compromised eligible renderer. The native owner
persists this per-chat choice separately from model and effort defaults. New
Desktop project chats use **Auto** where the host offers it and **Ask for
approval** otherwise. Existing chats with no saved choice stay in **Ask for
approval**.
Current hosts apply changes to newly accepted work. Running and queued work
keep their captures. Some older hosts report a busy chat. Stable request IDs bind retries to the original decision. Queries and
changes start no inference. Older hosts that omit methods or return false use
the **Ask for approval** presentation without a selection action.

An attached chat can offer **Auto** when its available modes contain
`approve_for_me`. Selecting it delegates eligible individual decisions and
preserves command confinement. A private review can leave the original wait
open for an exact manual answer. Pending approvals may carry `reviewFailure`.
A finite command includes its filesystem reach and environment names. If that scope is missing, Desktop offers only Decline.
The transcript's optional `approvalReviews` records the review decisions and
their bounded action descriptions.

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

Workspace panes can report whether their attachment is visible with
`setPresented(attachmentId, visible)`. A background question can trigger
a notification while a different tab is in view. A side-chat click includes
`side: true` and can be taken only by the frame still owning that side.

## Native browser

`browser` is optional under the unchanged outer Desktop bridge protocol 1.
The browser contract is version 4 with `presentation: "webview"`. Offer browser
pages only when `caps.native.browser === true`, the namespace exists,
`browser.version === DesktopBrowser.VERSION` and `browser.presentation ===
"webview"`. Installed version-1, version-2 and version-3 browser hosts are incompatible:
withhold version-4 requests until the native host is updated, preserving saved
tab URLs for restoration instead of erasing them while the feature is
unavailable. Missing browser capability remains valid. Version-2 scoped clear
operations must never be aliased to the version-3 global clear. Browser operation
does not start chat or depend on file or media services.

`attach(workspaceId)` asks Main to admit the exact top-level document to a
registered workspace and returns its authoritative page snapshot. Main issues
an attachment ID bound to that document generation. The renderer cannot name
another window, generation, native path or session. A well-formed identity or
capability flag grants no authority. Every request rechecks native admission
and page ownership; stale, foreign or invalid requests reject.
Workspace identity authorizes ownership and tab placement; it does not select
a browser storage profile.

Subscribe before attaching or reading. Buffer outcomes during a read, then
apply only outcomes for its attachment with revisions greater than the returned
snapshot. Changed pages carry the outcome's owner revision. Snapshot page
revisions cannot exceed its owner revision. Ignore already-seen outcomes;
a revision gap requires a new snapshot. A method response must never replace a
newer retained view. Metadata is untrusted plain text.

Main-created pages use `Event { type: "created", attachmentId, revision, page,
openerPageId, disposition }`. The page revision equals the outcome revision.
`openerPageId` is an opaque identity in the same attachment, or null when no
opener is retained; it cannot name the created page itself. `disposition` is
`"foreground"` or `"background"`, independently from actual input focus. Apply
creation using the same attachment/revision rules as other outcomes. A snapshot
is authoritative even when creation notifications were missed. Neither a valid
opener string nor a received page descriptor grants authority over another
attachment or permits arbitrary native guest adoption. Native window opens
that retain web opener/POST behavior remain native-owned web content.

`close(target)` resolves true after the page closes. It resolves false when the
user chooses to keep the page, such as Stay in a before-unload dialog. Keep the
tab and live page on false; admission and operational failures reject. This is
part of the incompatible version-4 contract, rather than an older void close
being interpreted as successful closure.

### Guest mounting and presentation

`create({ attachmentId, url? })` creates a page descriptor with
`mounted: false`. Omitting `url` requests a blank page. Submitted destinations
must be absolute HTTP(S) URLs without credentials, controls or backslashes;
`normalizeUrl` validates them without guessing a scheme.

`reserveMount(target)` returns only `GuestMount { src }`. Pass this Main-issued
bootstrap URL unchanged to a connected DOM guest. Its exact form is
`about:blank#grida-browser-mount=<opaque identity>`. This is a transient one-use
admission claim, not the website URL, a native guest ID or a choice of session
or preferences. Main issues unpredictable claims and binds them to the exact
attachment, document and page. `parseGuestMount` validates only the bounded
shape; syntactically valid or copied claims do not establish native authority.
An unused reservation may be returned again; a consumed claim cannot create
another guest, and an already-mounted page refuses a second reservation.

Main strips untrusted guest attributes, fixes preferences and the prepared
session, and consumes the bootstrap before automatic navigation. It registers
the actual guest supplied by native attachment events, installs guards, then
loads the vetted destination. A changed page with `mounted: true` acknowledges
that actual registration. Pending or failed mounting does not. Failed mounting
uses a bounded `failure.kind: "mount"`; navigation and renderer failures retain
their own classifications. No public adoption or raw guest-ID API exists.

The document's presentation owner keeps guest nodes connected through React
subscription/remount cycles, tab selection and same-document layout or group
movement. DOM/CSS owns geometry, rounded clipping, visibility and composition
with menus and dialogs. There is no native layout, bounds, radius or overlay API. The independently
optional page zoom operation changes website scale, never presentation geometry. `setActive({ ...target, active })` communicates input/focus
eligibility only. Main must not focus an inactive page; presentation must
relinquish the guest's DOM focus and disable its input when inactive. Main's
`focus` command alone does not establish the containing DOM element's focus.
Background timer/media behavior follows the host's declared Chromium policy;
remaining connected does not promise unthrottled playback.

### Document and storage lifetime

`detach` ends the attachment's pages and guests, preserving browser profile data.
Replacing, reloading, crashing or destroying the containing document likewise
ends its live guests. A new document reconstructs eligible URLs with fresh page
and mount identities; URL restoration does not restore running documents,
forms, scroll positions or live navigation history. Moving to another window
also reconstructs URLs rather than transferring a running guest.

Within the same owning document, a destroyed guest can remain as a failed
page descriptor with `mounted: false`; explicit retry reserves a fresh guest
at its retained URL. A crashed guest that still exists remains mounted with
an observable failure. Neither case grants adoption of another guest.

All built-in browser pages and windows use one native-managed persistent browser
profile, isolated from the Desktop account and provider sessions. There are no
workspace profiles, private-page scopes or caller-selected storage identifiers.
Website login and storage survive page, window and document teardown, including
closing every browser tab and later opening a page in another workspace.
`openExternal` uses the page's current native-validated HTTP(S) URL, accepting
no caller-provided destination.

`clearBrowsingData()` takes no arguments and is the same action from a workspace
or Settings. Main requires the exact admitted top-level document and displays
its own confirmation explaining that all built-in browser tabs/windows and
website data are affected, with Cancel selected by default. It rechecks that
document's generation and role after confirmation, before clearing begins.
Settings needs no open workspace or catalog selection and gains no attachment
or page authority. `false` means explicit cancellation; `true` means clearing
completed. Stale admission and operational failures reject.

The global clear lock blocks racing page/mount admission and operations. Main
revokes pending mounts, aborts icon/download/capture work, closes every owned
page and clears website storage, cache, HTTP auth and connections. It also
cleans narrowly recognized legacy experimental browser partitions when present;
no caller supplies paths or partition identities. The shared profile can start
fresh without automatically merging legacy cookies. No cleanup occurs merely
because a document closes or a newer host starts. Explicit clearing deletes
no downloaded files and changes no Desktop account or provider profile.

### Shared browser history

`browser.history` is independently optional on version-4 hosts. Offer its reads
and removal only when the group exists and `history.version ===
DesktopBrowser.History.VERSION` (currently 1). Its absence leaves ordinary
browser pages, navigation and global clearing available. This group does not
change strict `Page`, `Snapshot` or `Event` projections.

The native host owns one bounded persistent history collection across browser
tabs, workspaces and windows. It records actual committed HTTP(S) guest
navigation, not renderer keystrokes or supplied visit records. The collection
contains only canonical URLs, untrusted page titles and the last visit time.
It is separate from a guest's live back/forward stack. Retention and persistence
belong to Main; no database path, profile, partition, page ID or visit insertion
crosses this protocol.

`history.query({ query, limit })` returns `History.Snapshot { version, revision,
entries }`. `query` is bounded to 512 UTF-8 bytes without control characters or
unpaired surrogates. The host trims the query and compares lowercase URL/title
substrings using the default JavaScript `toLowerCase()` conversion; a blank
query reads recent entries. `limit` is a required integer from 1 through 100.
Results contain no duplicate URLs and are sorted by descending `lastVisitedAt`,
then ascending URL in UTF-16 code-unit order. Each `Entry` contains exactly
`{ url, title, lastVisitedAt }`: canonical credential-free HTTP(S) URLs up to
8 KiB, titles up to 1 KiB, and a nonnegative integer Unix millisecond timestamp
within the JavaScript Date range. No remote typeahead request is implied by a
query. `History.parseQuery`, `parseEntry` and `parseSnapshot` enforce these
bounded projections; they establish no native admission.

`history.remove({ url })` removes only that exact canonical URL. It neither
matches a prefix nor clears website data. An absent URL succeeds without
changing the collection. `History.parseRemoval` refuses noncanonical aliases
instead of silently rewriting the removal identity. Global `clearBrowsingData`
also empties retained history; cancellation leaves it intact. Main serializes
clear and pending writes so an earlier visit cannot resurrect deleted history.

`history.subscribe(handler)` reports only `History.Change { revision }`
invalidations, validated by `parseChange`. Revisions increase for observable
collection changes within the current native process and are independent of
page revisions and attachment IDs. Subscribe before querying, discard responses
older than the latest observed collection revision, and discard responses for
superseded queries. A notification means to reread; it carries no private URL
or guessable entry identity. Main delivers notifications only to currently
admitted documents and withdraws them when their admission ends.

Reads, removals and subscriptions require the exact current admitted workspace
or Settings top-level document, rechecked by Main. Settings needs no open page
or attachment and gains no page-control authority. Website guests and stale or
foreign documents receive no history metadata. History reads start no work in
guests, grant no filesystem or network authority and expose no icons or scripts.

### Optional page utilities and browser management

`browser.utilities` and `browser.management` are independently optional. Check
each group and its own `version` against `Utilities.VERSION` or
`Management.VERSION` (both currently 1) before exposing its actions. Missing or
unknown groups leave ordinary pages available. Utilities require the exact
current attachment and owned page; global management requires the current
admitted workspace or Settings document and grants no page-control authority.

`utilities.find({ attachmentId, pageId, text, forward, findNext, matchCase })`
performs a bounded page-text search, with an explicit nonempty query up to
1 KiB and required boolean options. It resolves the final native
`FindResult { matches, activeMatchOrdinal }` for that request. Counts are
nonnegative safe integers; the one-based active ordinal can be zero when no
result is active and cannot exceed matches. A replaced search, navigation or
lost page must not resolve with another search's result. `stopFind(target)` ends
finding and clears its selection. No native request ID or match geometry is
exposed. The corresponding parsers return frozen strict projections.

`getZoom(target)` reads the website zoom factor. `setZoom({ ...target, factor })`
accepts a finite factor from 0.25 through 5 and returns the applied factor.
`print(target)` opens ordinary Chromium print UI. `inspect(target)` opens that
owned page's native DevTools. Neither accepts scripts, debugger commands,
protocol methods or native print options. These are user actions on their owned
website, not a programmatic inspection transport.

`management.clearHistory()`, `clearCache()` and `resetPermissions()` accept no
arguments. They respectively clear recorded visits, clear HTTP cache while
preserving website sign-ins/history, and revoke browser site permission grants.
They resolve true on completion and false on user cancellation if a native
confirmation is shown; failures reject. They neither select an origin nor
touch application account/provider state. Narrow clear actions do not imply
the full `clearBrowsingData` operation, which retains its native confirmation
and all-pages cleanup contract. History clearing uses the existing collection
revision/invalidation and persistence ordering rules.

`downloadPreferences()` reads `DownloadPreferences { askBeforeDownload,
directoryName }`. `setDownloadPrompt({ askBeforeDownload })` changes only that
choice and returns the current preferences. A true value asks where to save
each download; otherwise Main selects its managed default directory.
`chooseDownloadDirectory()` opens a native directory chooser and returns updated
preferences, or null on explicit cancellation. The renderer supplies no path.
`directoryName` is display-only: a nonempty folder basename up to 256 UTF-8 bytes,
or null for the system default. It contains no slash, backslash or control
characters and grants no filesystem authority. Native Main owns the actual
path, naming/collision policy and download destination; no downloaded file is
opened automatically. Preference parsers reject additional native options.

`management.openPage({ url })` is independently optional even on Management v1.
Check the method exists before offering it. The destination must already be a
canonical credential-free HTTP(S) URL; `Management.parseOpenPage` refuses
aliases, generated locations and additional fields. This user intent asks Main
to open a new page in an existing admitted workbench and focus its shell. It
resolves false when no eligible workbench can receive it, true once delivered;
admission and operational failures reject. Main chooses and rechecks the actual
current owner/attachment before creating the page and publishing its outcome.
Settings gains no attachment, window selector, existing-page control or native
guest authority from requesting the new page.

### Bounded presentation reads and trust limits

`parsePage`, `parseSnapshot` and `parseEvent` accept bounded protocol
projections: at most 64 pages, URLs up to 8 KiB, titles 1 KiB and public failure
messages 2 KiB in UTF-8. Guests receive no application bridge preload or `window.grida`, even when
visiting Desktop URLs. Any native-approved website helper remains a fixed,
sandboxed guest-only boundary with no application capability. Main owns browser sessions, preferences, preload admission, destination policy,
new-window ownership, permission choices, downloads and mount ownership.
Chromium web security remains enabled; ordinary website behavior does not
establish native authority.

Live `Page.url` is bounded transient location metadata. `normalizeLocation` also
accepts `about:blank`, `about:srcdoc`, HTTP(S)-origin or null-origin `blob:`
locations and `data:` documents. The reserved mount bootstrap is excluded.
Generated locations grant no native navigation or resource authority. A host may
report `data:` as a display fallback when the full generated URL exceeds 8 KiB;
it must not let an oversized generated location invalidate the whole page.

`normalizeUrl` remains strictly HTTP(S). Typed `create`/`navigate` requests,
external handoff, persistent history, saved tab restoration and favicon fetches
must use that narrower validator. Never persist or restore a generated live
location. A containing renderer that retains a restoration URL keeps the last
eligible HTTP(S) URL separately from transient generated locations.

Stock Electron webview gives its trusted containing renderer built-in control
of its own guest, including scripting and navigation. The typed bridge does not
remove those intrinsic methods. Ordinary generated web documents remain in the
sandboxed browser context and cannot acquire native, account or provider
privileges. This is a native authority boundary, not a content filter. No agent,
MCP, debugger/CDP command transport or generic automation API is added here.

`thumbnail` remains independently optional. Check it before requesting an image;
metadata hover previews remain available without it. It reads only the existing
attachment/page target's best-effort last rendered viewport. An unavailable,
never-rendered or failed capture returns `null`; stale or invalid admission
rejects. Reads must not show, focus or navigate a hidden guest. Main bounds
concurrency and rechecks attachment, page instance and navigation after capture.
The compositor-frame wait has a 1,500 ms deadline; a stalled capture returns
`null`. Expiring that wait does not start another capture: the owner retains
one actual in-flight capture until it settles or its page/attachment lifetime
ends.
Discard late previews after their target or observed page changes.

`Thumbnail` contains only `dataUrl`, `width` and `height`. `parseThumbnail`
accepts canonical JPEG base64 with matching encoded dimensions, up to 320 by
180 pixels and 64 KiB of decoded bytes. It checks baseline/progressive JPEG
framing and dimensions, not the complete codec. Pixels are untrusted display
data; no persistence or freshly rendered frame is promised.

`favicon(target)` is an independently optional read of the page's transient
cached icon. Matching version-4 hosts can omit it without disabling browser pages.
It returns `Favicon { dataUrl }` or `null`; it accepts no URL or fetch options.
Page and event projections remain unchanged, so older strict parsers still
accept them. When the cached icon changes, Main emits an ordinary changed page
with a new revision; reading a stable cache does not emit another outcome.

Main fetches only bounded website icon candidates through the actual guest's
isolated session, with limits on candidates, redirects, bytes and elapsed time.
It binds results to the exact guest and navigation lifetime and clears them on
document replacement or guest/page destruction. Unsupported or unavailable
icons fall back without failing the page. Consumers discard late results after
navigation or target changes, retain icons across ordinary selection/focus
changes and never persist them or load remote icon URLs in the workbench.

`parseFavicon` accepts only canonical base64 raster data URLs, up to 64 KiB and
256 pixels per edge. `FAVICON_MIME_TYPES` lists PNG, ICO (both accepted MIME
spellings), JPEG, static WebP and single-image GIF. ICO is limited to 16 PNG or
uncompressed bitmap entries; animated containers and SVG are unsupported.
Validation checks container framing and dimensions, not the complete codec.
The bytes remain untrusted: Chromium decodes them in the sandboxed renderer;
Main must not decode website images with a native image codec. A renderer
decode failure uses the generic icon fallback. No favicon service, persistence,
page-script evaluation or general fetch capability is exposed.

## Anti-goals

- Not an Electron IPC package.
- Not an AgentHost HTTP client.
- Not a native Desktop runtime.
- Not a public plugin or extension API.
- Not a place for secrets, route strings, fetch logic, or filesystem access.
- Not a generic browser automation API: no typed script execution, debugger/CDP,
  agent tools, raw native events, credentials, generic IPC or caller-selected
  Electron options. Stock webview's intrinsic trusted-embedder methods remain
  outside this typed protocol.

Grida-funded Tripo additionally requires `caps.media.tripo_gg` for generation
or `caps.media.rigging_gg` for eligibility/rigging. These optional flags gate
new hosted input uploads independently from the older generic GG capability.
Requests explicitly select `provider: "gg"` or `provider: "tripo"`; omission
of a funded capability means the renderer must not advertise that lane.
