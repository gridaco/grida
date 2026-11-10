# Rust core pressure test

This is a design walkthrough of the [Rust core proposal](./rust-core-proposal.md).
It follows a minimal master and a durable session through their public contracts,
then checks those contracts against current Grida features and the inspected
Codex and Zed implementations. The traces are paper executions. They establish
contract consistency and identify implementation work that still needs proof.

The reference snapshots are Codex `6107b9886c` and Zed `62682ebde9`, both from
2026-11-09. Grida evidence comes from the current source and its adjacent tests.
Existing behavior is evaluated as a product requirement or implementation
example. Each proposed guarantee is stated independently of how any reference
currently implements it.

## Existing harness assessment

The existing harness supplies useful behavioral evidence and past failure cases.
Its coverage is uneven, and a test title can claim more than its assertions or
entrypoint establish. The canonical product description therefore retains the
current fact, intended outcome, and consequential caveat. The harness records
which part of that description has actually been observed.

| Existing material                                                                                                          | What it establishes                                                                                                                                                                                                               | Limit of that evidence                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Manual interaction cases](../../../test/README.md)                                                                        | Product situations, rationale, visible outcomes, and known limits. The [pending-answer case](../../../test/desktop-agent-chat-human-input-queue.md) preserves the approval, queued follow-up, and attachment limitation together. | That case is marked untested. Linked automated coverage does not establish that the composed interaction has passed. The [canvas refresh case](../../../test/desktop-workbench-canvas-resource-refresh.md) records a prior verification, which still needs repeating after relevant changes. |
| [Fake-agent outcome tests](../src/agent-provider/jtbd.test.ts)                                                             | Ordered reply streaming, session reuse calls, cancellation, and host admission rules under deterministic conditions.                                                                                                              | Reusing a session identifier does not establish model recall or a correct rendered conversation. The header still calls cancellation skipped although its case is active.                                                                                                                    |
| [Scheduler tests](../src/runtime/session-scheduler.test.ts) and adjacent client tests                                      | Queue ordering, preservation of pending decisions, read-only status hydration, and specific race handling.                                                                                                                        | These checks exercise selected components. They do not independently establish the complete Desktop interaction or provider charges.                                                                                                                                                         |
| [Live image tests](../src/runtime/runtime.live.test.ts) and [external-agent tests](../src/agent-provider/run.live.test.ts) | Opt-in real-model perception, correlated image bytes, follow-up recall, and selected runtime paths.                                                                                                                               | The image suite's restart case reconstructs a miniature runtime host inside the test process. It omits shipped-host scratch cleanup and does not establish working-file survival across a full daemon restart. Live cases need separate opt-in execution.                                    |

The manual registry is a useful writing precedent. Its scope is interaction
verification, and a fully automated case can be marked deprecated there. The
underlying product promise must remain in its canonical feature description.

On 2026-11-09, the targeted command below passed all nine fake-agent tests. The
scheduler suite failed to load because the local `@grida/ai/catalogue` build was
missing. Building that prerequisite was blocked by the missing pinned
`@grida/ai-models/models.json` dependency. This is an incomplete harness run,
with no scheduler behavior verdict. Live-provider and Desktop interaction cases
were not executed in this audit.

Run from `packages/grida-ai-agent` after installing and building prerequisites.

```sh
./node_modules/.bin/vitest run src/agent-provider/jtbd.test.ts src/runtime/session-scheduler.test.ts --reporter=verbose
```

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

## Regression obligations

These are product situations worth carrying into the rebuild. Each states what
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

**Rebuild proof is pending for the cases below.** Existing tests explain why
these cases matter. They have not been run against a new Rust implementation.

| Case                                    | Product situation and required outcome                                                                                                                                                                                                                                                    | Existing evidence and limit                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1 — reopen a waiting chat              | Reopening a chat shows its queue and pending decisions. Viewing it starts no additional work or chargeable request. [Sessions](https://grida.co/docs/wg/ai/agent/components#sessions) owns observational access.                                                                          | The [scheduler test](../src/runtime/session-scheduler.test.ts) preserves the queued item and observes no drain call during status hydration. It does not inspect billing or the rendered chat.                                                                                                                     |
| R2 — reconnect after a completed action | Reconnecting or retrying preserves the previous result once, and the person can continue without losing it or repeating the action. [Runtime journal](https://grida.co/docs/wg/ai/agent/components#the-execution-journal) owns result identity.                                           | The [input test](../src/runtime/run-input.test.ts) guards the previous collision when completed results were sent again. It proves persistence behavior, without invoking or counting external actions.                                                                                                            |
| R3 — switch documents during an edit    | An accepted call retains its addressed endpoint and document arguments, or reports that endpoint unavailable. [Workspace contract](https://grida.co/docs/wg/ai/agent/workspace#authority-and-changes-during-work) owns the target.                                                        | The current [binding](../../../editor/scaffolds/desktop/file/active-editor-agent-fs.ts) follows the active editor. That identifies the risk and does not prove the proposed outcome.                                                                                                                               |
| R4 — return to uploaded-image work      | After interruption or restart, the agent restores the exact input promised by its retention policy or explains what must be supplied again before continuing. [Scratch retention](https://grida.co/docs/wg/ai/agent/scratch#s2--declared-retention-and-recoverability) owns availability. | The [scratch tests](../src/session/scratch.test.ts) show startup cleanup can remove working files. A retained message descriptor alone cannot establish recoverability.                                                                                                                                            |
| R5 — retry saving a generated result    | If generation succeeds and saving fails, retain the result or recovery record. Retrying the save uses the completed generation. [Artifact evidence](https://grida.co/docs/wg/ai/agent/components#integration-capabilities-and-bounds) owns this distinction.                              | [Desktop media fixtures](../../../desktop/src/sidecar/media-startup.test.ts) retry a retained MP3 copy with one provider request and preserve the live result when the library cannot publish a receipt. [Native crop fixture](../../../desktop/src/main/native-agent-images.test.ts) covers retained chat output. |

Newly discovered caveats extend this section only when they establish a distinct
failure or uncovered contract. Each entry retains its cause, owner, evidence,
and required observation. Related detail belongs beside the owning contract.

### Discovery audits

Discovery draws on independent sources rather than waiting for a remembered
feature or bug. Entry points expose callable behavior. Tests expose corner
cases. Fix history supplies causal evidence. User workflows and reference
systems challenge coverage, while the current implementation remains the source
for claims about existing behavior.

The 2026-11-09 source audit enumerated 149 candidate test files across the agent,
daemon, and chat-client scopes, then inspected targeted cases and relevant fixes.
This is a bounded source review. Live application behavior, native enforcement,
and provider execution still require their own acceptance evidence.

| Additional case                               | Product situation and required outcome                                                                                                                                     | Existing evidence and limit                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R6 — switch chats during work                 | After switching from chat A to B, A's delayed output stays in A. B retains its own activity and controls.                                                                  | [Transport tests](../../../editor/lib/agent-chat/bridge-transport.test.ts) and [ownership tests](../../../editor/lib/agent-chat/stream-attach-owner.test.ts) exercise delayed work against replaced chat bindings. The composed UI still needs verification.                                                                                                                                                                                                                                   |
| R7 — a submitted message cannot start         | A rejected message remains available to queue or retry. An existing question stays answerable, and repairing the displayed history preserves valid ongoing work.           | [Recovery tests](../../../editor/lib/agent-chat/stream-recovery.test.ts) cover automatic recovery of a text-only tail. The [manual pending-answer case](../../../test/desktop-agent-chat-human-input-queue.md) includes attachment preservation and remains untested.                                                                                                                                                                                                                          |
| R8 — change models after attaching images     | Same-named images keep their identities. At submission, the selected model and available tools can use the intended image, or the person receives an actionable rejection. | The [native chat controller cases](../../../editor/lib/agent-chat/native-chat-controller.test.ts) preserve the selected PNG during model selection and refuse the switch until the attachment is sent or removed. They check same-named replacements and exact submission bytes. The [older routing cases](../../../editor/lib/agent-chat/input-resource-router.test.ts) cover the separate omission notice and file fallback behavior. Installed model use and display need further evidence. |
| R9 — a completed change cannot be announced   | A completed change remains effective even if its notification fails. Retrying recognizes that the change already happened.                                                 | The [historical catalogue test](https://github.com/gridaco/grida/blob/5bd69ca22740fcb4b0f4db02210903c8503b7f34/packages/grida-ai-agent/src/providers/model-catalog.test.ts#L324) preserves applied state after a listener throws. Broader action recovery is a proposed requirement.                                                                                                                                                                                                           |
| R10 — repeated service failures               | Repeated unavailable or oversized responses leave the application usable, and cancellation releases the work it owns.                                                      | The [historical response-body test](https://github.com/gridaco/grida/blob/3a0966dc116ea2f76845a5abd269f1a4d0939632/packages/grida-ai-agent/src/providers/model-catalog.test.ts#L342) checks cleanup for selected rejected responses. It does not establish long-running UI responsiveness or every exit path.                                                                                                                                                                                  |
| R11 — replace an image used by an open canvas | The canvas and its previews refresh while preserving unsaved edits. If edits delay refresh, it becomes visible after save or reload.                                       | [Reload tests](../../../editor/scaffolds/desktop/workbench/workspace-file-reload-guard.test.ts) cover races. The [visual case](../../../test/desktop-workbench-canvas-resource-refresh.md) records the composed outcome and prior verification, subject to rechecking after changes.                                                                                                                                                                                                           |
| R12 — an attached folder changes destination  | Permission to a folder cannot silently expand to protected content when its underlying destination changes.                                                                | [Native ACP fixture](../../../crates/grida-agent/tests/process/approvals/confinement.rs) retargets an alias during review. On arm64 macOS and Linux, the scoped write succeeds and direct or aliased protected reads and writes are refused. The [permission fixture](../../../crates/grida-agent/tests/permissions.rs) checks replacement of the approved root.                                                                                                                               |

Cases R9 and R10 retain commit-pinned evidence because the original files have
since been reorganized.
The rows add concrete observations to existing identity, ownership, input,
resource, and publication contracts. They do not create more product features.

For R7 and R8, the [native image case](../../../desktop/src/main/native-agent-images.test.ts)
queues the selected PNG during a running turn, recovers the exact receipt on
retry, and reopens the receipts for two same-named images under a text-only connection.
It verifies the original bytes at the provider adapter and refuses an unsupported
send before the text or image enters the chat. The
[draft recovery cases](../../../editor/lib/agent-chat/native-chat-controller.test.ts)
cover keeping the draft on a rejected replacement and reusing its input identity
when the outcome is unknown.

In a long chat, [earlier pages](../../../test/desktop-agent-chat-transcript-history.md)
show their own messages, and returning to the latest page includes work that
settled while browsing. The [controller case](../../../editor/lib/agent-chat/native-chat-controller.test.ts)
holds an earlier read across settlement. The [Main case](../../../desktop/src/main/native-agent-process.test.ts)
exercises overlapping replay requests and delayed chunks.

The unsigned macOS ARM64 native Desktop preview at `85b6cf526` exercised
the rendered workbench, packaged preload, Main, and the native child together.
With a saved OpenRouter GPT-5.6 Terra profile, two files named `same.png`
reached the synthetic provider with their respective original bytes. A
simulated loss of PNG capability kept the text and attachment in the mounted
composer and left the current question visible. After capability recovery, a
lost acceptance reply was retried with the same queued input ID. Answering the
original question released that follow-up for exactly one inference.

Relaunching the same preview profile on Vercel removed PNG availability and
sent no work. Relaunching on the original OpenRouter profile reopened an existing
pending question and accepted its answer once. This verifies the supported
one-PNG path with synthetic upstream responses. Live provider execution and
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

Codex's captured step context and Zed's round-by-round preparation support this
boundary between product choices and mechanical execution. Zed also releases
the completed model request's permit before awaiting tool work that may need
the same capacity. [Codex step context](https://github.com/openai/codex/blob/main/codex-rs/core/src/session/turn.rs),
[Zed turn loop](https://github.com/zed-industries/zed/blob/main/crates/agent/src/thread.rs).

### Counterexamples

- Requiring a serialized master state before every request makes this consumer
  maintain redundant state. The contract now requires sufficient continuation
  evidence and uses explicit checkpoints for additional product state.
- Returning ordinary cancellation as an unhandled driver error skips the final
  account. Requested stop closes new effects while allowing receipt recording
  and settlement.
- Exposing journal snapshots as the master's public view binds policy to storage
  layout. `MasterView` supplies the semantic data the consumer actually uses.
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

Codex's authoritative history under acquired writer ownership is relevant to
these cases. The inspected Zed native persistence path saves thread snapshots
asynchronously, which establishes a different boundary from the proposed
pre-effect journal. The stronger durability rules remain requirements of this
design. [Codex thread store](https://github.com/openai/codex/blob/main/codex-rs/thread-store/src/store.rs),
[Zed thread persistence](https://github.com/zed-industries/zed/blob/main/crates/agent/src/agent.rs).

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

The [native host](./rust-core-proposal.md#native-executable-and-headless-host)
is part of the first durable delivery. The same binary serves Desktop and
headless protocol clients, and its bounded run entrypoint uses the same master.
Passing imported-handler tests is supporting evidence. The executable path
must also be exercised in its actual process.

The first process path uses JSON-RPC over stdio under a supervising parent.
Independent-client cases use the explicitly selected authenticated loopback
WebSocket service. Both bind the same dispatcher and session contracts. Closing
the only stdio supervisor initiates bounded host shutdown. Disconnecting one
client of the shared service leaves that service running.

| Product situation                                           | Required observation through the executable                                                                                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Submit a task without a terminal                            | The process accepts explicit input and returns structured progress and an identifiable outcome.                                                           |
| Send a request twice after losing its acknowledgment        | The same accepted input and result are recovered, with one owned execution. R1 and R2 remain applicable.                                                  |
| An unattended task requires approval or an essential answer | It returns the retained input-required disposition. A protocol client can answer and resume it once. Permission stays independently configured.           |
| Disconnect a client from a running service                  | Work follows its existing controls. Another client can restore status and output without creating another turn. R6 and R7 remain applicable.              |
| Stop an embedded run or terminate its host                  | Bounded shutdown records settlement, suspension, or recoverable uncertainty. Restart reconciles prior work before another attempt.                        |
| Generate output, then fail saving or presentation           | The result and available recovery evidence remain inspectable through the protocol. R4 and R5 remain applicable.                                          |
| Two clients control the same task                           | Conditional controls produce one ordered disposition and preserve each submitted input.                                                                   |
| A requested tool needs a live editor or picker              | The host advertises its actual client capabilities. A headless adapter can exercise the interaction contract, with visual acceptance recorded separately. |

The current [CLI tests](../src/cli.test.ts) provide both a spawned server smoke
and imported-handler tests through HTTP. Their scope is recorded as existing
evidence, without treating them as full executable coverage of every feature.
The first native proof uses isolated state and explicit connection targets so
test runs cannot attach to unrelated personal sessions.

## Grida requirements that change the design

### Live resources and publication

The agent-facing `/canvas.svg` can be rebound when the active editor or slide
changes. Its live binding mutates editor state, while the host separately owns
disk persistence. The proposed tool host captures the selected endpoint and its
binding generation so a focus change cannot silently redirect an admitted call.
The document tool owns the meaning of its arguments, edits, persistence, and any
content-version checks. [Active editor binding](../../../editor/scaffolds/desktop/file/active-editor-agent-fs.ts),
[Live SVG binding](../../../editor/scaffolds/desktop/ai-sidebar/agent-fs-binding.ts),
[Filesystem freshness and conditional writes](../src/fs/index.ts).

The journal preserves invocation arguments and reported outcomes. If the
original endpoint is gone, the adapter reports unavailability or an uncertain
outstanding outcome. Document-specific readback, when available, belongs to
that implementation. The master chooses its next action using this evidence.

`surface_open` acknowledges an auxiliary presentation request. The renderer can
observe it later, and the model's continuation does not depend on successful
rendering. This fits a recorded tool result plus an optional client projection.
It needs no surface-specific execution framework. [Surface contract](../src/surface/index.ts),
[Replay-aware observer](../../../editor/lib/agent-chat/surface-tool-call-observer.ts).

The product already asks for a meaningful renderable artifact early in a task.
That is a master policy and a useful performance measure, time to first usable
artifact. It is distinct from a recovery checkpoint for the master program.
[Surface behavior tests](../src/agent/surface-capability.test.ts).

### Rich human results and model input

The Library picker starts from an agent query, but the user can refine the
search and select a different set of references. The returned value contains
structured asset identities and URLs. Text questions use another schema.
The requesting tool therefore owns the wait's response schema. A narrow adapter
to the existing Runtime wait mechanism supplies correlation, durable receipt,
and cancellation. [Library selection](../src/tools/design-search.ts),
[Question contract](../src/tools/question.ts).

Selected asset titles remain asset-supplied metadata. The user's selection does
not turn those titles into instructions. Grida's current model projection
deliberately omits them. The full result and its model-facing projection must
remain separate.

Grida also retains image-bearing tool results and derives a provider-compatible
model input from them. A pressure case must verify that the next inference
receives actual image content and preserves call/result correlation, rather
than receiving base64 as text. Image-retention policy belongs to the master,
and the transformation retains source provenance.
[Image lowering](../src/agent/hoist-tool-result-images.ts),
[Model-view retention](../src/runtime/message-view.ts).

### Paid media, artifact retention, and authority

Grida's media clients separate new submission from lookup of an existing job.
The existing-job path can work independently of current new-work discovery.
This requires an explicit recovery entry point in the tool adapter and a
nonterminal receipt record in the journal.
[GG operations](../../grida-ai/src/gg-operations.ts),
[Music recovery](../../grida-ai/src/music-client.ts),
[Music route](../src/http/routes/music.ts).

Generated bytes can remain useful when optional persistence fails. Provider
completion, artifact retention, and presentation have separate outcomes. A
master can retry storage or presentation using an existing result, while a new
generation is a new operation. If the bytes are no longer available, the record
must say so. [Generated-media persistence](../src/http/routes/generated-media-persistence.ts).

The current model view also distinguishes a retained descriptor from evidence
that its content can still be resolved. A scratch path is insufficient reason
to discard the only surviving image. Reference resolution supplies current
availability as data before context assembly.
[Attachment availability](../src/runtime/message-view.ts).

Hosted execution is scoped beyond an account identity. Tenant, purpose,
endpoint, token lifetime, and credential generation can matter. The core keeps
an opaque authority binding and the host validates compatible access for
recovery. A display organization is not authorization evidence.
[Hosted session binding](../../grida-ai/src/gg-session.ts),
[Video invocation custody](../../grida-ai/src/video-client.ts).

The existing typed media clients fit behind Tools. Expanding conversational
Inference into a universal media executor would combine contracts that already
have independent consumers. [Rust media clients](../../../crates/grida-ai/README.md).

### Existing control boundaries

Grida's scheduler explicitly keeps status hydration observational. Reading or
subscribing cannot become permission to drain a queue or incur a charge. Its
current human-input logic also shows why changing visible history must reconcile
operational waits. These are invariants to retain even though the new storage
and runtime design differ.
[Status hydration](../src/runtime/session-scheduler.ts),
[Pending human-input state and history](../src/session/store.ts).

## Working files and project directories

Grida already routes user input among provider-native content, live references,
and staged working files. A browser image can have a model-facing image part
and a byte-exact scratch copy linked by `provider_file_index`. Ordinary files
can use a descriptor plus staged bytes. An attachment is therefore still
represented in the message, while file tools can use a separate materialization.
[Input routing](../../../editor/lib/agent-chat/input-resource-router.ts),
[Send assembly](../../../editor/lib/agent-chat/build-agent-send.ts),
[Descriptor contract](../src/protocol/context.ts).

Current scratch storage is scoped per session and shared by the filesystem,
vision, and command bindings. Its host-start sweep and session-deletion cleanup
can remove files while descriptors remain in history. Staging also currently
requires a workspace binding. The new contract makes dependency holds and
rematerialization explicit and supports attachment-only work without a project.
[Scratch lifecycle](../src/session/scratch.ts),
[Runtime bindings](../src/runtime/workspace-agent-bindings.ts),
[Current staging and recovery](../src/runtime/index.ts).

For “add text to this PNG,” the minimum path is an accepted input asset, an
independent scratch working copy, an edited result, inspection, and publication
to an accessible result location. Project directories remain untouched unless
the task chooses one as the publication destination. Restart must retain or
reconstruct the required bytes before work resumes.

Current Grida workspaces are explicitly single-root. Additional directory
attachments are read-only, in-memory capabilities. They do not establish a
multi-directory Project. The new workspace descriptor supplies named directory
bindings, a primary default, and a revision while Files supplies scoped access.
[Workspace registry](../../grida-daemon/src/workspaces.ts),
[Directory reference scopes](../src/session/directory-scopes.ts).

Codex's attachment store can select inline bytes or file references, and its
clipboard path can create a temporary image file. Its public Project model and
Desktop documentation support multiple local folders with primary-directory
behavior. The documentation assigns default cwd, Git operations, and automatic
instruction discovery to the primary folder. A sandbox still governs access.
[Attachment store](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/attachment-store/src/lib.rs),
[Clipboard image materialization](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/tui/src/clipboard_paste.rs),
[Project storage](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/state/src/model/project.rs),
[Desktop Projects](https://learn.chatgpt.com/docs/projects#use-local-projects-for-folders-and-codebases).

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

| Interaction                                     | Required result                                                                                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| User pauses active work                         | Admit no new task effects, account for existing work, preserve the continuation, and release the worker after verified suspension.        |
| User resumes                                    | Claim the same logical turn with a fresh epoch when its remaining conditions permit.                                                      |
| Question tool returns immediately               | Commit the question and return its registration receipt. Independent work can continue.                                                   |
| Question requires an answer before further work | Preserve the pending interaction and optionally suspend the worker. No open inference request is needed.                                  |
| An answer races with suspension                 | Commit the correlated answer once and make it visible to the current or resumed owner.                                                    |
| Answer arrives during explicit Pause            | Retain the answer while preserving the user's pause.                                                                                      |
| User edits an earlier message                   | Cut at the selected boundary, preserve original later history and effects, supersede affected waits, and continue from the revised input. |

The live `wait` convenience remains useful. `request_input` supplies registration
without waiting, and `try_suspend` supplies durable worker release. A resumed
driver reconstructs its continuation from history, operation outcomes, and any
additional checkpoint. It does not deserialize a language stack or keep a model
request open during human think time.

Codex's inspected source has both an awaited input tool and an immediate-return
asynchronous question tool. Its Desktop documentation separately describes
steering and queueing. This supports the two interaction styles without
establishing every detail of the Desktop client's reply routing.
[Awaited question tool](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/core/src/tools/handlers/request_user_input.rs),
[Asynchronous question tool](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/core/src/tools/handlers/request_user_input_async.rs),
[Desktop steering and queueing](https://learn.chatgpt.com/docs/prompting#steering-and-queuing).

The proposed product supports slash commands, explicit skill mentions, and
branching through its composer and control layer. Current official documentation
describes these Desktop affordances. It also documents backend history reversion
at a selected turn, which establishes a broader technical operation than a
latest-message-only edit control. The reason for any narrower Desktop UI editing
limit remains unverified.
[Desktop commands](https://learn.chatgpt.com/docs/reference/slash-commands#available-slash-commands),
[Skill selection](https://learn.chatgpt.com/docs/build-skills#how-chatgpt-and-codex-use-skills),
[History reversion](https://learn.chatgpt.com/docs/app-server#revert-thread-history).

## Subagent control study

The inspected Codex source implements addressable, reusable child conversations.
Its current V2 tools separate informational delivery, follow-up work, observation,
and interruption. The older V1 surface also exposes explicit resume and close.
Tool availability depends on the selected configuration. The official Desktop
guide independently confirms opening child threads to inspect them and asking
Codex to steer, stop, or close them.
[Desktop subagent controls](https://learn.chatgpt.com/docs/agent-configuration/subagents#managing-subagents),
[Codex tool contracts](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/core/src/tools/handlers/multi_agents_spec.rs).

| Operation        | Inspected Codex behavior                                                                                                  | Proposed contract                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Name and address | V2 accepts a task name and resolves a canonical path. A thread ID and optional nickname are separate identities.          | Keep a stable child session ID. Resolve any parent-scoped alias before control and treat readable names as metadata. |
| Send information | `send_message` uses queue-only delivery and leaves an idle child idle.                                                    | Persist informational input without automatically selecting a new turn.                                              |
| Assign follow-up | `followup_task` starts idle work or delivers to a running child at its input boundary.                                    | Reuse the child session and explicitly steer, queue, or start its assigned turn.                                     |
| Interrupt        | `interrupt_agent` interrupts the current turn while preserving the child for future work.                                 | Stop the current turn and retain history for another assignment.                                                     |
| Reopen           | V1 `resume_agent`, and V2 lazy reload paths, reconstruct a known child when its stored history is available.              | Reopen retained history under current grants. Report expired or unavailable state explicitly.                        |
| Inspect and wait | List and wait operations expose activity and mailbox updates.                                                             | Observe without causing a child to execute.                                                                          |
| Pause            | The inspected controls establish interruption and later reuse. They do not establish our durable suspended-turn contract. | Apply the already-defined Pause/Resume contract to an individual child or owned subtree.                             |

The dispatch distinction is visible in the two V2 handlers and agent control
layer. Path resolution has its own registry, and historical reload is separate
from starting work.
[Informational delivery](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/core/src/tools/handlers/multi_agents_v2/send_message.rs),
[Follow-up dispatch](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/core/src/tools/handlers/multi_agents_v2/followup_task.rs),
[Target resolution](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/core/src/agent/control/target.rs),
[Child restoration](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/core/src/agent/control/spawn.rs).

The source does not establish universal crash-durable continuation or exact
result delivery. One residency test expects an interrupted ephemeral child to
be unavailable after eviction, and completion delivery is explicitly best-effort.
Our durable pause, result delivery, and parent-consumption guarantees remain
additional engineering requirements.
[Residency tests](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/core/src/agent/control/residency_tests.rs),
[Completion delivery](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/core/src/agent/control/completion.rs).

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
the reviewer's independent Pause after reopening. [Built child lifecycle cases](../../../crates/grida-agent/tests/process/subagents.rs)

## Side conversation study

The Desktop command reference describes `/side` as a temporary conversation
that leaves the main chat working. The goal guide recommends it for a status
recap or explanation. Those are user-facing behavior claims. The shared Rust
implementation provides additional evidence about context and role awareness.
[Desktop commands](https://learn.chatgpt.com/docs/reference/slash-commands#available-slash-commands),
[Goal guidance](https://learn.chatgpt.com/docs/long-running-work#steer-a-running-goal).

The traced fork freezes a source-history position and reconstructs model context
using existing compaction and the later suffix. Opening the side conversation
does not itself run new summarization. Separate policy fragments identify it
to the model and mark inherited history as reference material. New requests
after that boundary are its active work.
[Frozen fork](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/thread-store/src/local/paginated_fork.rs),
[Model context](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/thread-store/src/local/model_context.rs),
[Side-conversation policy](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/context-fragments/src/side_conversation.rs).

The policy favors non-mutating exploration, permits an explicitly requested
mutation within current permissions, and disallows subagent interaction.
Temporary policy also restricts scheduled updates and retained worktrees.
These instructions establish the model's role. Actual grants and executors
establish its enforced authority.

The Rust client distinguishes Temporary and Attached storage, and tests cover
reopening saved side conversations. Returning to the parent is navigation and
does not merge the side conversation into parent context. These client paths
do not establish which storage choice every Desktop surface currently uses.
[Client construction](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/tui/src/app_server_session.rs),
[Side-chat lifecycle](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/tui/src/app/side.rs),
[Policy request tests](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/tui/src/app/tests/side_chat_policy_tests.rs).

The proposed components therefore treat this as derived conversation
initialization. The master selects the seed, role, grants, lifetime, owner, and
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

Codex's goal implementation is composed as an extension with lifecycle hooks,
tools, persisted thread state, accounting, and continuation prompts. It submits
ordinary next turns when its policy decides more work is needed. The public
explanation describes the same separation between a durable objective and
the execution turns that pursue it.
[Codex goal extension](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/ext/goal/src/extension.rs),
[Goal tools](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/ext/goal/src/spec.rs),
[Official goal design](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex#how-goals-are-designed-in-codex).

The relevant missing seam was cross-turn driver state. A turn checkpoint covers
continuation within that turn. An objective, its lifecycle, and its continuation
eligibility can outlive many completed turns. The proposed optional session
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

Codex restores goal state on thread resume and coordinates continuation with
goal mutations. Its accounting and empty-turn handling are useful policy
examples. Exact thresholds belong to the master, and its budget accounting does
not by itself prove a pre-dispatch monetary ceiling for every external action.
[Goal runtime](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/ext/goal/src/runtime.rs),
[Goal accounting](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/ext/goal/src/accounting.rs),
[Goal storage](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/state/src/runtime/goals.rs).

This addition creates no goal-specific neutral crate or runtime mode. It reuses
session state, ordinary turn drivers, controls, operation accounting, child
results, and wake-up delivery.

## Permission profiles and automatic review

Approval eligibility, reviewer routing, and enforced access are separate
contracts. In the inspected Codex source, the manual and automatic-review
presets select the same workspace profile while changing the reviewer. Its
official documentation also describes automatic review as a separate reviewer
for eligible approval requests. [Codex permission selection](https://github.com/openai/codex/blob/main/codex-rs/tui/src/chatwidget/permissions_menu.rs),
[Official automatic-review documentation](https://learn.chatgpt.com/docs/sandboxing/auto-review).

Grida already has a host-owned executor with immutable scope, independently
validated roots, and OS sandbox creation. Its supervised approval flow preserves
the exact request and consuming run. These provide existing execution contracts
to retain, while an automatic reviewer adds a separate decision route.
[Host executor scope](../../grida-daemon/src/shell/runner.ts),
[Native command host](../../../desktop/src/main/agent-command-host.ts),
[Approval consumption](../src/session/store.ts).

| Pressure case                                                      | Required result                                                  |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Automatic reviewer approves an action beyond mandatory host limits | Admission is denied and no broader capability is created         |
| The action or authority changes while review runs                  | Revalidate and obtain a decision covering the current action     |
| Review times out or the reviewer is unavailable                    | Preserve that failure and use the declared human/stop fallback   |
| The requested sandbox profile cannot be enforced                   | Refuse or wait for an explicitly supported route                 |
| A review decision is committed just before restart                 | Restore its action binding and consumption state before dispatch |
| An allowed network destination is used for a sensitive operation   | Product policy can still require semantic review of the action   |

The host authorization adapter handles asynchronous review through the generic
admission gate. Sessions retains correlated interactions and operation results.
Runtime rechecks current authority before dispatch. The host issues grants and
interprets review decisions. OS-specific confinement belongs in the sandbox
adapter. Product labels and reviewer policy remain in the master.

## Feature coverage recheck

The [feature catalog](../../../docs/agent/features.md) separates current behavior
from proposed guarantees. This review maps its feature families to the
[master](../../../docs/wg/ai/agent/master.md) and
[components](../../../docs/wg/ai/agent/components.md). It establishes a design
path for every committed feature. Runtime behavior and Rust ergonomics still
require implementation evidence.

| Catalog features                                                                    | Master or host decision                                                                          | Reusable contract                                                                                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Task input, slash commands, skills and instructions                                 | Resolve input affordances, preserve omitted material, choose instruction precedence and refresh. | Identified submissions, content provenance, captured context and tool definitions.                                                     |
| Projects and folders, live document editing, scratch                                | Group directories, select destinations, choose retention and publication.                        | Resolved bindings, scoped Files capability, document-owned operations, retained-input relationships and dependency holds.              |
| Models and providers, MCP tool integrations                                         | Select connections and allowed fallbacks, discover tools, handle readiness.                      | Prepared requests, provider capability validation, versioned tool inventory and admitted invocations.                                  |
| Configuration                                                                       | Define reviewed fields, defaults, supported scope, and conversational changes.                   | Host-owned inspect/update/reload operations produce validated values captured with accepted input.                                     |
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
when input is accepted. A queued edit explicitly replaces that configuration.
Execution still rechecks current grants, capability availability, and remaining
allowances. Sessions treats the configuration as opaque input and checks the
supplied revisions.

Search refinement, zoom, copying, downloads, pricing, slash syntax, and named
product modes remain in their existing master, host, or client owners. This
review calls for no additional core component or crate. Reusable personal memory
remains open, and native Windows command execution remains deferred.

### Request preparation and recovery

The complete input budget, error classification, and recovery path need explicit
contracts even when the happy path is one model request.

| Pressure case                                            | Required result                                                                                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Messages fit but tool schemas/framing exceed the budget  | Measure the complete prepared input and retain its exact/upper-bound/estimated basis.                                             |
| Rate limiting includes retry-delay advice                | Show waiting, honor the bounded policy, and allow Stop/Pause during backoff without an occupied inference permit.                 |
| Authentication, quota, or refusal prevents a request     | Give its specific outcome and recovery path. Do not treat it as an endless transient retry.                                       |
| A stream fails after one of its tools ran                | Retain that tool's actual outcome and reconcile before continuation or repetition. Fresh call IDs cannot hide a duplicate effect. |
| A model emits malformed arguments or an unavailable tool | Preserve a correlated pre-execution error for bounded correction. Infrastructure failure remains distinguishable.                 |
| Compaction finishes after input or lineage changes       | Validate its covered basis and preserve later input. Reject an incompatible candidate without replacing the live view.            |
| Compaction fails or still leaves input too large         | Retain previous context and stop after bounded recovery with a clear explanation.                                                 |

Zed counts the provider representation of a full request and classifies retry
failures separately from the wait that reports progress and handles cancellation.
Codex retains failure/partial-output evidence and validates prepared compaction
prefixes before installation. These are concrete reference mechanisms for the
corresponding contracts, while retry counts and compaction strategy remain
product decisions.
[Zed request counting](https://github.com/zed-industries/zed/blob/62682ebde9e70b8a77a95863a2b16e9d59bf65eb/crates/language_models/src/provider/open_ai.rs),
[Zed failure facts](https://github.com/zed-industries/zed/blob/62682ebde9e70b8a77a95863a2b16e9d59bf65eb/crates/language_model_core/src/language_model_core.rs),
[Zed retry wait](https://github.com/zed-industries/zed/blob/62682ebde9e70b8a77a95863a2b16e9d59bf65eb/crates/agent/src/thread.rs),
[Codex retry decisions](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/core/src/session/turn.rs),
[Codex compaction installation](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/core/src/compact_remote_v2_installation.rs).

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

The current event tests establish observer isolation, while provider tests
preserve successful mutations when a follow-up callback fails. These are
existing invariants to retain. They do not establish a user hook runner.
[Event tests](../src/runtime/events.test.ts),
[provider callback tests](../src/providers/endpoints.test.ts).

### Foreign tool host

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

### ACP client boundary

The [client protocol proposal](./rust-client-protocol.md) maps standard ACP
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
| A settings UI changes an advertised session selector             | Apply that session scope. Persistent numeric defaults require the separate validated host-config operation.                             |

These cases introduce no new core component. The host adapter owns protocol
translation, and Desktop owns rendering. They preserve the existing acceptance,
authority, interaction, recovery, and presentation obligations.

### Confinement after srt

Replacing srt changes the enforcement implementation. The host's authority,
routing, credential custody, and process supervision remain separately owned.
The native adapter confines raw executions. Outer host containment is a separate
deployment profile, retained by the current Grida host. Platform support requires
direct enforcement evidence.

The [native sandbox proposal](./rust-sandbox-proposal.md) now selects one crate
with Seatbelt on macOS and bubblewrap plus a trusted seccomp helper on Linux.
The initial raw-command profile denies networking. Native Windows raw execution
is deferred behind capability checks. Codex is the primary implementation
reference. Zed confirms the Unix mechanisms and supplies additional filesystem
identity cases, while its Windows path uses WSL.

| Pressure case                                               | Required result                                                                                                                        |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Two concurrent children have different filesystem grants    | Each execution retains its own scope, including after either grant changes.                                                            |
| A command requests networking in the initial implementation | Admission reports an unsupported profile before executing the target.                                                                  |
| A child daemonizes outside its original process group       | Cancellation reports whether the descendant terminated, remains confined, or is unresolved. Conflicting work cannot assume revocation. |
| A process exits before temporary-resource cleanup finishes  | The outcome preserves cleanup state before releasing ownership that depends on it.                                                     |
| Host proxy or trust configuration changes                   | The host routing adapter handles the change within authorized destinations. Confinement does not silently widen.                       |
| A platform cannot enforce the requested profile             | That execution remains unavailable through the existing admission contract.                                                            |

The current host already separates an immutable shell scope from the executor,
validates command roots independently, and waits for worker cleanup on
cancellation. It also documents a macOS process-group revocation limitation.
These supply concrete acceptance cases for the replacement.
[Shell executor](../../grida-daemon/src/shell/runner.ts),
[Command confinement](../../../desktop/src/main/agent-command-host.ts),
[Cancellation acknowledgment](../../../desktop/src/agent-sidecar-network.ts),
[Current host authority and limitations](../../../desktop/docs/agent-authority.md).

## Inherited choices review

The 2026-11-09 review covers the active component, master, native-host, storage,
workspace, and sandbox proposals. The TS implementation supplies evidence of
user-visible behavior and past failures. Its framework, process topology, and
defaults do not determine the rebuild. Codex `6107b9886c` and Zed `62682ebde9`
provide independent comparisons, with implementation evidence still required
for the selected native design.

| Inherited or premature choice                                                    | Revised design and reason                                                                                                                                                                     |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP plus a separate event stream from the TS daemon                             | Use ACP with stdio first and an explicit shared-service binding. Negotiate additional durable controls while keeping core contracts protocol-independent.                                     |
| TS socketless sidecar, main-owned provider broker, and compulsory outer envelope | Let the trusted native host own approved connections and launchers. Declare host hardening separately from mandatory raw-execution confinement.                                               |
| One SQLite worker and one process for the entire database as fixed architecture  | Retain SQLite as the first adapter candidate. Require per-session ownership and atomic publication, while worker/connection/process topology awaits the executable proof.                     |
| Queued work inherits whatever settings happen to exist at selection              | Capture requested model, effort, regime, approval policy, and resolved defaults at acceptance. Explicit queued edits can change them. Current authority and limits still constrain execution. |
| A fork must start from already bounded model context                             | Seed from selected retained history, then assemble model context separately. A compact side-chat seed remains a master choice.                                                                |
| Workspace hydration determines which files exist                                 | Use demand-driven file access and bounded listings. Index coverage is a discovery aid and cannot replace actual resource checks.                                                              |
| Text and tool results suffice as the semantic message vocabulary                 | Preserve readable reasoning and optional assistant phase, with opaque provider state retained separately. A final-answer phase has no settlement authority.                                   |
| A step executes a sequential tool batch after the model finishes                 | Keep step attribution while allowing complete validated calls to start during streaming and independent calls to overlap.                                                                     |
| Public segmented-effect machinery before advanced consumers exist                | Begin with complete-input tools. Streaming mutation and paid-job recovery must establish the shared stage API before promotion. Their durable-effect obligations still apply.                 |
| Bundle one bubblewrap build as a core requirement                                | Require a trusted compatible non-setuid executable and feature probes. System selection and bundled fallback are packaging choices.                                                           |

Codex preserves explicit per-input settings, semantic reasoning and phase, and
per-thread live-writer ownership. Its tool futures can be queued while response
items are still arriving. These mechanisms support the revised boundaries,
without prescribing our queue-default policy or storage implementation.
[Input settings](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/protocol/src/turn_input.rs),
[response items](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/protocol/src/models.rs),
[writer ownership](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/thread-store/src/local/live_writer.rs),
[streamed dispatch](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/core/src/session/turn.rs).

Zed preserves thinking and compaction content, distinguishes tools that accept
partial input, and performs database work through its own connection and
background-executor arrangement. Codex's system-or-bundled bubblewrap selection
and the two projects' scoped launchers support keeping deployment selection
outside the execution invariant.
[Zed content](https://github.com/zed-industries/zed/blob/62682ebde9e70b8a77a95863a2b16e9d59bf65eb/crates/language_model_core/src/request.rs),
[Zed tool execution](https://github.com/zed-industries/zed/blob/62682ebde9e70b8a77a95863a2b16e9d59bf65eb/crates/agent/src/thread.rs),
[Zed database](https://github.com/zed-industries/zed/blob/62682ebde9e70b8a77a95863a2b16e9d59bf65eb/crates/agent/src/db.rs),
[Codex launcher selection](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/linux-sandbox/src/launcher.rs).

The review keeps durable acceptance, pre-effect barriers, explicit uncertain
outcomes, scoped authority, recoverable working files, and final-account policy.
These answer the catalog's product promises and known failures. Reference
implementations with different persistence guarantees do not remove those
requirements. Current deployed TS security rules retain their existing scope.

The whole-design recheck retains the existing component and crate count. It
makes finite command execution explicit as the first adapter profile. Codex's
reusable command sessions and Zed's awaited terminal illustrate different
lifetimes, so the initial sandbox handle alone cannot promise interactive or
background process management.
[Codex command sessions](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/core/src/unified_exec/command_sessions.rs),
[Zed terminal](https://github.com/zed-industries/zed/blob/62682ebde9e70b8a77a95863a2b16e9d59bf65eb/crates/agent/src/tools/terminal_tool.rs).

Host environment projection and private state creation receive concrete
acceptance cases. These belong to the existing execution/storage adapters.
Bounded ingress and slow-consumer handling remain protocol responsibilities.
[Codex environment](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/core/src/exec_env.rs),
[Zed private validation channel](https://github.com/zed-industries/zed/blob/62682ebde9e70b8a77a95863a2b16e9d59bf65eb/crates/sandbox/src/linux_bubblewrap.rs).

## Simplification decisions

| Earlier candidate                                    | Revised decision                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Checkpoint every new decision                        | Derive simple master state from committed work, checkpoint additional state explicitly                                |
| Every tool author manually journals nested effects   | Runtime wraps ordinary invocations, while concrete advanced consumers establish any shared stage API                  |
| Master reads the journal snapshot                    | Give the master a semantic view and keep replay schemas adapter-facing                                                |
| Another state machine for interactive tools          | Reuse Runtime's typed wait operation through a narrow scoped adapter                                                  |
| A special reporting subsystem                        | Use ordinary inference when needed and a factual fallback from recorded results                                       |
| Generalized media inference                          | Adapt typed generation clients as Tools                                                                               |
| Additional surface or todo core components           | Keep domain tools and presentation projections in product composition                                                 |
| A separate command-line agent loop                   | One native host composes the master for service, unattended, and Desktop clients                                      |
| A queue-specific settings framework                  | Keep settings in input/driver state and capture their selected revisions                                              |
| Runtime-owned hook and reviewer workflows            | The host supplies dispatch and authorization policy through the async admission gate and ordinary recorded operations |
| Implicit parent funding for every child              | The master selects funding relationships, and admission enforces the supplied allocations                             |
| Fixed tool envelopes and file-spooling policy        | Tool adapters own domain results, the host owns retained output, and the master selects model presentation            |
| A pricing or preview core service                    | Use normalized usage evidence and artifact references, with host-owned interpretation                                 |
| A mandatory core summarizer                          | Keep structured settlement mandatory and consumer-authored summary policy in the master                               |
| Partial-input admission in the initial tool contract | Use complete validated arguments. Keep staged mutation behind its separately reviewed consumer contract.              |
| A background compaction subsystem in the first slice | Use foreground candidate generation and atomic installation. Add speculative preparation only for measured benefit.   |
| Shared-service networking before core controls work  | Prove controls over stdio first. Activate the listener and independent-client tests with their actual consumer.       |
| One crate for every logical component                | Reserve shared Core, Runtime, and Sessions boundaries, keeping lower components as modules                            |

## Packaging reassessment

The independent-use cases establish small public contracts, while the known
growth paths establish three credible package boundaries. Shared Core serves
direct model/tool callers, Runtime serves live turns, and Sessions coordinates
durable work through native or external drivers. The lower Messages, History,
Context, Tools, and Turn contracts can stay as modules within the shared Core.

Reserve those names, ownership rules, dependency budgets, consumers, and
activation points now. Create each package when its first substantive
implementation arrives. The full durable vertical slice can activate all three
from the start. A smaller embedded prototype can use one physical crate while
honoring the same seams.

SQLite stays in a selected adapter crate because it introduces a concrete native
dependency. Provider implementations can share a package while their transport
and release requirements align. The branded master remains a separate consumer.

This approach preserves the known destination without requiring a package for
every pure component. It also prevents the shared Core from accumulating
dependencies on its future Runtime and Sessions consumers. The proposal records
the [reserved crate map](./rust-core-proposal.md#reserved-crate-map),
[dependency budgets](./rust-core-proposal.md#dependency-budgets-and-graphs), and
[activation rules](./rust-core-proposal.md#activating-later-boundaries).

## Lock recommendation

The responsibilities and failure semantics survive these walkthroughs. The
concrete guarantees recommended for commitment are listed in the proposal's
[lock table](./rust-core-proposal.md#what-to-lock-after-the-pressure-test).
The first implementation still needs to demonstrate Rust ergonomics, actual
crash recovery, resource bounds, and the performance of the supported paths.
