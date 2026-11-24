# Rust core pressure test

This is a design walkthrough of the [Rust agent core](./rust-core.md). It
follows a minimal master and a durable session through their public contracts,
then checks those contracts against Grida's features. The traces are paper
executions that establish contract consistency; the regression obligations
below record where each outcome has actually been observed.

Grida evidence comes from the current source and its adjacent tests. Each
guarantee is stated by its domain rationale, independently of how any
implementation currently provides it.

## Existing harness assessment

The existing harness supplies useful behavioral evidence and past failure cases.
Its coverage is uneven, and a test title can claim more than its assertions or
entrypoint establish. The canonical product description therefore retains the
current fact, intended outcome, and consequential caveat. The harness records
which part of that description has actually been observed.

| Existing material                                   | What it establishes                                                | Limit of that evidence                                                                                                                                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Manual interaction cases](../../../test/README.md) | Product situations, rationale, visible outcomes, and known limits. | Linked automated coverage does not establish that a composed interaction has passed. The [canvas refresh case](../../../test/desktop-workbench-canvas-resource-refresh.md) records a prior verification, which still needs repeating after relevant changes. |

The manual registry is a useful writing precedent. Its scope is interaction
verification, and a fully automated case can be marked deprecated there. The
underlying product promise must remain in its canonical feature description.

Native coverage of each product situation is listed under
[Regression obligations](#regression-obligations).

Live provider and platform evidence is bounded. The macOS Apple Silicon headless
host has live OpenRouter `openai/gpt-4.1-mini` checks of text and
permission-checked file reads across Plan and Act and Standard and Ultra
effort. A development macOS Desktop host has live OpenRouter
`google/gemini-3.8-flash` checks of a reply, a workspace-file read, follow-up
context and transcript restoration without repeated inference. The Linux ARM64
host and retained Desktop service have isolated kernel, process and restart
checks. Other live providers, operating systems and architectures, full Linux
installer delivery and signed distribution are unqualified.

## Coverage model

The feature catalog inventories product capabilities. Completeness is assessed
through their behavior across a bounded set of questions.

| Question                                     | Contract to establish                                                                     |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| What was requested and accepted?             | Input identity, scope, acknowledgment, and the current objective.                         |
| Who may act and who owns the work?           | Grants, execution owner, delegated authority, and resource limits.                        |
| What happened and what proves it?            | Recorded effects, receipts, available artifacts, and observed results.                    |
| How can work be corrected or interrupted?    | Steering, questions, pause, cancellation, and races with completion.                      |
| What survives failure or loss of connection? | Recoverable state, uncertain effects, and safe replay or retry.                           |
| What is retained, shared, or deleted?        | Content lifetime, ownership, publication, and cleanup.                                    |
| Which other work can interfere?              | Concurrent writers, children, queued input, source changes, and unavailable capabilities. |

Review each in-scope user journey through these questions. Cross-feature cases
are selected from known failures and shared boundaries. The coverage claim names
the reviewed scope and remaining unknowns. Further feature names alone do not
establish that the implementation will behave correctly.

Architectural conformance follows the canonical
[rings and placement rules](https://grida.co/docs/wg/ai/agent#architecture-rings).
The native [checked dependency budgets](./rust-core.md#dependency-budgets)
and [`dependency_boundaries`](../tests/dependency_boundaries.rs) establish
declared package ownership, including conditional/build edges and test-only
allowances. They do not establish semantic genericity; the owning behavior
contracts and their conformance cases must also show that product choices
remain replaceable without changing execution invariants.

## Regression obligations

These are product situations the native implementation preserves. Each states what
a person should be able to observe, followed by the existing evidence and its
limits. The mechanics of a supporting test can change while that expectation
remains. The following distinctions guide that extraction.

| Classification              | Treatment                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------- |
| Domain invariant            | Preserve it in the owning contract and prove it in the new implementation.             |
| Current implementation fact | Retain it as evidence, with its source and limits. Select new mechanics independently. |
| Unresolved requirement      | Record the unknown, the decision owner, and the evidence needed to resolve it.         |

An eight-step loop, a single-root registry, a particular slash syntax, and the
current sandbox dependency are implementation facts. Stable input identity,
explicit authority, accurate effect accounting, and correctly routed invocations
are requirements to preserve. Document behavior belongs to its implementation.

Each case records the available proof and its scope. The legacy tests document
the failure or invariant, and the native tests show where the native path has
been exercised.

| Case                                                             | Product situation and required outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Existing evidence and limit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1 — reopen a waiting chat                                       | Reopening a chat shows its queue and pending decisions. The first transcript page can appear while pending decisions and composer capabilities load. Viewing it starts no additional work or chargeable request. [Sessions](https://grida.co/docs/wg/ai/agent/components#sessions) owns observational access.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | [Native process tests](../tests/process/compaction.rs) keep the exact queue across pause and restart until Stop is released, and a [pending question](../tests/process/questions.rs) survives restart. [Master tests](../../grida-agent-master/tests/durable.rs) show that observing a settled answer starts no work, and the [controller](../../../editor/lib/agent-chat/native-chat-controller.test.ts) offers queue recovery only as an explicit action and publishes the first page while capability and control reads are held open. The [Desktop startup regression](../../../desktop/src/main/native-chat-ipc.test.ts) exercises reopening the workspace during provider fallback, listing saved chats and accepting the waiting Welcome message once. Billing and the rendered reopened chat are not checked.                                                                                                                                                                                                                                                                                                          |
| R2 — reconnect after a completed action                          | Reconnecting or retrying preserves the previous result once, and the person can continue without losing it or repeating the action. [Runtime journal](https://grida.co/docs/wg/ai/agent/components#the-execution-journal) owns result identity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | [Master tests](../../grida-agent-master/tests/durable.rs) reuse committed tool results in the next model request, [summary process tests](../tests/process/summaries.rs) reopen settled turns without provider work, and the [external peer test](../tests/external_acp.rs) reconciles an unconfirmed dispatch without replay. They do not count real external actions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| R3 — switch documents during an edit                             | An accepted call retains its addressed endpoint and document arguments, or reports that endpoint unavailable. [Workspace contract](https://grida.co/docs/wg/ai/agent/workspace#authority-and-changes-during-work) owns the target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | [Native Main tests](../../../desktop/src/main/native-gateway-svg-text.test.ts) exercise exact selected-text ownership. The rendered nested-deck case verifies stale selection refusal after a slide switch, and explicit save to the addressed bundle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| R4 — return to uploaded-image work                               | After interruption or restart, the agent restores the exact input promised by its retention policy or explains what must be supplied again before continuing. [Scratch retention](https://grida.co/docs/wg/ai/agent/scratch#s2--declared-retention-and-recoverability) owns availability.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | [Native PNG process tests](../tests/process/images.rs) verify retained bytes and working copies after reopen. A missing original produces guidance before provider dispatch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R5 — retry saving a generated result                             | If generation succeeds and saving fails, retain the result or recovery record. Retrying the save uses the completed generation. [Artifact evidence](https://grida.co/docs/wg/ai/agent/components#integration-capabilities-and-bounds) owns this distinction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | [Desktop media fixtures](../../../desktop/src/sidecar/media-startup.test.ts) retry a retained MP3 copy with one provider request and preserve the live result when the library cannot publish a receipt. [Native crop fixture](../../../desktop/src/main/native-agent-images.test.ts) covers retained chat output.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| R6 — start a fresh workspace chat                                | A new project starts with no registered checks. Default-folder discovery and first chat creation work before any chat or check has been saved; protected private contents remain inaccessible. Introducing optional checks must not make first launch depend on earlier state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | [Desktop composition evidence](../../../desktop/src/main/native-desktop-agent.test.ts), [native service evidence](../../../desktop/src/main/retained-service-sandbox.test.ts).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| R7 — open Desktop while provider networking is slow              | Local services start without waiting for provider proxy setup. Authorized provider work waits for readiness, remains cancellable and rechecks its grant before dispatch; network failure grants no fallback access. Native API requests retain an application client identity even when the provider adapter supplies none; they never borrow browser cookies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | [Private channel regression tests](../../../desktop/src/main/provider-network-host.test.ts) exercise held and failed initialization, cancellation, shutdown and revoked grants.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R8 — start a development chat without a ready default connection | Starting Desktop preserves its native executables across build cleanup. A login shell that waits for input cannot prevent the workspace worker from opening. If default Gateway access is unavailable, the user can inspect and explicitly select a configured connection before opening chat; old default history is not loaded under that choice. A pane reconnect waits for any outstanding selection before restoring its connection and opening history.                                                                                                                                                                                                                                                                                                                                                                           | [Shell capture](../../../desktop/src/main/native-agent-command-profile.test.ts), [composer recovery](../../../editor/scaffolds/desktop/workbench/native-chat-focus.browser.tsx), [development resources](../../../desktop/src/main/native-desktop-profile.test.ts), [Main recovery](../../../desktop/src/main/native-chat-ipc.test.ts), [configured worker](../../../desktop/src/main/native-desktop-agent.test.ts) and [client controller](../../../editor/lib/agent-chat/native-chat-controller.test.ts) cover the boundary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| R13 — read finished work in a long chat                          | Each finished turn collapses its commentary and actions beneath a timed header, with the final answer visible outside it. Expanding shows the recorded work in order; reopening and earlier pages keep each turn's grouping. Neither repeats work nor requests inference. Stopped and failed turns stay distinct, and pending questions or approvals stay actionable. Recognized shell commands show their targets during work and after reopening. Their actual command and outcome stay available in details. [Finished turns](https://grida.co/docs/wg/ai/agent/experience#read-each-finished-turn) owns the outcome; the master identifies answers and the host projects command actions.                                                                                                                                           | [Store tests](../../agent-kit-store-sqlite/tests/store.rs) record turn timing and attribution; [master tests](../../grida-agent-master/src/activity.rs) classify answers, stopped turns and tools; [native process tests](../tests/process/history.rs) replay attributed activity and [stream it live](../tests/process/live.rs); [retained tool-image process tests](../tests/process/tool_images.rs) read published result pixels before settlement and preserve exact prepared result identity and pixels after source replacement, deletion and reopen, with scoped refusals and honest missing-byte outcomes; the [Main](../../../desktop/src/main/native-agent-process.test.ts), [controller](../../../editor/lib/agent-chat/native-chat-controller.test.ts) and [grouping](../../../editor/lib/agent-chat/turn-activity.test.ts) cases cover projection and disclosure. The [manual case](../../../test/desktop-agent-chat-turn-activity.md) was exercised in the isolated Electron app with a loopback model: successive turns, disclosure, stop, rejection, restart and an earlier page, with no added model request. |
| R14 — pause, then resume or move on                              | Pause takes effect at once and keeps the turn; Resume continues the same turn. Sending instead ends the paused turn as stopped and runs the message next. A response cut off by the interruption stays in the transcript but not in model context: after Resume the model reads a note asking it to continue from where it stopped, and after Stop the next turn reads an interruption note. Completed tool work is kept. [Interrupted responses](https://grida.co/docs/wg/ai/agent/master#interrupted-responses-in-model-context) owns the rule.                                                                                                                                                                                                                                                                                       | [Native process tests](../tests/process/lifecycle.rs) cover resume with the note in place of the cut-off reply, a stopped reply's note in the next turn, and resume after restart with steering; the [controller](../../../editor/lib/agent-chat/native-chat-controller.test.ts) orders stop, enqueue, place and resume for a message sent while paused. The [manual case](../../../test/desktop-agent-chat-composer-intents.md) was exercised in Electron with a loopback model.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| R15 — plan with a folder that Act may change                     | With a command-capable workspace, Plan can find, search and read files through a confined command while project files stay unchanged. Desktop’s default launch permits ordinary disk reads outside the project. A narrow profile limits those reads to its existing grants. Requested writes and command networking are denied even when the chat uses Full access. Eligible new Act and Plan turns use the shell for exploration. A disk-read profile reads ordinary files directly. A narrow profile can also supply one independently granted file. Restricted commands keep the global agent configuration protected. A replaced outside-project file needs fresh approval. A queued or interrupted turn retains its accepted tools and permissions through queue edits and restart. Acting on the plan takes a new Act submission. | [Native command cases](../tests/process/approvals.rs) cover workspace exploration, broad and narrow Plan reads, separately granted file input, global configuration protection, and read-only confinement. [Operating-regime cases](../tests/process/operating_regime.rs) cover retained Plan work and the separate Act transition.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| R16 — find a saved chat by local activity                        | A saved-chat list can report the latest retained local turn’s start or first settlement time without opening the chat, reading its transcript or starting work. A chat without local turns has no date. Rename, archive, restore, retries and reopen preserve that fact; turn timing preserves creation order and grants no mutation authority.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | [Store catalog tests](../../agent-kit-store-sqlite/tests/catalog.rs) establish retained timing, ordinal selection, bounded indexed reads, scope, cursors and unchanged mutation preconditions. [Native catalog process tests](../tests/process/catalog.rs) compare standard/archived ACP metadata, organization entry reads, live Settings archives and the detached command through start, Stop, rename/archive retries and reopen; they require absent fields without turns and refuse timestamp write inputs. Providers are synthetic. Calendar formatting and composed Desktop interaction need their own evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

For message-ordered discovery, an old chat outside the first creation-order
page must become the most recent across workspaces when it receives a new
reply. A filter for its own workspace includes it, a different workspace
excludes it, and reopening preserves the order. Private chats stay out of
every public page. A rename or status transition alone cannot promote a chat.
The [native catalog cases](../tests/process/catalog.rs) exercise the host
query and the [Desktop catalog integration](../../../desktop/src/main/native-agent-chat.test.ts)
exercises the same scenario across two independently owned stores.

The [catalog process cases](../tests/process/catalog.rs) also check the
title returned to an unattached workspace reader. A rejected first send leaves
the catalog untouched. The accepted excerpt survives replay, failed generation
and restart. A saved manual rename wins in either order with a generated
title, including when the rename used the revision observed before generation.

Newly discovered caveats extend this section only when they establish a distinct
failure or uncovered contract. Each entry retains its cause, owner, evidence,
and required observation. Related detail belongs beside the owning contract.

Shared read positions require two independent client observations. If a new
reply arrives after one client displayed an earlier reply, acknowledging the
earlier reply leaves the new one unread. Acknowledging the new reply can
clear it. A subsequent manual mark must survive a late
duplicate of that acknowledgement, a reopened store, and catalog queries.
Both actions preserve message time. A different workspace cannot mutate
the chat's read state. The [store catalog regression](../../agent-kit-store-sqlite/tests/catalog.rs)
exercises settlement and reopening. The [native catalog regression](../tests/process/catalog.rs)
checks the public wire operations from two clients against a synthetic provider.

When a user edits an earlier message, the catalog must follow the current
history view. The [history revision regression](../tests/process/history.rs)
holds the replacement turn open so a new reply cannot mask an obsolete read
position. Catalog recovery must also preserve observation across a replaced
store directory and allow a worker to open an older store during discovery.
Private journal changes should leave an unrelated catalog observer idle.

### Discovery audits

Discovery draws on independent sources rather than waiting for a remembered
feature or bug. Entry points expose callable behavior. Tests expose corner
cases. Fix history supplies causal evidence. User workflows and reference
systems challenge coverage, while the current implementation remains the source
for claims about existing behavior.

A source audit enumerated candidate test files across the agent, daemon, and
chat-client scopes, then inspected targeted cases and relevant fixes. This is a
bounded source review. Live application behavior, native enforcement,
and provider execution still require their own acceptance evidence.

| Additional case                                  | Product situation and required outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Existing evidence and limit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R16 — switch chats during work                   | After switching from chat A to B, A's delayed output stays in A and B retains its own controls. Sending an ordinary message hands off its text and ordered attachments together. The next draft survives a reload or delayed receipt, even when its text matches the accepted message. Other chats keep their drafts through handoff, retry and refusal. Identical follow-ups keep their queue positions. The workspace picker can show A running and clear its indicator when its turn pauses or finishes.                                                                                                                                         | [Native catalog tests](../tests/process/catalog.rs) observe a running turn from a separate client and its settlement. [Desktop adapter tests](../../../desktop/src/main/native-agent-chat.test.ts) exercise the packaged worker. The [picker interaction](../../../editor/scaffolds/desktop/workbench/native-chat-focus.browser.tsx) switches to B and observes A stop while the list stays open, without loading A. The [Home-to-workspace regression](../../../editor/lib/agent-chat/native-chat-selection-controller.test.ts) holds workspace resolution and native admission independently. The headless [draft binding](../../../editor/lib/agent-chat/composer-draft-binding.test.ts) and [draft store](../../../editor/lib/agent-chat/composer-drafts.test.ts) cases exercise a chat switch, a late receipt, and an explicit move from a new draft to its assigned chat. [Controller cases](../../../editor/lib/agent-chat/native-chat-controller.test.ts) cover mixed sends and retiring an accepted draft on receipt recovery.                                                                                                                                                                                                            |
| R17 — a submitted message cannot start           | A rejected message remains available to queue or retry. An existing question stays answerable, and repairing the displayed history preserves valid ongoing work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | [Native raster process cases](../tests/process/raster_images.rs), [Main delivery cases](../../../desktop/src/main/native-agent-selected-images.test.ts) and [controller cases](../../../editor/lib/agent-chat/native-chat-controller.test.ts) exercise whole-draft refusal, source identity and exact unknown retries without dispatching a text subset. Finder and clipboard interaction remain separate evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R18 — change models after attaching images       | Same-named images keep their identities. At submission, the selected model and available tools can use the intended image, or the person receives an actionable rejection.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | The [controller cases](../../../editor/lib/agent-chat/native-chat-controller.test.ts) preserve explicit image intent across saved-selection changes and refuse incompatible sending without dropping text or pixels. [Native raster cases](../tests/process/raster_images.rs) verify source/retained identities. Older hosts retain their negotiated refusal behavior; installed picker interaction remains pending.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| R19 — change models after tool work              | Choosing another authorized connection between completed turns keeps visible history and observed tool results without replaying private state under a different model, principal or scope. Reopening compatible work preserves its accepted route. The live snapshot and earlier transcript pages report the model captured for each turn, including queued work. A turn without that evidence has no model ID.                                                                                                                                                                                                                                    | The [native Responses process case](../tests/process/responses.rs) uses a synthetic subscription supervisor, reads a real fixture file, changes models, restarts both routes and explicitly selects another subscription scope with portable context. It verifies historical tool context and compatible encrypted replay; it does not certify live subscription availability.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| R20 — request Ultra on a supported connection    | Ultra runs an independent reviewer through the selected connection and returns its finding to the parent, including subscriptions and anonymous compatible endpoints. Goals reserve the same bounded work. Stop cancels both owned requests; reopening preserves their outcome. Provider reasoning and optional wire token limits remain separate.                                                                                                                                                                                                                                                                                                  | The [effort protocol matrix](../tests/process/effort.rs) runs real reviewers with compatible, Responses, Anthropic and Gemini adapters. The [private supervised process cases](../tests/process/responses.rs) verify anonymous-compatible review, subscription review and Goals with the wire token cap absent, isolated reviewer context, collected findings, cancellation and restart. All provider replies are synthetic; live provider availability is not certified.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| R9 — a completed change cannot be announced      | A completed change remains effective even if its notification fails. Retrying recognizes that the change already happened.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | The [catalogue test](../../../packages/grida-ai/src/model-catalog.test.ts) preserves applied state after a listener throws. Broader action recovery is an unresolved requirement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| R10 — repeated service failures                  | Repeated unavailable or oversized responses leave the application usable, and cancellation releases the work it owns.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | The [response-body test](../../../packages/grida-ai/src/model-catalog.test.ts) checks cleanup for selected rejected responses. It does not establish long-running UI responsiveness or every exit path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| R11 — replace an image used by an open canvas    | The canvas and its previews refresh while preserving unsaved edits. If edits delay refresh, it becomes visible after save or reload.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | [Reload tests](../../../editor/scaffolds/desktop/workbench/workspace-file-reload-guard.test.ts) cover races. The [visual case](../../../test/desktop-workbench-canvas-resource-refresh.md) records the composed outcome for editor-owned changes. A file written directly by the agent under the Default preset has no recorded run of this case.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| R12 — an attached folder changes destination     | Permission to a folder cannot silently expand to protected content when its underlying destination changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | [Native ACP fixture](../tests/process/approvals/confinement.rs) retargets an alias during review. On arm64 macOS and Linux, the scoped write succeeds and direct or aliased protected reads and writes are refused. The [permission fixture](../tests/permissions.rs) checks replacement of the approved root.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| R21 — select a refreshed subscription model      | A newly published model executes its exact provider selector. A queued or interrupted input keeps that selector across refresh and restart. Its public turn history identifies the canonical model.                                                                                                                                                                                                                                                                                                                                                                                                                                                 | The [supervised process cases](../tests/process/responses.rs) send synthetic subscription and built-in BYOK models absent from the binary with different canonical and provider IDs. They exercise queued and resumed turns after a remap, rejecting a changed selector before dispatch. The historical subscription matrix covers supervisors without explicit selectors. The [launch validation case](../tests/launch_subagents.rs) rejects unknown IDs on those older launches.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| R22 — attach a folder by reference               | Sending or queueing a folder carries its path and folder identity without capturing contents or granting access. Reopening keeps the exact reference and retry receipt. Listing uses existing permissions; outside and protected folders remain inaccessible to file tools.                                                                                                                                                                                                                                                                                                                                                                         | The [native resource-reference cases](../tests/process/file_references.rs) keep a queued reference through removal and restart, then list the replacement folder only through an allowed tool, replay the same resource link, and refuse outside and protected-alias listings. The [master seed cases](../../grida-agent-master/tests/conversation_seed.rs) preserve folder descriptions through forks and compaction. These use synthetic providers; Desktop path capture and interaction need their own evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R23 — preview an earlier image attachment        | A sent or steered image can display its exact retained original after queue admission, compaction and reopen, including under a model without image input. Steered images stay in sequence within the turn, even without a caption. Preview reads cannot borrow another chat's asset or revive a revised-away message, and unavailable bytes leave a plain attachment.                                                                                                                                                                                                                                                                              | The [native image cases](../tests/process/images.rs) read a queued then recorded PNG before and after installed compaction and restart under a text-only model, verify exact bytes and unchanged task state, and reject unnegotiated/shared access, assistant or foreign/inherited message identity, wrong URI, missing/replaced bytes and a missing owner lock without provider work. A revised-away image becomes unavailable while its source still exists. The [attachment batch process cases](../tests/process/attachment_batches.rs) verify ordered provider input and retained history, rejected batches, exact queue recovery, and both retained originals in active and reopened steering transcripts. The [turn activity fixture](../../../editor/scaffolds/desktop/workbench/native-turn-activity.test.tsx) verifies preview controls for steered images in order with and without a caption.                                                                                                                                                                                                                                                                                                                                          |
| R24 — restore a chat's model and effort          | Opening A after choosing B restores A's saved pair, including unsent changes. An explicit change updates the new-chat default. During a turn, changing model or access applies at the next input acceptance. Running and previously queued work keeps its captured settings. Interrupted first-chat setup retries the same creation/input identities; metadata-only recovery keeps the composer draft and starts no inference.                                                                                                                                                                                                                      | [Supervised process cases](../tests/process/responses.rs) exercise a settings change between two queued messages and inspect the model and effective command access on each inference. [Native selection cases](../tests/process/selection.rs) cover persistence, admission and fork retries; [Main cases](../../../desktop/src/main/native-chat-selections.test.ts) cover crash/default coordination. The [complete draft-promotion path](../../../desktop/src/main/native-chat-draft-promotion.test.ts) tests real strict native creation, stable retry and one first input. [Actual Electron error transport](../../../desktop/src/bridge/native-chat-invoke.electron.test.ts) preserves authoritative receipt-absence codes while unknown outcomes remain unknown. [Selection controller cases](../../../editor/lib/agent-chat/native-chat-selection-controller.test.ts) cover setup recovery, draft-key publication and stale replies; the [production composer browser case](../../../editor/scaffolds/desktop/workbench/native-draft-promotion.browser.tsx) keeps typed edits through delayed copying and submits once only after explicit Send. [Interaction case](../../../test/desktop-agent-chat-selection-memory.md) remains untested. |
| R25 — perceive explicit raster input             | PNG/JPEG/WebP/GIF input supplies prepared pixels in the first compatible inference and truthful disk/snapshot identity. Preview original, model derivative and generation reference remain distinct.                                                                                                                                                                                                                                                                                                                                                                                                                                                | [Preparation cases](../src/host/image_preparation.rs), [raster process cases](../tests/process/raster_images.rs) and [subscription cases](../tests/process/responses.rs) verify formats, bounded decode, source-change refusal, exact originals and actual outgoing media with synthetic providers. [Main custody/delivery cases](../../../desktop/src/main/native-agent-selected-images.test.ts) verify caller identity and unsupported-host refusal. These do not certify live subscription entitlement or human interaction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| R26 — follow a child without changing its parent | Opening a parent's child activity or conversation starts no work, preserves the parent's draft and controls, and shows actual exposed live/retained messages with captured execution. Lifecycle links resolve the same child. Recorded start/finish events interleave with parent commentary and individual tool calls in the same order live and after reopen, and break consecutive-tool grouping. Missing order is explicitly unplaced; no wall-clock or arrival-time guess fills it. Completed history, incomplete counts and missing transient output remain explicit. Child reads cannot cross parents or bypass ordinary child-load refusal. | [Native unit projection](../src/host/subagent_activity.rs), [publication-order process cases](../tests/process/delegation/activity_order.rs) and [subagent process cases](../tests/process/subagents.rs) cover bounded counts, actual pre-settlement text, reasoning omission, scoped paging, restart and captured metadata. [Main decoding](../../../desktop/src/main/native-subagent-activity.test.ts), [actual adapter/IPC execution](../../../desktop/src/main/native-agent-activity.test.ts) and [controller cases](../../../editor/lib/agent-chat/native-subagent-controller.test.ts) and [timeline browser case](../../../editor/scaffolds/desktop/workbench/native-activity-timeline.browser.tsx) exercise their respective boundaries. [Interaction case](../../../test/desktop-agent-chat-subagent-activity.md) remains untested.                                                                                                                                                                                                                                                                                                                                                                                                        |
| R27 — delegate independent ordinary work         | A person can request several general workers in ordinary Act without Ultra. Workers use captured execution and bounded native capabilities, produce separate outputs and return results correlated to their assignments. The parent collects those results before successful completion; replay, controls and recovery preserve authority and allowance.                                                                                                                                                                                                                                                                                            | [Built-process delegation](../tests/process/delegation.rs) exercises five workers through real native tools, parent integration, premature completion correction, four provider protocols, permission refusals and observational child activity/conversations. [Host cases](../src/host/delegation/tests.rs) cover source and capture boundaries, resource bounds, controls and recovery. [Master cases](../../grida-agent-master/tests/durable.rs) preserve exact collection obligations, final-answer presentation and Goal allowance isolation. Replies are synthetic; live provider behavior and human interaction are not certified.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

R21 and R24 also cover a model offered through both OpenAI API project billing
and ChatGPT Subscription. The [supervised Responses process cases](../tests/process/responses.rs)
verify the captured destination, key and wire selector for queued work when the
person switches funding, then verify refusal after removal or replacement of
the project key across restart. These cases use synthetic provider responses.

R1, R2 and R17 share the same recovery requirement. After losing observation,
return to the same session and keep its queue held when required. After an
accepted turn fails or becomes uncertain, let the person send a new turn in
that conversation. After a host exit leaves a turn interrupted, offer an
explicit end before more work can run. A retry of a send awaiting confirmation
uses its original input identity. [Return to ongoing work](https://grida.co/docs/wg/ai/agent/experience#return-to-ongoing-work)
owns the experience.

- The [native acceptance cases](../tests/process/acceptance.rs) contrast a
  reply the submitting client never reads with a real SQLite submission
  transaction that rolls back. A replacement host recovers the original input
  and turn identities with their current disposition, without redispatch. It
  rejects changed content under the same input ID. The failed transaction
  leaves prior history and queue position intact, with no receipt or provider
  call. After storage is writable, the same input ID can be accepted and
  completed once.
- The [native outbound MCP cases](../tests/process/outbound_mcp.rs) independently
  observe one tool call. After a truncated model response or a killed owner,
  reopening retains the tool result and the unresolved inference. A distinct
  turn succeeds in the original session with the recorded tool result in its
  model context. The interrupted case settles through explicit Stop and queue
  release.
- The [built-host adapter cases](../../../desktop/src/main/native-agent-chat.test.ts)
  exercise truncated provider output, same-chat follow-up after restart, and
  lost acknowledgement after durable acceptance. They count requests and
  assert successful follow-up settlement and the original acceptance receipt.
- The [packaged IPC case](../../../desktop/src/main/native-chat-store.test.ts)
  rejects the earlier attachment after a real child exit and loads the same
  transcript under its replacement. Restoring observation makes zero provider
  requests. A distinct follow-up streams through the replacement attachment.
- The [native abrupt-exit test](../tests/process.rs) retains the interrupted
  turn and its unresolved inference. Explicit Stop settles the turn without
  redispatch and holds the queue. Explicit queue resume runs the next turn once.
- [Controller cases](../../../editor/lib/agent-chat/native-chat-controller.test.ts)
  cover loss and renewal of a subscription, bounded automatic recovery, and
  retry of an unconfirmed send against a replacement attachment. The [rendered
  chat cases](../../../editor/scaffolds/desktop/workbench/native-chat-recovery.browser.tsx)
  exercise the composer and visible recovery controls through a scripted
  bridge. Physical sleep/wake has a [separate interaction case](../../../test/desktop-agent-chat-return-after-sleep.md).

Cases R9 and R10 retain commit-pinned evidence because the original files have
since been reorganized.
The rows add concrete observations to existing identity, ownership, input,
resource, and publication contracts. They do not create more product features.

Selection cases verify zero-inference inspection,
per-chat unsent persistence, exact creation and mutation retries, stale-owner
refusal, durable Main publication faults, bounded promotion receipts, native
model/effort admission and lifecycle cleanup. Broad workspace qualification and
human interaction are reported separately.

The [real Desktop selection adapter case](../../../desktop/src/main/native-agent-selection.test.ts)
exercises an isolated current native bundle through selection metadata, an
accepted input, an exact completed retry and restart. Its stale selection
revision is refused before the next valid Low-effort input. Metadata inspection
starts zero provider requests. The [image/model-transition adapter cases](../../../desktop/src/main/native-agent-images.test.ts)
exercise their corresponding process boundary. These opt-in cases use
`GRIDA_DESKTOP_TEST_NATIVE_RESOURCES` with a verified current bundle and synthetic
provider replies; they do not establish rendered Desktop interaction or live
provider entitlement.

The [subscription model fixtures](../../../desktop/src/main/native-subscription-profiles.test.ts)
exercise selected-account discovery, persistence and actual queued execution through
a staged native worker. A queued search uses its accepted model, effort and speed
after a later selection edit. The next Standard message omits both options, and
reopening the chat restores the cited source without generating another response.
The same worker fixtures edit the user’s global TOML and verify that a saved
accelerated speed still reaches the provider with the retired setting present
and hosted search turned off. They also check that older restrictive search
settings grant no search. Credential-owner fixtures cover opting out during a
token refresh and replacing the account during the final preference read.
The [Personalization settings interaction](../../../editor/app/desktop/settings/_components/personalization-settings.browser.tsx)
covers both switches and preference changes that arrive
while an older read is pending.
The [Responses adapter fixtures](../../agent-kit-providers/tests/responses.rs) cover
mixed hosted and local tools, duplicate search evidence and safe citations.
Sparse terminal items preserve streamed actions. A subscription response
whose completion carries an empty output array still continues when its
ordered, finalized items provide an answer, refusal, or tool call. A turn
with only commentary remains interrupted. A nonempty terminal array still
has to agree with the streamed items. Failed and incomplete responses retain
reported sources without dispatching pending local functions. Malformed
optional annotations leave the assistant's answer readable.
The [workspace composer interaction](../../../editor/scaffolds/desktop/workbench/native-chat-focus.browser.tsx)
checks what the person selects, sends and sees when the reply arrives.

Raster preparation, subscription transport and captured tool-version cases
verify the new view definition without granting it to old accepted work.
An older pending image turn reconstructs its original PNG definition and
bounds; a newly accepted turn can use the general raster definition.

For queued-input correction, the [native caption cases](../tests/process/queued_text.rs)
replace a captured raster caption, clear it while retaining the original image,
and preserve a selected file reference in the same queue slot. They compare the
entire retained configuration/authority payload, read exact image bytes after
source removal and restart, replay the original control receipt, and prove stale,
consumed, superseded, withdrawn and goal edits leave work unchanged. The
[host transformation case](../src/host/queued_text.rs) preserves opaque captured
fields, collapses multiple text parts without moving non-text parts, and refuses
Library and scheduled inputs. These use reviewed local data and synthetic
providers; client interaction requires its own evidence. General queue replacement
and factual text-only steering retain their separate contracts.

For R17 and R18, the [native image case](../../../desktop/src/main/native-agent-images.test.ts)
queues the selected PNG during a running turn, recovers the exact receipt on
retry, and reopens the receipts for two same-named images under a text-only connection.
It verifies the original bytes at the provider adapter and refuses an unsupported
send before the text or image enters the chat. The
[draft recovery cases](../../../editor/lib/agent-chat/native-chat-controller.test.ts)
cover keeping the draft on a rejected replacement and reusing its input identity
when the outcome is unknown.

The [Chromium queue handoff case](../../../editor/scaffolds/desktop/workbench/native-chat-recovery.browser.tsx)
holds the detailed queue read open across settlement and the next claim.
It checks that the waiting row remains visible, Resume stays absent during
automatic dispatch, and the accepted message appears once in the transcript.
The same rendered suite checks that Stop offers Resume. The
[native scheduler](../src/host/lifecycle.rs) and [built-process lifecycle cases](../tests/process/lifecycle.rs)
distinguish automatic handoff and capacity waits from a reopened idle queue.

In a long chat, [earlier pages](../../../test/desktop-agent-chat-transcript-history.md)
show their own messages, and returning to the latest page includes work that
settled while browsing. The [controller case](../../../editor/lib/agent-chat/native-chat-controller.test.ts)
holds an earlier read across settlement. The [Main case](../../../desktop/src/main/native-agent-process.test.ts)
exercises overlapping replay requests and delayed chunks.

A macOS ARM64 Desktop preview build exercised the rendered workbench, packaged
preload, Main, and the native child together with a saved OpenRouter profile
and synthetic upstream responses. Two files named `same.png` reached the
provider with their respective original bytes. A simulated loss of PNG
capability kept the text and attachment in the mounted composer and left the
current question visible. After capability recovery, a lost acceptance reply
was retried with the same queued input ID, and answering the original question
released that follow-up for exactly one inference. Relaunching on a profile
without PNG support sent no work; relaunching on the original profile reopened
the pending question and accepted its answer once. Live provider execution and
the legacy pending-approval scenario retain separate evidence requirements.

### Implementation-plan requirements

Each implementation slice names its affected feature rows and product scenarios.
It identifies which outcomes will be observed and which evidence remains pending.

- Review the current entrypoint, adjacent regression tests, and relevant fix
  history. Classify discovered behavior before choosing what to retain or replace.
- Use existing tests to extract scenarios and expected results independently of
  their current storage layout or framework.
- Select the smallest test path that can observe the claimed outcome. Supporting
  component tests can isolate a failure, while a cross-surface promise needs
  evidence across the relevant boundaries.
- Use deterministic automated checks where they observe the outcome, manual
  interaction cases where human judgment is needed, and native platform runs
  for actual enforcement and process lifetime.
- Record the tested entrypoint, environment, command, and observed result.
  Rendered or live-service claims require corresponding evidence.
- Keep unresolved cases visible at handoff. Passing source checks or historical
  tests does not mark a new implementation's runtime obligation complete.

Plans link to the cases rather than copying their full contents. An intentional
contract change records its rationale and revised expectation while preserving
the historical evidence.

This process reduces repeated discovery and makes known regressions detectable.
Its protection is bounded by the cases found, the paths exercised, and the
quality of the observations. A new failure revises the contract and its proof.

Composer command selection is an input action. Selecting `/plan` or `/goal`
retains the surrounding draft and starts no model work. The removable badges
capture product instructions; permission grants and effort stay separate.
An unconfirmed Goal start retries the same input and allowance even if work
has already begun; a changed objective cannot replace that outstanding request.
The slash menu lists commands from the chat's capabilities only; a running
turn, queued input, steering or an in-flight action never hides one. `/plan`
during a turn applies to the next, queued message and turns steering off;
`/goal` sends the goal start, which the host queues; `/fork` and `/compact`
report that the agent is working; `/stop` reports when nothing runs.
[Controller regressions](../../../editor/lib/agent-chat/native-chat-controller.test.ts),
[real-editor selection tests](../../../editor/kits/composer/composer-command-selection.browser.ts),
and the [Desktop interaction case](../../../test/desktop-agent-chat-composer-intents.md)
cover these obligations.

A suggested follow-up belongs to the empty Desktop composer until the person
accepts it as a draft. Replaying a completion must never issue another model
request. A delayed result must stay dismissed after a chat switch, a newer
turn, a model or effort change, a draft edit or a preference change. Archiving
the chat while its economy route is being resolved must prevent dispatch.
Turning predictions off during model lookup or provider authorization must
prevent the pending request from reaching the provider, even after the switch
is turned back on. A later eligible reply can use the new opt-in.
The host uses the completed inference's captured context and connection.
A hosted prediction must resolve the product's economy model on the same
account. The default Ollama connection at `localhost` and numeric loopback
connections use the selected local model. Switching models preserves the
visible history and compacted context while removing provider-private
continuation state.
A tool call, provider failure or deadline can yield an empty suggestion. Durable request deduplication
survives a host restart. Generation must leave the parent transcript and turn
summary intact. [Native process evidence](../tests/process/prediction.rs),
[Desktop IPC](../../../desktop/src/main/native-chat-ipc.test.ts) and the
[composer interaction](../../../editor/scaffolds/desktop/workbench/native-chat-recovery.browser.tsx)
exercise those boundaries. [Subscription selection in Desktop](../../../desktop/src/main/native-subscription-profiles.test.ts)
also exercises a premium subscription chat with OpenRouter available, the
subscription economy request and the next foreground turn.

Four cold launches of Electron on macOS exercised the real Settings page,
preload and Main handlers against a temporary Grida home. Enabling the switch
notified an open workspace. A new workspace read the saved value on the next
launch, and a hand edit to `false` appeared as Off on the third. With native
chat disabled, Settings explained why suggestions were unavailable. A trusted
deny hook still refused an input after toggling the setting. The Desktop
0.7.0 reader rejected the added table and accepted the restored hook-only
file with its original trust decision. [Settings IPC](../../../desktop/src/main/settings-ipc.test.ts),
[config editing](../../../desktop/src/main/desktop-personalization.test.ts)
and [native hook execution](../../../desktop/src/main/native-agent-hooks.test.ts)
cover the respective contracts.

### Composer prediction measurements

#### Hosted economy model

On November 20, 2026 (UTC), Desktop Main and the native stdio host ran one
short and one long synthetic exhibit-planning chat. Both used the same saved
OpenRouter connection. Scripted foreground replies on the Haiku profile
established the chat history. Only the two prediction requests went to
OpenRouter, using `openai/gpt-6-luna`. The long chat included 120 field notes
between the original plan and the final reply.

| Chat  | Host elapsed | Input tokens | Cached input | Output tokens | Estimated USD |
| ----- | -----------: | -----------: | -----------: | ------------: | ------------: |
| Short |     1,693 ms |          591 |            0 |            24 |     0.0000711 |
| Long  |     1,338 ms |        2,811 |            0 |            25 |     0.0002936 |

Both suggestions requested the planned two-sentence audio guide, the original
age group and the required word “moonlight”. OpenRouter reported zero reasoning
tokens in both responses. The estimated combined cost was $0.0003647 at $0.10
per million input tokens and $0.50 per million output tokens. Two samples
measure these particular requests. [Model pricing](https://openrouter.ai/openai/gpt-6-luna)

#### Same-model design comparison

On November 20, 2026 (UTC), the native stdio host ran synthetic exhibit-planning
chats on OpenRouter with `anthropic/claude-haiku-5.5` and the reasoning capability
that Desktop advertises for that model. This baseline used Haiku for both
requests before the hosted prediction policy selected the product's economy
model. The client requested a prediction immediately after the final reply.
Each row is one request, timed inside the
host and counted separately from the completed turn. The long chat included
120 field notes over three user turns. The compacted case used the host's
ordinary compaction command before the final turn.

| Chat                | Prediction time | Input | Cached input | Output | Estimated USD | Result                                                                                  |
| ------------------- | --------------: | ----: | -----------: | -----: | ------------: | --------------------------------------------------------------------------------------- |
| Short               |          922 ms |   800 |            0 |     31 |      0.000096 | Requested the two-sentence audio guide for ages 9–12.                                   |
| Long                |        1,326 ms | 5,478 |            0 |     47 |      0.000571 | Recovered the audience and the required word “moonlight” from the first turn.           |
| Compacted           |        1,230 ms | 1,444 |            0 |     34 |      0.000161 | Selected a proposed title and mentioned the guide, but assigned writing it to the user. |
| Explicitly finished |          885 ms |   773 |            0 |      5 |      0.000080 | Returned an empty suggestion.                                                           |

Repeated requests for each turn returned empty without another inference.
OpenRouter reported zero cached input in every row despite immediate reuse
of the retained conversation. Estimates use the model's listed rates of
$0.10 per million input tokens and $0.50 per million output tokens. They
exclude the preceding chat and compaction. A compatible profile that omitted
the reasoning capability exhausted the 128-token prediction allowance on
the long chat and yielded no text. [Model and pricing](https://openrouter.ai/anthropic/claude-haiku-5.5)

For comparison, the same short and long tasks requested both an answer and a
suggested prompt as JSON in the main reply. The short combined reply took
2,804 ms (733 input, 435 output), versus 1,528 ms (673 input, 15 output)
for the ordinary reply before prediction. The long combined reply took
3,847 ms (5,304 input, 590 output), versus 4,224 ms (5,249 input, 522
output). Both combined replies used Markdown fences. The short one recovered
the intended guide, while the long one requested the plan again. The JSON
comparison used a single inference per final answer.

In a separate short-chat run, the agent called an inert local `wrap_up` tool
with a suggestion to write the guide for ages 9–12. The tool received the
suggestion at 2,367 ms. The model then took another 1,032 ms to deliver its
visible answer, for a total of 3,399 ms. The two provider requests used
1,163 input and 344 output tokens, then 1,282 input and 14 output tokens.
Both reported zero cached input (estimated $0.000424 combined). This measures
the ordinary tool-call loop. A host that terminates on the tool call would
need another way to deliver the final reply.

Keep the preview opt-in. A separate request allows the user to see the
completed reply immediately and lets Desktop skip prediction when their
composer is occupied. Latency, cost, cache reuse and suggestion quality
vary with the model and conversation. These one-time samples cover one live
provider. Executable tests with fixture responses verify the reported token
categories on the direct provider protocols, the captured OpenRouter and
Vercel connections, and the account and signed context on the ChatGPT
subscription route. A Gateway fixture checks a terminal charge and a
pending charge resolved by one scoped lookup. An unavailable settlement
stays unknown. [Direct providers](../tests/process/prediction.rs),
[subscription](../tests/process/responses.rs) and
[saved connections and Gateway receipts](../tests/process/subagents.rs).

## Consumer one, a minimal master

The smallest useful master answers a request, optionally calls tools, and returns
an account. Its only persistent product state can be the accepted conversation.

| Stage   | Consumer operation                                    | Required result                                                                         |
| ------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Create  | Host creates an ephemeral journal from accepted input | One lease and an independent control handle                                             |
| Open    | `Runtime::open(lease)`                                | One continuation controller and an observer                                             |
| Read    | `Turn::view()`                                        | Accepted input, current semantic history, controls, completed operations, and allowance |
| Prepare | Master selects context, model, tools, and bounds      | A prepared request and captured inventory                                               |
| Step    | `Turn::step(plan)` with a history-derived key         | One inference plus its attributed tool results                                          |
| Decide  | Master examines the recorded outcome                  | Another step, a wait, or a completion draft                                             |
| Finish  | `Turn::try_finish(draft)`                             | Verified settlement or retained continuation authority                                  |

The master can derive `step/0`, `step/1`, and subsequent keys from committed
steps under its policy version. Re-entering it after interruption first checks
the existing operation at that cursor. It neither allocates a fresh key for
old work nor repeats a completed step. Product state beyond this record earns
an explicit `checkpoint` call.

A simple answer serves as its own final account. For a task requiring
verification, the master uses a keyed `TurnOperations::invoke` and bases the
completion draft on that result. Additional summary inference remains an
ordinary keyed operation when the task benefits from it.

Routine tool failure, model refusal, and user stop are outcome data. The master
can still inspect partial results and produce a factual account. Storage or
integrity failure instead suspends trustworthy continuation and leaves the
recorded state for recovery.

Per-step preparation keeps product choices separate from mechanical execution.
Releasing the completed model request's capacity before awaiting tool work that
may need the same capacity keeps a step from waiting on its own permit.

### Counterexamples

- Requiring a serialized master state before every request makes this consumer
  maintain redundant state. The contract now requires sufficient continuation
  evidence and uses explicit checkpoints for additional product state.
- Returning ordinary cancellation as an unhandled driver error skips the final
  account. Requested stop closes new effects while allowing receipt recording
  and settlement.
- Exposing journal snapshots as the master's public view binds policy to storage
  layout. The turn's semantic view supplies the data the consumer actually uses.
- Treating a missing aggregate step result as a missing execution repeats work.
  Runtime rebuilds the aggregate from committed model items and tool outcomes.

## Consumer two, a durable session

Consider a request to generate an image and place it in the selected design.
The image generation is paid external work. The selected design is a live host
resource. Both make an accidental retry observable.

| Boundary              | Durable fact                                                                 | Continuation rule                                               |
| --------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Submit                | Input identity, exact content, acceptance                                    | A lost acknowledgment is resolved using the same input identity |
| Claim                 | Selected input, turn identity, writer epoch, initial continuation basis      | Only the newly issued lease starts the driver                   |
| Prepare step          | Resolved model/settings, offered tools, context positions, authority binding | Recovery retains the meaning of the request                     |
| Admit generation      | Stable operation key, effect/attempt identity, input, recovery contract      | Dispatch follows the commit barrier                             |
| External acceptance   | Provider job receipt and adapter recovery state                              | Record receipt before polling or downloading                    |
| Obtain result         | Provider completion plus artifact availability and retention                 | A save failure does not erase provider success                  |
| Admit design mutation | Selected endpoint, binding generation, document-tool arguments               | A changed active tab cannot retarget admitted work              |
| Record mutation       | Outcome and related History entries                                          | Later decisions use the committed result                        |
| Verify                | Observed content or appearance under a keyed operation                       | A presentation request alone cannot establish appearance        |
| Settle                | Account, outcome, effect dispositions, active-turn disposition               | Subsequent selected work follows verified settlement            |

### Restart cases

**After provider acceptance, before receipt publication.** The journal may show
dispatch without a known job ID. Recovery uses provider idempotency or lookup
when the adapter supports it. Otherwise the outcome remains unknown and the
master needs a further decision. The contract makes no external exactly-once
assumption.

**After receipt publication, before download.** A new owner queries the original
job through the adapter's `recover` operation. Current catalogue retirement can
prevent a new submission while leaving this recovery valid. Authority must be
compatible with the original endpoint, tenant, purpose, and principal binding.

**After individual tool outcomes, before aggregate step publication.** Runtime
reconstructs `StepOutcome` from the committed inference and tool records. A
completed action remains completed even if its enclosing summary was never
written.

**After the result, before a master checkpoint.** The restored master obtains
the old result through its stable operation key. History-derived state or the
last explicit checkpoint determines its next decision.

**After settlement commits, before its acknowledgment.** The owner looks up the
same change identity and verifies the stored terminal record. The queued turn
cannot be started by guessing whether the previous one completed.

Persistence that saves conversation snapshots asynchronously cannot establish
these boundaries, because an effect could begin before its intent is durable.
Authoritative history under acquired writer ownership and the pre-effect
journal are requirements of this design.

### Controls during the durable run

| Event                                    | Required behavior                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| Steering before completion               | Preserve prior effects, invalidate stale completion, use a new key for changed work           |
| Stop while generation runs               | Commit pause-plus-cancel, signal active work, retain the original job receipt and uncertainty |
| Reporting interrupted                    | Produce the factual fallback from recorded outcomes                                           |
| Human answer committed before restart    | Retain its correlation and consumption state until the owning turn processes it               |
| Rewind past a pending picker or approval | Supersede the affected wait under the same control transition and reject late answers for it  |
| Read-only client reconnects              | Return views and current status without admitting or resuming work                            |

## Headless executable walkthrough

The [native host](./rust-core.md#native-executable-and-headless-host)
serves Desktop and headless protocol clients from the same binary, and its bounded run entrypoint uses the same master.
Passing imported-handler tests is supporting evidence. The executable path
must also be exercised in its actual process.

The supervised process path uses JSON-RPC over stdio under a supervising parent.
Independent-client cases use the explicitly selected authenticated loopback
WebSocket service. Both bind the same dispatcher and session contracts. Closing
the only stdio supervisor initiates bounded host shutdown. Disconnecting one
client of the shared service leaves that service running.

| Product situation                                           | Required observation through the executable                                                                                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Submit a task without a terminal                            | The process accepts explicit input and returns structured progress and an identifiable outcome.                                                           |
| Send a request twice after losing its acknowledgment        | The same accepted input and result are recovered, with one owned execution. R1 and R2 remain applicable.                                                  |
| An unattended task requires approval or an essential answer | It returns the retained input-required disposition. A protocol client can answer and resume it once. Permission stays independently configured.           |
| Disconnect a client from a running service                  | Work follows its existing controls. Another client can restore status and output without creating another turn. R16 and R17 remain applicable.            |
| Stop an embedded run or terminate its host                  | Bounded shutdown records settlement, suspension, or recoverable uncertainty. Restart reconciles prior work before another attempt.                        |
| Generate output, then fail saving or presentation           | The result and available recovery evidence remain inspectable through the protocol. R4 and R5 remain applicable.                                          |
| Two clients control the same task                           | Conditional controls produce one ordered disposition and preserve each submitted input.                                                                   |
| A requested tool needs a live editor or picker              | The host advertises its actual client capabilities. A headless adapter can exercise the interaction contract, with visual acceptance recorded separately. |

The [native process tests](../tests/process.rs)
exercise the executable under both a stdio supervisor and the authenticated
loopback listener. The tests use isolated state and explicit connection targets
so they cannot attach to unrelated personal sessions.

## Grida requirements that change the design

### Live resources and publication

The agent-facing `/canvas.svg` can be rebound when the active editor or slide
changes. Its live binding mutates editor state, while the host separately owns
disk persistence. The tool host captures the selected endpoint and its
binding generation so a focus change cannot silently redirect an admitted call.
The document tool owns the meaning of its arguments, edits, persistence, and any
content-version checks. [Document surface host](../../../editor/scaffolds/desktop/file/document-surface-host.ts).

The journal preserves invocation arguments and reported outcomes. If the
original endpoint is gone, the adapter reports unavailability or an uncertain
outstanding outcome. Document-specific readback, when available, belongs to
that implementation. The master chooses its next action using this evidence.

`workbench_show` acknowledges an auxiliary file reveal. The renderer may
apply it later and the model can continue artifact work. The regression
creates the first renderable slide bundle, gives Workbench a normal
filesystem path, and checks delivery to the captured view with and without
Browser. User navigation supersedes pending delivery. Keep the native
process and Desktop Main evidence beside the existing
[Workbench scenario](../../../test/desktop-agent-surface-open.md).

The product already asks for a meaningful renderable artifact early in a task.
That is a master policy and a useful performance measure, time to first usable
artifact. It is distinct from a recovery checkpoint for the master program.

### Rich human results and model input

The Library picker starts from an agent query, but the user can refine the
search and select a different set of references. The returned value contains
structured asset identities and URLs. Text questions use another schema.
The requesting tool therefore owns the wait's response schema. A narrow adapter
to the existing Runtime wait mechanism supplies correlation, durable receipt,
and cancellation.

Selected asset titles remain asset-supplied metadata. The user's selection does
not turn those titles into instructions. Grida's current model projection
deliberately omits them. The full result and its model-facing projection must
remain separate.

Grida also retains image-bearing tool results and derives a provider-compatible
model input from them. A pressure case must verify that the next inference
receives actual image content and preserves call/result correlation, rather
than receiving base64 as text. Image-retention policy belongs to the master,
and the transformation retains source provenance.

### Paid media, artifact retention, and authority

Grida's media clients separate new submission from lookup of an existing job.
The existing-job path can work independently of current new-work discovery.
This requires an explicit recovery entry point in the tool adapter and a
nonterminal receipt record in the journal.
[GG operations](../../../packages/grida-ai/src/gg-operations.ts),
[Music recovery](../../../packages/grida-ai/src/music-client.ts),
[Music route](../../../packages/grida-ai-host/src/http/routes/music.ts).

Generated bytes can remain useful when optional persistence fails. Provider
completion, artifact retention, and presentation have separate outcomes. A
master can retry storage or presentation using an existing result, while a new
generation is a new operation. If the bytes are no longer available, the record
must say so. [Generated-media persistence](../../../packages/grida-ai-host/src/http/routes/generated-media-persistence.ts).

The model view distinguishes a retained descriptor from evidence that its
content can still be resolved. A scratch path is insufficient reason to discard
the only surviving image. Reference resolution supplies current availability as
data before context assembly.

Hosted execution is scoped beyond an account identity. Tenant, purpose,
endpoint, token lifetime, and credential generation can matter. The core keeps
an opaque authority binding and the host validates compatible access for
recovery. A display organization is not authorization evidence.
[Hosted session binding](../../../packages/grida-ai/src/gg-session.ts),
[Video invocation custody](../../../packages/grida-ai/src/video-client.ts).

The existing typed media clients fit behind Tools. Expanding conversational
Inference into a universal media executor would combine contracts that already
have independent consumers. [Rust media clients](../../grida-ai/README.md).

### Existing control boundaries

Status hydration is observational. Reading or subscribing cannot become
permission to drain a queue or incur a charge. Changing visible history must
reconcile operational waits such as pending human input.

## Working files and project directories

Grida routes user input among prepared image content, live references and
staged working files. Explicit Desktop raster input supplies first-request
pixels plus verified provenance, retaining the exact original separately from
bounded model pixels. Ordinary disk files and folders remain references for
on-demand inspection. The headless retained-file path keeps its separate
explicit copy/materialization contract.
[Retained file process tests](../tests/process/retained_files.rs).

Scratch storage is shared by the filesystem, vision, and command bindings.
Cleanup must not remove files while descriptors that depend on them remain in
history. The contract makes dependency holds and rematerialization explicit and
supports attachment-only work without a project.

Scratch ownership regressions must prove that a live owner excludes another
writer, dropping that owner permits reopening despite an inherited old file
description, and closing the old descriptor cannot release the new owner's
lock. The [scratch unit cases](../src/scratch.rs) verify those lifetimes
deterministically; the [scratch integration cases](../tests/scratch.rs) retain
the independent original and edited working copy through reopen.

For “add text to this PNG,” the minimum path is an accepted input asset, an
independent scratch working copy, an edited result, inspection, and publication
to an accessible result location. Project directories remain untouched unless
the task chooses one as the publication destination. Restart must retain or
reconstruct the required bytes before work resumes.

Current Grida workspaces are explicitly single-root. Additional directory
attachments are read-only, in-memory capabilities. They do not establish a
multi-directory Project. The new workspace descriptor supplies named directory
bindings, a primary default, and a revision while Files supplies scoped access.
[Workspace registry](../../../packages/grida-daemon/src/workspaces.ts).

In a multi-directory workspace, the primary directory supplies the default
working directory and instruction discovery, while confinement still governs
access to every directory.

The pressure cases are loss of staged bytes after acceptance, cleanup racing
Pause, identical relative paths in two roots, primary-directory changes during
an admitted operation, and a read-only additional root receiving a write.
Each is handled by resource identity, availability, retention, and authority
contracts. They require no new agent orchestration component.

## Conversation interactions and suspended execution

The Desktop-oriented experience adds two execution requirements to the earlier
walkthrough. Pausing an unfinished task differs from stopping a turn with a final
outcome. Registering a question differs from awaiting its answer. These
distinctions require an intentional suspension receipt as well as a terminal
receipt from the driver.

| Interaction                                     | Required result                                                                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| User pauses active work                         | Admit no new task effects, account for existing work, preserve the continuation, and release the worker after verified suspension.           |
| User resumes                                    | Wait for the exact suspended turn's retiring host worker, then claim that logical turn with a fresh epoch under the original observed basis. |
| Question tool returns immediately               | Commit the question and return its registration receipt. Independent work can continue.                                                      |
| Optional question is dismissed                  | Its card can reopen until settlement. Another client can still answer the same wait.                                                         |
| An optional answer races with completion        | Either commit the correlated answer once or expire the still-open wait with the terminal receipt.                                            |
| Question requires an answer before further work | Preserve the pending interaction and optionally suspend the worker. No open inference request is needed.                                     |
| User reviews several questions in one request   | Preserve display order and correlation. Accept complete typed answers and skips in one settlement, rejecting partial network submissions.    |
| Tool contract changes across a restart          | An earlier pending singleton retains its exact original execution and answer contract. A newer client can inspect and answer it.             |
| An answer races with suspension                 | Commit the correlated answer once and make it visible to the current or resumed owner.                                                       |
| Answer arrives during explicit Pause            | Retain the answer while preserving the user's pause.                                                                                         |
| User edits an earlier message                   | Cut at the selected boundary, preserve original later history and effects, supersede affected waits, and continue from the revised input.    |

The live `wait` convenience remains useful. `request_input` supplies registration
without waiting, and `try_suspend` supplies durable worker release. A resumed
driver reconstructs its continuation from history, operation outcomes, and any
additional checkpoint. It does not deserialize a language stack or keep a model
request open during human think time.

The [host lifecycle cases](../src/host/lifecycle.rs) must exercise the interval
between durable suspension and worker-slot retirement with a controlled
notification barrier. They retain running/foreign/unadmitted owner refusals,
shutdown/deletion fences and stale session/control/epoch/position refusal. The
[built protocol case](../tests/process/lifecycle.rs) resumes immediately from
the observed suspended snapshot on its first request and checks the resumption
note supplied to the model; it does not hide retirement behind client retries.

Both interaction styles are needed: an awaited question blocks the dependent
work, while an immediate-return question lets independent work continue.
Steering and queueing are separate input routes.

The [built-process question cases](../tests/process/questions.rs) exercise
required and optional replies, expiry, recovery and CLI dispositions. The
[catalog case](../tests/process/catalog.rs) checks that open user input can
coexist with running work and that settlement clears it. Desktop verifies
the corresponding [notification routing](../../../desktop/src/main/agent-notifications.test.ts)
and [main and side chat interactions](../../../editor/scaffolds/desktop/workbench/native-chat-focus.browser.tsx).
The [built-process compaction cases](../tests/process/compaction.rs) verify
that automatic compaction has its own settlement and that reopening keeps
installed summaries in the transcript without replaying settlements. A held
manual summary also proves that start returns on durable admission, follow-up
input can queue before completion, and exact retries through another
attachment and after restart return the same turn. The
[notification routing test](../../../desktop/src/main/agent-notifications.test.ts)
exercises an unfocused workspace. Automatic compaction stays silent on
success and failure, while the following reply and manual compaction notify.
The [context limits cases](../tests/process/compaction/limits.rs) exercise the
exact threshold, the context window ceiling, a model downshift, and queued
work accepted before a settings reload. When an earlier tool result puts
the current turn over its threshold, a summary can replace that result in
model context while the reopened transcript retains the original. The
compactor receives the active request and the tool call paired with its
result. The active request also remains in foreground context. If the
summary fails, the next request still receives the original result. A
same-turn summary produces no additional lifecycle settlement. The
compaction item regression covers multiple starts and completions in the
same foreground turn, clearing an unsuccessful attempt, and preserving
item identity and position after settlement and reopen. When a turn resumes
after a question, the activity-order audit uses the same visible operations
as live publication. Resuming after an interrupted summary keeps one
failed item and issues no new summary request. The headless transcript
projection verifies that replay merges items by identity and preserves
their interleaving with other work.
The [queue recovery case](../tests/process/lifecycle.rs) also reopens a
previously accepted input from the retired hard-cap format and verifies that
it generates after Resume Queue without an input-count request.
The [native resume regression](../src/host/lifecycle.rs) verifies that a
checkpoint created under the old cap remains paused when Resume is refused.
Stop settles the turn and the host can shut down cleanly.
The [chat controller tests](../../../editor/lib/agent-chat/native-chat-controller.test.ts)
exercise a pending question whose review expires as independent work advances.
One click renews the same question and retries after a definite revision
conflict. A changed or closed question, a different attachment, or an
uncertain response cannot authorize a fresh answer.

The product supports slash commands, explicit skill mentions, branching, and
earlier-message revision through its composer and control layer, all over the
same history controls.

## Subagent controls

Named children are addressable, reusable conversations. Their controls separate
informational delivery, follow-up work, observation and interruption, so that
delivering context never starts work by accident.

| Operation        | Required behavior                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| Name and address | Keep a stable child session ID. Resolve any parent-scoped alias before control and treat readable names as metadata. |
| Send information | Persist informational input without automatically selecting a new turn; an idle child stays idle.                    |
| Assign follow-up | Reuse the child session and explicitly steer, queue, or start its assigned turn.                                     |
| Interrupt        | Stop the current turn and retain history for another assignment.                                                     |
| Reopen           | Reopen retained history under current grants. Report expired or unavailable state explicitly.                        |
| Inspect and wait | Observe without causing a child to execute.                                                                          |
| Pause            | Apply the Pause/Resume contract to an individual child or owned subtree.                                             |
| Close            | Release the child's execution resources while keeping its history for the stated retention period.                   |

Durable pause, exact result delivery and parent consumption are requirements
of this design rather than properties a child runtime provides by default.

Four pressure cases constrain the reusable-session design.

1. A child finishes assignment A and receives B. A delayed delivery for A
   remains attached to A and cannot satisfy B. The parent waits only for its
   assigned child turns, while idle child history can remain available.
2. A parent worker suspends while a child runs. The child continues within its
   existing allowance. An explicit parent Pause instead blocks the owned tree,
   while Resume preserves an independently requested child pause.
3. A completed child is reused in a later parent turn. Current authority and a
   new allowance are bound before admission. Retained history contributes
   context without renewing an old grant or spending allocation.
4. New instructions steer an already-running child. They retain their own
   input identity while joining its existing turn. The result identifies which
   inputs were incorporated, and steering preserves the current allowance.

Native private ACP supports bounded named text assignments and one
parent-funded reviewer. Named work can reuse a child from a later settled
parent turn and retains separate usage and results. A parent Resume preserves
the reviewer's independent Pause after reopening. [Built child lifecycle cases](../tests/process/subagents.rs)

### General delegation from ordinary work

An ordinary Act request can explicitly delegate independent general work
without selecting Ultra. The native host offers active-parent model tools and
binds each child to its source operation. Five distinct workers must be able to
produce separate artifacts through their declared native capabilities, return
correlated results and have the parent integrate them. The child transcript and
activity remain inspectable through the existing observation contract.

Required regressions cover original capture on restart, duplicate/lost-ack
admission, parent Stop racing spawn, Pause/Resume without erasing independent
child pause, exact result attribution, bounded fan-out and generation allowance,
permission narrowing and protected resources, and independent Ultra review.
General workers cannot gain recursive delegation or implicit live-editor
connections. Persistent Goals retain their funded review allocation; general
worker admission must not mint an extra Goal allowance.

Information sent to an active general worker must enter that exact assignment's
history and be visible to its next permitted model request, without a new
assignment or allowance. The append receipt must not claim the model read it.
Regressions cover one-time delivery and replay, current-assignment correlation,
completion races, paused/cancelled work, parent ownership and control fences,
and refusal to wake idle work. The private reusable-child message queue keeps
its separate next-assignment semantics.

Evidence: [built-process delegation cases](../tests/process/delegation.rs),
[native host delegation cases](../src/host/delegation/tests.rs), and
[master delegation policy cases](../../grida-agent-master/src/delegation.rs).
The active-worker information case holds an already-prepared child inference,
delivers a parent correction, then verifies that the next child request receives
it exactly once, produces the corrected file, and retains the message in the
same child's conversation. The confined worker-command case verifies that the
worker receives guidance identifying the native host as the automatic cleanup
owner, then holds parent inference while the child ends
its assignment, then verifies process retirement before allowing the parent to
wait. It requires the same explicitly supplied reviewed native helper as the
ordinary command fixtures. Run it with that setup; a default ignored result is
not execution evidence. Ordinary chat background-process lifetime remains a
separate control case.

All model replies in these cases are synthetic. They establish deterministic
execution and accounting, not live model willingness or provider availability.

## Side conversations

A side conversation is temporary and leaves the main chat working; it suits a
status recap or explanation. It freezes a source-history position and
reconstructs model context from the installed summary and the later suffix, so
opening it runs no new summarization. Policy identifies it to the model and
marks inherited history as reference material. New requests after that
boundary are its active work.

Its policy favors non-mutating exploration. These instructions establish the
model's role; actual grants and executors establish its enforced authority.
Returning to the parent is navigation and does not merge the side conversation
into parent context.

The components therefore treat this as derived conversation initialization. The master selects the seed, role, grants, lifetime, owner, and
output routing using existing Context, Runtime, and Sessions contracts.

| Pressure case                                               | Required result                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Parent keeps running after the seed is captured             | The side uses the captured context until an explicit refresh.                        |
| Parent history contains an active goal or pending tool call | The side receives reference material without inheriting execution obligations.       |
| The side uses a different provider or model                 | Validate continuation compatibility and rebuild or reject incompatible state.        |
| A strict read-only side is requested                        | Enforce the selected capabilities and grants independently of prompt wording.        |
| A temporary side performs an allowed external action        | Retain required effect evidence even if its visible transcript expires.              |
| The user returns to the main chat                           | Preserve its independent state. Forward side results only through an explicit input. |

## Persistent goal harness

A persistent goal separates a durable objective from the execution turns that
pursue it. The harness submits ordinary next turns when its policy decides more
work is needed.

The relevant missing seam was cross-turn driver state. A turn checkpoint covers
continuation within that turn. An objective, its lifecycle, and its continuation
eligibility can outlive many completed turns. The optional session
driver-state envelope supplies that persistence, with conditional revision
checks and atomic publication alongside existing controls and turn outcomes.
The master owns the goal schema, tools, prompts, completion criteria, and
anti-spin policy. The components enforce the generic storage and admission rules.

| Pressure case                                                        | Required result                                                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A work turn finishes while its objective remains unfinished          | Publish that turn's account. The harness can request another ordinary turn under the same goal policy and remaining allowance. |
| A continuation is queued, then the user pauses or edits the goal     | The changed state revision prevents stale admission.                                                                           |
| The process dies after settlement but before submitting continuation | Recover the state and completed turn. Reuse the stable continuation identity if policy still permits it.                       |
| An earlier child reports usage after a later goal turn is prepared   | Retain the reservation and account the usage once. New work uses the remaining cumulative allowance.                           |
| Completion races with a changed objective                            | Commit against the expected state revision or reject the stale completion. The final account and goal-state change agree.      |
| A branch copies goal context                                         | Preserve provenance while requiring explicit continuation activation for the new branch.                                       |
| A goal starts while a turn runs or input waits                       | Queue the start; the goal begins at admission, in queue order. A second start is refused while one is set or queued.           |
| A queued goal start is reordered, withdrawn, paused or restarted     | It follows the queue contract; the goal begins only when the start is admitted, and a withdrawn start begins no goal.          |

Goal state is restored on resume and coordinated with goal mutations. Exact
thresholds belong to the master, and budget accounting alone does not prove a
pre-dispatch monetary ceiling for every external action.

This addition creates no goal-specific neutral crate or runtime mode. It reuses
session state, ordinary turn drivers, controls, operation accounting, child
results, and wake-up delivery.

## Permission profiles and automatic review

Qualify [automatic review](../../../docs/wg/ai/agent/permissions.md#automatic-review)
and manual review against the same workspace profile. Verify which requests
need a decision, who can answer, and what access the executor enforces.

A command reviewer with a captured shell grant can inspect a project script
or a permitted file outside the project. Exercise both a workspace-only and a
disk-read profile, additional and revoked roots, protected paths, attempted
writes and network access. Stopping an inspection or revoking a read must
drain the process and withhold its output. The file-only grant on an older
turn stays file-only. The private model request can carry bounded output.
The foreground request, public activity and transcript must omit it.
[Shell confinement cases](../src/permissions/review_shell.rs),
[review lifecycle regressions](../tests/process/approvals/reviewer.rs).

A compatible later review may reuse a committed exchange in the same chat
after restart. A different chat starts empty. Replacing the active history
view or changing the reviewer’s effective settings retires the old checkpoint.
Concurrent actions take independent snapshots. Recover a still-pending
parallel action after the shared conversation advances and verify it retains
its original snapshot and cannot publish over the shared one. A stale owner
cannot restore discarded context. Remove the file after inspection and verify
that only the next private provider request receives the retained observation.
Historical observations are quoted as untrusted text. They cannot inject a
tool call or authorize the current action. After an input-limit error, one
retry can drop whole prior exchanges while preserving the current action
and observations.
[Private checkpoint cases](../../agent-kit-store-sqlite/tests/store/checkpoint.rs),
[provider and restart cases](../tests/process/approvals/reviewer.rs).

The native host keeps an executor with immutable scope, independently validated
roots, and OS sandbox creation, and its supervised approval flow preserves the
exact request and consuming run. An automatic reviewer adds a separate decision
route. [Command confinement](./rust-sandbox.md),
[Approval confinement tests](../tests/process/approvals/confinement.rs).

A restricted Act turn can request a reviewed retry in a workspace with no
version-control metadata. The [command retry process
cases](../tests/process/approvals/escalation.rs) require an exact fresh decision
and one launch after approval replay. They exercise a denied read of protected
host state, an ordinary workspace write, and replacement of the working
directory while approval is pending. On macOS, they also verify that a reviewed
listener serves HTTP on the approved loopback port. The process still cannot
bind a different port or connect outside the approved loopback endpoint. Stopping it ends the
listener, and a later ordinary command cannot use its grant.
For outbound access, the reviewer can consider a destination implied by an
authorized command. The broker still enforces the exact approved connection.
If a command yields a process handle and the foreground model finishes, the
turn must account for a destination review already in progress before publishing
its terminal receipt. The model need not poll the command to complete that review.
If the command itself exits before a decision, withdraw its wait and cancel the
private inference while retaining its outcome. A later decision for that
connection cannot cause a new prompt or reconnect the command.
When the decision requires human input, the same running command must receive
that answer even if the foreground model has already finished. An affirmative
answer must reach the upstream connection stage.

Full access is a separate explicit execution choice, independent of automatic
review. Restricted work must retain its original capture after a host gains
the ability to offer Full access. A per-chat change governs later admissions.
An active turn retains access to its own terminal after the user selects
**Ask for approval** or **Auto**. Only a subsequent Full-access turn can
drive that terminal.
The supervisor retains the ability to stop it. Reopening preserves the selection but
does not authorize a launch that lacks Full access capability. New Desktop
project chats use sandboxed access with automatic review when supported and
manual review otherwise. Existing chats retain their saved choice, and older
chats without one use manual review. The owning headless regressions are
[permission-mode process tests](../tests/process/full_access.rs): local HTTP,
outside-project file access, restoration of restricted denial, per-chat and
restart continuity, and actual npm acquisition with a writable external cache
and a dependency lifecycle script. The fixtures use synthetic provider replies
and a loopback package source, without real provider credits or public registry
access. The [native execution tests](../../agent-kit-sandbox/tests/native.rs)
separately verify finite, pipe and terminal supervision, cancellation,
owner-loss, denied default access and explicit unconfined evidence. Native
platform qualification must identify which OS was actually exercised.

| Pressure case                                                      | Required result                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Automatic reviewer approves an action beyond mandatory host limits | Admission is denied and no broader capability is created                        |
| The action or authority changes while review runs                  | Revalidate and obtain a decision covering the current action                    |
| A scoped Auto review times out or its evidence store fails         | Block the action and keep the technical failure out of the human approval queue |
| The requested sandbox profile cannot be enforced                   | Refuse or wait for an explicitly supported route                                |
| A review decision is committed just before restart                 | Restore its action binding and consumption state before dispatch                |
| An allowed network destination is used for a sensitive operation   | Product policy can still require semantic review of the action                  |

A user can select **Auto**, request an exact external file, and see
the file read once or the request return for manual review. Changing the file
while a decision is pending invalidates it. Earlier instructions in the same
chat remain relevant to later actions. A confined command retried with a
network destination requires review of the new authority. A command may need
a public hostname the user never typed. Tests cover both reviewer decisions,
including an earlier instruction to stay offline, and verify that a selected
reference link supplies context without granting access. An approved command
can reach only the reviewed destination. Tests count execution attempts and
check the evidence supplied to each reviewer.
Answering a clarifying question preserves the user's earlier restrictions.
After a denial, exercise a retry following a visible risk explanation and a
short reply in chat. Check that the reviewer can distinguish the assistant's
explanation from the user's answer. Cover consent to the same target, a refusal,
and a change of target. A reply queued before the question, or a steer that
preceded publication, supplies no informed consent to that question. A chat
reply cannot resolve a pending human approval.
If one action needs human input, another eligible action in the same response
can still receive its own review. The number of successful decisions does not
trigger a manual request. Repeated policy denials interrupt the turn.
Independent destination reviews can overlap. Completing one preserves other
pending reviews. A command that yields a process handle during review retains
its assessment when the current evidence still matches. New user instructions
require a fresh assessment. Exercise both orderings with a held provider reply.
The broker must consume the committed decision for its exact destination even
if the observer has yet to receive the update. A handoff must register the
human-owned request before the turn can finish.
Desktop chat shows review activity while the turn is running. Headless
regressions hold a managed destination in Auto review and verify the card
appears only after manual handoff. When Auto decides a command and its
destination, the native lifecycle emits no manual approval request.
Manual decisions remain available across the host's command-size range.
Withdrawing the launcher's reviewer opt-in returns new work to
**Ask for approval** and preserves earlier selection receipts. For managed
outbound retries, headless tests exercise the first destination decision under
the actual host and prove that repeated connections reuse it. The [package client
fixtures](../src/processes/network/package_clients.rs) install an npm artifact
larger than 8 MiB and fetch a uv wheel from a second HTTPS host, including the
case where the artifact host is denied. Both clients use local fixture origins.
The process owner revokes the proxy on exit and cancellation.
The [built-host review cases](../tests/process/approvals/reviewer.rs) exercise
both scopes and count real command starts. The Linux qualification also
serves a response from the approved hostname inside an isolated network
and checks the bytes returned to the model and the request received by
the origin. The [native sandbox fixture](../../agent-kit-sandbox/tests/native.rs)
checks the broker path and direct-network denial, and the [permission tests](../tests/permissions.rs)
cover file identity and revocation.

The host authorization adapter handles asynchronous review through the generic
admission gate. Sessions retains correlated interactions and operation results.
Runtime rechecks current authority before dispatch. The host issues grants and
interprets review decisions. OS-specific confinement belongs in the sandbox
adapter. Product labels and reviewer policy remain in the master.

## Feature coverage recheck

The [feature catalog](../../../docs/agent/features.md) separates current behavior
from intended guarantees and records each feature's availability and evidence.
This review maps its feature families to the
[master](../../../docs/wg/ai/agent/master.md) and
[components](../../../docs/wg/ai/agent/components.md).

| Catalog features                                                                    | Master or host decision                                                                          | Reusable contract                                                                                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Task input, slash commands, skills and instructions                                 | Resolve input affordances, preserve omitted material, choose instruction precedence and refresh. | Identified submissions, content provenance, captured context and tool definitions.                                                     |
| Projects and folders, live document editing, scratch                                | Group directories, select destinations, choose retention and publication.                        | Resolved bindings, scoped Files capability, document-owned operations, retained-input relationships and dependency holds.              |
| Models and providers, MCP tool integrations                                         | Select connections and allowed fallbacks, discover tools, handle readiness.                      | Prepared requests, provider capability validation, versioned tool inventory and admitted invocations.                                  |
| Configuration                                                                       | Define reviewed fields, defaults, supported scope, and activation semantics.                     | Global config inspection and reload. Each accepted input retains its validated settings.                                               |
| Hooks                                                                               | Select handlers, supported events, required-check policy, and trusted execution scope.           | Host-owned dispatcher over the admission gate and ordinary operations, with durable results and control precedence.                    |
| Usage and costs                                                                     | Supply prices and charge sources, label estimates, choose allowances.                            | Attempt-scoped usage observations with replacement semantics, reservations and enforced bounds.                                        |
| Agent effort, Plan and Act, persistent goals                                        | Define presets, initiative, success criteria and continuation.                                   | Opaque versioned driver state, captured decisions, ordinary tools and control-aware admission.                                         |
| Permissions, automatic review, command execution                                    | Set authority ceilings, select reviewers and approval rules, provide platform enforcement.       | Host authorization adapter over correlated interactions, with host-issued grants, revocation checks and executor capabilities.         |
| Progress, final summary, artifact presentation, visual tools                        | Select public content, meaningful previews, image requirements and verification.                 | Semantic output kinds, observer projections, structured outcomes, artifact references and optional consumer accounts.                  |
| Steering, queueing, questions                                                       | Choose input routing, effective settings, scheduling and whether an answer blocks work.          | Immutable accepted inputs, atomic queue replacement/reorder, targeted steering and correlated interactions.                            |
| Pause and resume, Stop                                                              | Choose whether a control suspends or settles, its target scope, and queue behavior.              | Persistent blockers, fenced ownership, verified suspension/settlement and explicit owned-work dispositions.                            |
| Reconnect, restart recovery                                                         | Select recovery action for missing capabilities or uncertain work.                               | Read-only views, cursor resynchronization, journal barriers, stable effect identities and reconciliation.                              |
| Chat management, branching, earlier-message editing, side chats, long conversations | Choose visibility, history selection, derived roles, retention and context transformations.      | Host metadata, deletion fencing, captured history seeds, explicit active-history changes and source-preserving projections.            |
| Subagents                                                                           | Choose names, assignments, decomposition and result integration.                                 | Reusable child sessions, per-turn input correlation, explicit control scope and enforcement of supplied funding relationships.         |
| External agents                                                                     | Advertise supported controls and decide which backend fits the task.                             | Turn-driver capabilities, remote receipts, separately declared observation and recovery guarantees.                                    |
| Grida tools for other agents                                                        | Select reviewed public capabilities and grant caller/resource scope.                             | Direct and MCP adapters share capability definitions, authorization, routing, and domain results, with Electron or headless execution. |
| Headless execution host                                                             | Select unattended interaction policy and expose explicit process/control configuration.          | The native host composes the same master, Runtime and Sessions behind server and bounded-run entrypoints.                              |
| Scheduled wake-ups                                                                  | Persist timers, choose a continuation purpose and whether to notify.                             | Ordinary identified submissions and controls under existing authority, pause and allowance checks.                                     |
| Reusable personal memory                                                            | Open product scope. If offered, choose retention, retrieval, correction and removal.             | Host storage and tools returning provenance-bearing content. Existing Context and authority contracts can consume it.                  |

The review required a few clarifications within these boundaries. Queue edits
replace unclaimed input atomically. Independent forks leave source work intact,
while an active-history change handles its affected interactions. Usage updates
replace prior observations for the same attempt. Pause scope is explicit, and
consumer-authored summaries remain optional in the core. The Grida master chooses
its tree-wide Pause behavior and requires a final user-readable account.

For queued work, this master captures requested settings and resolved defaults
when input is accepted. General queued replacement captures its replacement
configuration. The separately negotiated text-only transformation preserves the
entire original capture, including non-text parts, and changes only user text.
Execution still rechecks current grants, capability availability, and remaining
allowances. Sessions treats the configuration as opaque input and checks the
supplied revisions.

Search refinement, zoom, copying, downloads, pricing, slash syntax, and named
product modes remain in their existing master, host, or client owners. This
review calls for no additional core component or crate. Reusable personal memory
remains open, and native Windows command execution remains deferred.

### Queue edits and transfers

Queue control competes with admission in the session store. An edit reserves
the accepted input's position while removing it from runnable work. A selected
input either starts or is checked out. After restart, viewing the checkout is
observational. Reinsertion restores the retained input or commits a new
immutable text revision at its reserved position. A reply lost after commit
can be recovered even after that input runs.

Steering a queued input competes with claiming it or closing the addressed
turn. Verify that a winning transfer delivers the source once to that turn
and preserves its execution settings. A refused transfer leaves the original
input available to run in the queue. Use scripted provider requests to prove
that eligible retained images reach inference and public transcript replay
identifies the same authored contribution. Exercise the same ACP operations
from the terminal and Desktop clients.

### Request preparation and recovery

The complete input budget, error classification, and recovery path need explicit
contracts even when the happy path is one model request.

| Pressure case                                            | Required result                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Messages fit but tool schemas/framing exceed the budget  | Measure the complete prepared input and retain its exact/upper-bound/estimated basis.                                                |
| Rate limiting includes retry-delay advice                | Show waiting, honor the bounded policy, and allow Stop/Pause during backoff without an occupied inference permit.                    |
| A connection fails before the provider receives input    | Distinguish verified refusal from an ambiguous transport failure. Use the same bounded retry reservation only for eligible evidence. |
| Authentication, quota, or refusal prevents a request     | Give its specific outcome and recovery path. Do not treat it as an endless transient retry.                                          |
| A stream fails after one of its tools ran                | Retain that tool's actual outcome and reconcile before continuation or repetition. Fresh call IDs cannot hide a duplicate effect.    |
| A model emits malformed arguments or an unavailable tool | Preserve a correlated pre-execution error for bounded correction. Infrastructure failure remains distinguishable.                    |
| Compaction finishes after input or lineage changes       | Validate its covered basis and preserve later input. Reject an incompatible candidate without replacing the live view.               |
| Compaction fails or still leaves input too large         | Retain previous context and stop after bounded recovery with a clear explanation.                                                    |

Counting the provider representation of the complete request, and classifying
a retryable failure separately from the wait that reports progress and handles
cancellation, are the mechanisms these contracts need. Retry counts and
compaction strategy remain product decisions.

For R10, the [native process case](../tests/process.rs) exercises a direct
connection refusal through its one retry, then a lost reply after the peer
receives the request. It checks two attempts without execution in the first
case, one received request and an uncertain result in the second, and a
successful follow-up in the same session. The
[master tests](../../grida-agent-master/tests/durable.rs) exercise Stop and a
retained retry deadline across restart. The
[supervised Responses cases](../tests/process/responses.rs) cover verified
rate-limit advice and exhaustion. Generic transport failures from the
supervisor cannot establish a transient connection refusal.

### Lifecycle hooks

The [hook contract](https://grida.co/docs/wg/ai/agent/hooks) adds a feature to the
catalog using existing operation ownership, journal, admission, and sandbox
mechanisms. It keeps executable handlers separate from volatile observers.

| Pressure case                                                           | Required result                                                                                                                                                  |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A model invokes a tool through `step`                                   | Apply the selected pre/post handlers for that backend, including nested ordinary calls. Hook-origin internal calls avoid recursion.                              |
| A required pre-tool hook fails or times out                             | Preserve the failure and block the target before effect admission.                                                                                               |
| Stop arrives during a completion check                                  | Cancel under the existing scope, preserve its outcome, and settle under Stop. No automatic continuation.                                                         |
| An after-tool hook fails                                                | Preserve the successful or failed tool receipt separately from the hook result.                                                                                  |
| Recovery finds a committed hook result                                  | Consume the same result, with no repeated command or duplicate context contribution.                                                                             |
| A hook command's external result is uncertain                           | Use normal reconciliation rules before repeating it.                                                                                                             |
| A client reconnects or replays events                                   | Deliver observations without invoking hooks.                                                                                                                     |
| Stop or Pause closes admission before an after-tool command hook starts | Record cancellation or deferral, retain the original tool result, and run no hook under an invented cleanup owner. A required deferred check gates resumed work. |
| A turn has already settled                                              | Its operation handle remains closed. External follow-up needs a separately admitted owner.                                                                       |

Observers are isolated from one another, and a successful mutation is preserved
when a follow-up callback fails. These invariants do not by themselves
establish a user hook runner. [Hook process tests](../tests/process/hooks.rs).

### Foreign tool host

When Desktop returns from a workspace to Welcome, Main retires the old chat
observer and browser guests. A running chat keeps running. Late renderer
cleanup resolves locally after the route changes. The
[Electron preload case](../../../desktop/src/bridge/workspace-cleanup.electron.test.ts)
checks which calls cross IPC, and the
[chat](../../../desktop/src/main/native-chat-ipc.test.ts) and
[Browser](../../../desktop/src/main/browser-host.test.ts) cases exercise
Main's navigation and resource retirement.

The [concrete contract](./tool-host-contract.md) gives native and MCP calls the
same Grida dispatcher, while each document implementation owns its operations
and state. The required boundary cases cover shared definitions and results,
endpoint replacement, lost replies, cancellation, and optional headless
presentation. The adapters preserve domain failures and any executor-provided
recovery evidence.

A controlled second process proves routing and result delivery through direct
and MCP bindings. Document editing behavior is verified with the owning
implementation. Actual editor behavior and rendering require their corresponding
Desktop evidence. MCP-only execution must work without constructing the
built-in agent session.

The [private Desktop catalog process cases](../tests/process/desktop_tools.rs)
check deferred offers, endpoint replacement, an unverified SVG
mutation, and an unconfirmed trusted reveal. A scripted peer adds a read and
a counted mutation through the same catalog. The master tests preserve the
original request inventory across interrupted publication and cover the
source-choice step when several extensions match. The
[native Browser capture cases](../tests/process/tool_images.rs) cover the
shared carrier, model image eligibility, and legacy compatibility. The
[Main process cases](../../../desktop/src/main/native-agent-process.test.ts)
exercise Browser replies under backpressure and against the packaged host.
The private source registration tests cover colliding local operation names
and replacement with an identical definition after accepted input. The
retired generation must refuse its call while the sibling source on the same
workbench remains usable.

Skill discovery must also preserve owners when two extensions and a workspace
each supply `inspect`. The ordinary workspace name and both qualified
extension reads must select their respective bodies, including after capture.
A second skill under the same extension must leave its initial summary count
at one. Swapping equivalent tool and skill providers, or adding more matching
tools to one provider, must preserve the order in which discovery offers the
sources. The [native skill cases](../src/skills/extension_tests.rs) and
[product discovery cases](../../grida-agent-master/src/discovery.rs) exercise
these claims. The [FX process cases](../tests/process/desktop_fx_discovery.rs)
inspect the submitted model requests.

The authenticated export and actual guest interaction have separate
[loopback](../../../desktop/src/main/native-editor-mcp-export.test.ts) and
[Electron](../../../desktop/src/main/browser-automation.electron.test.ts)
tests.

### ACP client boundary

The [client protocol binding](./rust-client-protocol.md) maps standard ACP
exchanges to the same internal contracts used by headless execution. The
following cases constrain that adapter before compatibility can be claimed.

| Pressure case                                                    | Required result                                                                                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A plain client starts a v1 prompt                                | The response retains ACP completion timing. Durable acceptance uses an advertised extension and the same Sessions service.              |
| A client renders a custom tool or child panel                    | Standard content remains usable. A display hint cannot authorize work or prove successful rendering.                                    |
| A required question reaches a client without elicitation support | Safely suspend, explain the unsupported capability, and retain recoverable input-required state without a false completion result.      |
| A client disconnects while permission is pending                 | Retain the interaction under the applicable host lifetime. Redeliver with fresh RPC correlation and the same durable identity.          |
| A client asks to steer an existing child                         | Require explicitly supported target/control semantics. ACP's current subagent draft alone does not grant that operation.                |
| A replay follows process loss                                    | Follow the negotiated replay rules and Grida's durable receipts/cursors. Connection-local or optional upstream IDs cannot replace them. |
| A settings UI changes an advertised session selector             | Apply that session scope. Persistent numeric defaults come from the global file and apply after host startup or explicit reload.        |

The [independent catalog process case](../tests/process/live_catalog.rs)
uses two workspace writers and two subscribers. It checks that an unseen chat
can move onto the first page, a filtered observer receives only its workspace,
and read state is shared without attaching. A held question exercises running
and input-needed state. Killing its writer checks liveness independently of
graceful cleanup. Removing a workspace from the registry rechecks access on
both listing and mutation, including after reconnect.

These cases introduce no new core component. The host adapter owns protocol
translation, and Desktop owns rendering. They preserve the existing acceptance,
authority, interaction, recovery, and presentation obligations.

### Command confinement

The native adapter confines raw executions. The host's authority, routing,
credential custody, and process supervision remain separately owned. Outer host
containment is a separate deployment profile. Platform support requires direct
enforcement evidence.

The [native sandbox binding](./rust-sandbox.md) uses one crate with Seatbelt on
macOS and bubblewrap plus a trusted seccomp helper on Linux. The raw-command
profile denies direct networking. Ordinary Act commands on a managed profile receive the proxy at launch. A connection needs a destination decision. Native Windows raw execution is deferred behind
capability checks.

| Pressure case                                              | Required result                                                                                                                                                                                             |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two concurrent children have different filesystem grants   | Each execution retains its own scope, including after either grant changes.                                                                                                                                 |
| A command requests networking                              | Admission refuses an unsupported profile before execution. A qualified command reuses its process-scoped destination decisions and keeps direct network access denied.                                      |
| A child daemonizes outside its original process group      | Cancellation reports whether the descendant terminated, remains confined, or is unresolved. Conflicting work cannot assume revocation.                                                                      |
| A process exits before temporary-resource cleanup finishes | The outcome preserves cleanup state before releasing ownership that depends on it.                                                                                                                          |
| Host proxy or trust configuration changes                  | The host routing adapter handles the change within authorized destinations. Confinement does not silently widen.                                                                                            |
| A platform cannot enforce the requested profile            | That execution remains unavailable through the existing admission contract.                                                                                                                                 |
| A command is still running when its turn ends or stops     | The chat keeps it as a numbered process that later turns can read and stop. Only explicit stops, eviction, deletion, its scope lifetime and host shutdown end it; a changed profile governs later launches. |
| A chat starts more processes than it may keep              | Eviction stops a least recently used process outside the most recent and in-use ones, records its cleanup, or refuses the new command.                                                                      |
| The chat is deleted or the host shuts down                 | Its processes stop first. Unconfirmed cleanup is reported, not assumed.                                                                                                                                     |

The native adapter separates an immutable command scope from the executor,
validates command roots independently, and waits for worker cleanup on
cancellation. macOS process-group revocation has a documented limitation.
[Command tests](../tests/commands.rs),
[process control tests](../tests/process/processes.rs),
[Host authority and limitations](../../../desktop/docs/agent-authority.md).

## Design decisions

The earlier TypeScript implementation supplies evidence of user-visible
behavior and past failures. Its framework, process topology, and defaults do
not determine the native design.

| Earlier choice                                                                   | Decision and reason                                                                                                                                                                           |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP plus a separate event stream from the TS daemon                             | Use ACP with stdio first and an explicit shared-service binding. Negotiate additional durable controls while keeping core contracts protocol-independent.                                     |
| TS socketless sidecar, main-owned provider broker, and compulsory outer envelope | Let the trusted native host own approved connections and launchers. Declare host hardening separately from mandatory raw-execution confinement.                                               |
| One SQLite worker and one process for the entire database as fixed architecture  | Use SQLite as the persistent adapter. Require per-session ownership and atomic publication; worker, connection, and process topology are adapter choices.                                     |
| Queued work inherits whatever settings happen to exist at selection              | Capture requested model, effort, regime, approval policy, and resolved defaults at acceptance. Explicit queued edits can change them. Current authority and limits still constrain execution. |
| A fork must start from already bounded model context                             | Seed from selected retained history, then assemble model context separately. A side chat seeds like any fork and adds its policy at assembly.                                                 |
| Workspace hydration determines which files exist                                 | Use demand-driven file access and bounded listings. Index coverage is a discovery aid and cannot replace actual resource checks.                                                              |
| Text and tool results suffice as the semantic message vocabulary                 | Preserve readable reasoning and optional assistant phase, with opaque provider state retained separately. A final-answer phase has no settlement authority.                                   |
| A step executes a sequential tool batch after the model finishes                 | Keep step attribution while allowing complete validated calls to start during streaming and independent calls to overlap.                                                                     |
| Public segmented-effect machinery before advanced consumers exist                | Begin with complete-input tools. Streaming mutation and paid-job recovery must establish the shared stage API before promotion. Their durable-effect obligations still apply.                 |
| Bundle one bubblewrap build as a core requirement                                | Require a trusted compatible non-setuid executable and feature probes. System selection and bundled fallback are packaging choices.                                                           |

The design keeps durable acceptance, pre-effect barriers, explicit uncertain
outcomes, scoped authority, recoverable working files, and final-account policy.
These answer the catalog's product promises and known failures. A persistence
design with weaker guarantees does not remove those requirements.

A model command can outlive its call and turn: the host keeps a still-running
command as a chat-owned process, while the sandbox handle supplies only
supervision, output retention, input and stop. Process lifetime, numbering,
eviction, listing and stop paths belong to the host's process store. Reviewed
checks remain finite. Host environment projection and private state creation
belong to the execution and storage adapters. Bounded ingress and
slow-consumer handling remain protocol responsibilities.

### Rejected alternatives

| Alternative                                         | Decision                                                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Checkpoint every new decision                       | Derive simple master state from committed work, checkpoint additional state explicitly                                        |
| Every tool author manually journals nested effects  | Runtime wraps ordinary invocations, while concrete advanced consumers establish any shared stage API                          |
| Master reads the journal snapshot                   | Give the master a semantic view and keep replay schemas adapter-facing                                                        |
| Another state machine for interactive tools         | Reuse Runtime's typed wait operation through a narrow scoped adapter                                                          |
| A special reporting subsystem                       | Use ordinary inference when needed and a factual fallback from recorded results                                               |
| Generalized media inference                         | Adapt typed generation clients as Tools                                                                                       |
| Additional surface or todo core components          | Keep domain tools and presentation projections in product composition                                                         |
| A separate command-line agent loop                  | One native host composes the master for service, unattended, and Desktop clients                                              |
| A queue-specific settings framework                 | Keep settings in input/driver state and capture their selected revisions                                                      |
| Runtime-owned hook and reviewer workflows           | The master and host supply hook dispatch and authorization policy through the admission gate and ordinary recorded operations |
| Implicit parent funding for every child             | The master selects funding relationships, and admission enforces the supplied allocations                                     |
| Fixed tool envelopes and file-spooling policy       | Tool adapters own domain results, the host owns retained output, and the master selects model presentation                    |
| A pricing or preview core service                   | Use normalized usage evidence and artifact references, with host-owned interpretation                                         |
| A mandatory core summarizer                         | Keep structured settlement mandatory and consumer-authored summary policy in the master                                       |
| Partial-input admission in the tool contract        | Use complete validated arguments. Keep staged mutation behind its separately reviewed consumer contract.                      |
| A background compaction subsystem                   | Use foreground candidate generation and atomic installation. Add speculative preparation only for measured benefit.           |
| Shared-service networking before core controls work | Controls are proven over stdio; the loopback listener has its own independent-client tests                                    |
| One crate for every logical component               | Shared Core, Runtime, and Sessions packages, with lower components as modules                                                 |

The semantic commitments these walkthroughs support are listed in the core
binding's [committed boundaries](./rust-core.md#committed-boundaries).

### Captured route and replacement regressions

The [supervised process tests](../tests/process/responses.rs) change model
and access while the first turn is waiting for a provider reply. They verify
the actual model and command access on the running turn's next inference and
on messages queued before and after the change. A cold restart test resumes a
subscription turn only after its original account is available again. The
[Desktop integration](../../../desktop/src/main/native-agent-selection.test.ts)
also exercises the real supervisor and executable across a model change and restart.

The built-process model-change case creates a chat on A, accepts B work, queues
B input, pauses and resumes B, restarts B and completes both retained inputs.
It also proves worker preparation refuses active and retained work, seals idle
admission and rejects late enqueue. Private supervised Responses cases cover
B-funded Ultra reviewers, Goal reviews and automatic Goal continuation, plus
explicit same-model principal and provider changes without encrypted replay.
The Gateway scope-change case verifies new Goal funding, old exact receipts,
retained spending and unavailable foreign-scope billing refresh. Explicit Stop
cases settle accepted work with a changed model or credential without dispatch.
The host's
preparation unit cases cover pending controls, title requests and unattached
queued sessions. Every provider response is synthetic; live provider entitlement
and human selection/rendering checks require their own evidence.
