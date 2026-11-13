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

| Case                                                             | Product situation and required outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Existing evidence and limit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 — reopen a waiting chat                                       | Reopening a chat shows its queue and pending decisions. Viewing it starts no additional work or chargeable request. [Sessions](https://grida.co/docs/wg/ai/agent/components#sessions) owns observational access.                                                                                                                                                                                                                                                                                                                                                                      | [Native process tests](../tests/process/compaction.rs) keep the exact queue across pause and restart until Stop is released, and a [pending question](../tests/process/questions.rs) survives restart. [Master tests](../../grida-agent-master/tests/durable.rs) show that observing a settled answer starts no work, and the [controller](../../../editor/lib/agent-chat/native-chat-controller.test.ts) offers queue recovery only as an explicit action. Billing and the rendered reopened chat are not checked.                                                                                                                                                                                                                                                                                                                                                          |
| R2 — reconnect after a completed action                          | Reconnecting or retrying preserves the previous result once, and the person can continue without losing it or repeating the action. [Runtime journal](https://grida.co/docs/wg/ai/agent/components#the-execution-journal) owns result identity.                                                                                                                                                                                                                                                                                                                                       | [Master tests](../../grida-agent-master/tests/durable.rs) reuse committed tool results in the next model request, [summary process tests](../tests/process/summaries.rs) reopen settled turns without provider work, and the [external peer test](../tests/external_acp.rs) reconciles an unconfirmed dispatch without replay. They do not count real external actions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R3 — switch documents during an edit                             | An accepted call retains its addressed endpoint and document arguments, or reports that endpoint unavailable. [Workspace contract](https://grida.co/docs/wg/ai/agent/workspace#authority-and-changes-during-work) owns the target.                                                                                                                                                                                                                                                                                                                                                    | [Native Main tests](../../../desktop/src/main/native-gateway-svg-text.test.ts) exercise exact selected-text ownership. The rendered nested-deck case verifies stale selection refusal after a slide switch, and explicit save to the addressed bundle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| R4 — return to uploaded-image work                               | After interruption or restart, the agent restores the exact input promised by its retention policy or explains what must be supplied again before continuing. [Scratch retention](https://grida.co/docs/wg/ai/agent/scratch#s2--declared-retention-and-recoverability) owns availability.                                                                                                                                                                                                                                                                                             | [Native PNG process tests](../tests/process/images.rs) verify retained bytes and working copies after reopen. A missing original produces guidance before provider dispatch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| R5 — retry saving a generated result                             | If generation succeeds and saving fails, retain the result or recovery record. Retrying the save uses the completed generation. [Artifact evidence](https://grida.co/docs/wg/ai/agent/components#integration-capabilities-and-bounds) owns this distinction.                                                                                                                                                                                                                                                                                                                          | [Desktop media fixtures](../../../desktop/src/sidecar/media-startup.test.ts) retry a retained MP3 copy with one provider request and preserve the live result when the library cannot publish a receipt. [Native crop fixture](../../../desktop/src/main/native-agent-images.test.ts) covers retained chat output.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| R6 — start a fresh workspace chat                                | A new project starts with no registered checks. Default-folder discovery and first chat creation work before any chat or check has been saved; protected private contents remain inaccessible. Introducing optional checks must not make first launch depend on earlier state.                                                                                                                                                                                                                                                                                                        | [Desktop composition evidence](../../../desktop/src/main/native-desktop-agent.test.ts), [native service evidence](../../../desktop/src/main/retained-service-sandbox.test.ts).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| R7 — open Desktop while provider networking is slow              | Local services start without waiting for provider proxy setup. Authorized provider work waits for readiness, remains cancellable and rechecks its grant before dispatch; network failure grants no fallback access. Native API requests retain an application client identity even when the provider adapter supplies none; they never borrow browser cookies.                                                                                                                                                                                                                        | [Private channel regression tests](../../../desktop/src/main/agent-network-host.test.ts) exercise held and failed initialization, cancellation, shutdown and revoked grants.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| R8 — start a development chat without a ready default connection | Starting Desktop preserves its native executables across build cleanup. If default Gateway access is unavailable, the user can inspect and explicitly select a configured connection before opening chat; old default history is not loaded under that choice. A pane reconnect waits for any outstanding selection before restoring its connection and opening history.                                                                                                                                                                                                              | [Development resources](../../../desktop/src/main/native-desktop-profile.test.ts), [Main recovery](../../../desktop/src/main/native-chat-ipc.test.ts), [configured worker](../../../desktop/src/main/native-desktop-agent.test.ts) and [client controller](../../../editor/lib/agent-chat/native-chat-controller.test.ts) cover the boundary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R13 — read finished work in a long chat                          | Each finished turn collapses its commentary and actions beneath a timed header, with the final answer visible outside it. Expanding shows the recorded work in order; reopening and earlier pages keep each turn's grouping. Neither repeats work nor requests inference. Stopped and failed turns stay distinct, and pending questions or approvals stay actionable. Execution details remain separately named. [Finished turns](https://grida.co/docs/wg/ai/agent/experience#read-each-finished-turn) owns the outcome; the master owns answer identification and activity wording. | [Store tests](../../agent-kit-store-sqlite/tests/store.rs) record turn timing, attribution and upgraded turns without timing; [master tests](../../grida-agent-master/src/activity.rs) classify answers, stopped turns and tools; [native process tests](../tests/process/history.rs) replay attributed activity and [stream it live](../tests/process/live.rs); the [Main](../../../desktop/src/main/native-agent-process.test.ts), [controller](../../../editor/lib/agent-chat/native-chat-controller.test.ts) and [grouping](../../../editor/lib/agent-chat/turn-activity.test.ts) cases cover projection and disclosure. The [manual case](../../../test/desktop-agent-chat-turn-activity.md) was exercised in the isolated Electron app with a loopback model: successive turns, disclosure, stop, rejection, restart and an earlier page, with no added model request. |
| R14 — pause, then resume or move on                              | Pause takes effect at once and keeps the turn; Resume continues the same turn. Sending instead ends the paused turn as stopped and runs the message next. A response cut off by the interruption stays in the transcript but not in model context: after Resume the model reads a note asking it to continue from where it stopped, and after Stop the next turn reads an interruption note. Completed tool work is kept. [Interrupted responses](https://grida.co/docs/wg/ai/agent/master#interrupted-responses-in-model-context) owns the rule.                                     | [Native process tests](../tests/process/lifecycle.rs) cover resume with the note in place of the cut-off reply, a stopped reply's note in the next turn, and resume after restart with steering; the [controller](../../../editor/lib/agent-chat/native-chat-controller.test.ts) orders stop, enqueue, place and resume for a message sent while paused. The [manual case](../../../test/desktop-agent-chat-composer-intents.md) was exercised in Electron with a loopback model.                                                                                                                                                                                                                                                                                                                                                                                            |
| R15 — plan with a folder that Act may change                     | A Plan message can read the project but is offered no file write, edit or command, even when the folder's launch permission lets Act change it. A queued Plan message keeps that limit after a queue edit or restart, and a write requested anyway is refused. [Plan before acting](https://grida.co/docs/wg/ai/agent/experience#plan-before-acting) owns the outcome.                                                                                                                                                                                                                | The [native process test](../tests/process/operating_regime.rs) launches with a write-allowed primary folder and checks the offered tools for Plan, Act, and an edited Plan input after restart. Command absence is covered by the helper-gated [approval test](../tests/process/approvals.rs). The rendered Desktop composer was not exercised.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Newly discovered caveats extend this section only when they establish a distinct
failure or uncovered contract. Each entry retains its cause, owner, evidence,
and required observation. Related detail belongs beside the owning contract.

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

| Additional case                               | Product situation and required outcome                                                                                                                                     | Existing evidence and limit                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R16 — switch chats during work                | After switching from chat A to B, A's delayed output stays in A. B retains its own activity and controls.                                                                  | No native case is linked yet; the composed UI needs verification.                                                                                                                                                                                                                                                                                 |
| R17 — a submitted message cannot start        | A rejected message remains available to queue or retry. An existing question stays answerable, and repairing the displayed history preserves valid ongoing work.           | No native case is linked yet; retaining a rejected attachment remains unverified.                                                                                                                                                                                                                                                                 |
| R18 — change models after attaching images    | Same-named images keep their identities. At submission, the selected model and available tools can use the intended image, or the person receives an actionable rejection. | The [native chat controller cases](../../../editor/lib/agent-chat/native-chat-controller.test.ts) preserve the selected PNG during model selection and refuse the switch until the attachment is sent or removed. They check same-named replacements and exact submission bytes. Installed model use and display need further evidence.           |
| R9 — a completed change cannot be announced   | A completed change remains effective even if its notification fails. Retrying recognizes that the change already happened.                                                 | The [catalogue test](../../../packages/grida-ai/src/model-catalog.test.ts) preserves applied state after a listener throws. Broader action recovery is an unresolved requirement.                                                                                                                                                                 |
| R10 — repeated service failures               | Repeated unavailable or oversized responses leave the application usable, and cancellation releases the work it owns.                                                      | The [response-body test](../../../packages/grida-ai/src/model-catalog.test.ts) checks cleanup for selected rejected responses. It does not establish long-running UI responsiveness or every exit path.                                                                                                                                           |
| R11 — replace an image used by an open canvas | The canvas and its previews refresh while preserving unsaved edits. If edits delay refresh, it becomes visible after save or reload.                                       | [Reload tests](../../../editor/scaffolds/desktop/workbench/workspace-file-reload-guard.test.ts) cover races. The [visual case](../../../test/desktop-workbench-canvas-resource-refresh.md) records the composed outcome for editor-owned changes. A file written directly by the agent under the Default preset has no recorded run of this case. |
| R12 — an attached folder changes destination  | Permission to a folder cannot silently expand to protected content when its underlying destination changes.                                                                | [Native ACP fixture](../tests/process/approvals/confinement.rs) retargets an alias during review. On arm64 macOS and Linux, the scoped write succeeds and direct or aliased protected reads and writes are refused. The [permission fixture](../tests/permissions.rs) checks replacement of the approved root.                                    |

Cases R9 and R10 retain commit-pinned evidence because the original files have
since been reorganized.
The rows add concrete observations to existing identity, ownership, input,
resource, and publication contracts. They do not create more product features.

For R17 and R18, the [native image case](../../../desktop/src/main/native-agent-images.test.ts)
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
[Controller regressions](../../../editor/lib/agent-chat/native-chat-controller.test.ts),
[real-editor selection tests](../../../editor/kits/composer/composer-command-selection.browser.ts),
and the [Desktop interaction case](../../../test/desktop-agent-chat-composer-intents.md)
cover these obligations.

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

`surface_open` acknowledges an auxiliary presentation request. The renderer can
observe it later, and the model's continuation does not depend on successful
rendering. This fits a recorded tool result plus an optional client projection.
It needs no surface-specific execution framework. [Desktop editor surfaces](../../../desktop/src/main/native-editor-surfaces.ts).

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

Grida routes user input among provider-native content, live references, and
staged working files. Native Desktop chat sends one PNG as image input or one
other file per message, and the host retains the bytes for file tools. An
attachment is therefore still represented in the message, while file tools can
use a separate materialization.
[Retained file process tests](../tests/process/retained_files.rs).

Scratch storage is shared by the filesystem, vision, and command bindings.
Cleanup must not remove files while descriptors that depend on them remain in
history. The contract makes dependency holds and rematerialization explicit and
supports attachment-only work without a project.

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

Both interaction styles are needed: an awaited question blocks the dependent
work, while an immediate-return question lets independent work continue.
Steering and queueing are separate input routes.

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

Goal state is restored on resume and coordinated with goal mutations. Exact
thresholds belong to the master, and budget accounting alone does not prove a
pre-dispatch monetary ceiling for every external action.

This addition creates no goal-specific neutral crate or runtime mode. It reuses
session state, ordinary turn drivers, controls, operation accounting, child
results, and wake-up delivery.

## Permission profiles and automatic review

Approval eligibility, reviewer routing, and enforced access are separate
contracts. Manual and automatic review can select the same workspace profile
while changing only the reviewer, so automatic review is a separate decision
route for eligible approval requests.

The native host keeps an executor with immutable scope, independently validated
roots, and OS sandbox creation, and its supervised approval flow preserves the
exact request and consuming run. An automatic reviewer adds a separate decision
route. [Command confinement](./rust-sandbox.md),
[Approval confinement tests](../tests/process/approvals/confinement.rs).

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
from intended guarantees and records each feature's availability and evidence.
This review maps its feature families to the
[master](../../../docs/wg/ai/agent/master.md) and
[components](../../../docs/wg/ai/agent/components.md).

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

Counting the provider representation of the complete request, and classifying
a retryable failure separately from the wait that reports progress and handles
cancellation, are the mechanisms these contracts need. Retry counts and
compaction strategy remain product decisions.

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
| A settings UI changes an advertised session selector             | Apply that session scope. Persistent numeric defaults require the separate validated host-config operation.                             |

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
profile denies networking. Native Windows raw execution is deferred behind
capability checks.

| Pressure case                                              | Required result                                                                                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Two concurrent children have different filesystem grants   | Each execution retains its own scope, including after either grant changes.                                                            |
| A command requests networking                              | Admission reports an unsupported profile before executing the target.                                                                  |
| A child daemonizes outside its original process group      | Cancellation reports whether the descendant terminated, remains confined, or is unresolved. Conflicting work cannot assume revocation. |
| A process exits before temporary-resource cleanup finishes | The outcome preserves cleanup state before releasing ownership that depends on it.                                                     |
| Host proxy or trust configuration changes                  | The host routing adapter handles the change within authorized destinations. Confinement does not silently widen.                       |
| A platform cannot enforce the requested profile            | That execution remains unavailable through the existing admission contract.                                                            |

The native adapter separates an immutable command scope from the executor,
validates command roots independently, and waits for worker cleanup on
cancellation. macOS process-group revocation has a documented limitation.
[Command tests](../tests/commands.rs),
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
| A fork must start from already bounded model context                             | Seed from selected retained history, then assemble model context separately. A compact side-chat seed remains a master choice.                                                                |
| Workspace hydration determines which files exist                                 | Use demand-driven file access and bounded listings. Index coverage is a discovery aid and cannot replace actual resource checks.                                                              |
| Text and tool results suffice as the semantic message vocabulary                 | Preserve readable reasoning and optional assistant phase, with opaque provider state retained separately. A final-answer phase has no settlement authority.                                   |
| A step executes a sequential tool batch after the model finishes                 | Keep step attribution while allowing complete validated calls to start during streaming and independent calls to overlap.                                                                     |
| Public segmented-effect machinery before advanced consumers exist                | Begin with complete-input tools. Streaming mutation and paid-job recovery must establish the shared stage API before promotion. Their durable-effect obligations still apply.                 |
| Bundle one bubblewrap build as a core requirement                                | Require a trusted compatible non-setuid executable and feature probes. System selection and bundled fallback are packaging choices.                                                           |

The design keeps durable acceptance, pre-effect barriers, explicit uncertain
outcomes, scoped authority, recoverable working files, and final-account policy.
These answer the catalog's product promises and known failures. A persistence
design with weaker guarantees does not remove those requirements.

Command execution is finite: interactive and long-lived command sessions have
different lifetimes, so the sandbox handle alone does not promise interactive
or background process management. Host environment projection and private
state creation belong to the execution and storage adapters. Bounded ingress
and slow-consumer handling remain protocol responsibilities.

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
