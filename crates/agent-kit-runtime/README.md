# agent-kit-runtime

Live agent turns over the public `agent-kit-core` contracts. The caller supplies
providers, captured tools, an authority validator, a tool-admission gate, limits,
and an ephemeral or persistent `TurnLease`.

## Ownership

`Runtime::open` consumes the lease and returns one `Turn` controller plus a
read-only `TurnObserver`. The controller supplies cloneable `TurnOperations` for
concurrent inference, tool work, and questions. Dropping an observer detaches it.
Dropping the controller closes admission and cancels the local execution scopes.
In-flight operations keep the lease until their local execution exits. Verified
settlement or suspension releases ownership and leaves old handles inactive.

The master chooses requests, tools, retry policy, and completion. The host owns
authorization and the meaning of its gate. Executors own domain behavior and
supported recovery. Each operation uses a child cancellation scope and bounded
execution capacity. Finished inference releases its permit before tool or
question work can keep a turn waiting.

## Durable operations

Operation keys identify logical work within a turn. The runtime derives stable
journal and attempt identities from them. Repeating the same captured input
returns its recorded result or attaches to the local execution. Changed input
under an existing key fails. A recorded attempt whose owner disappeared remains
uncertain until explicitly accounted for or recovered.

Preparation commits before dispatch. Provider and tool controls carry the
admitted attempt identity, and recovery retains the attempt being reconciled.
The authority validator checks the exact
captured action after the product gate. The host can activate an existing
pending grant during review while preserving the recorded principal and grant
identity. Current controls are checked before execution. Denied work receives a
definite nonexecution result. Inference grants and each tool's grants are supplied
separately. Missing tool authority never falls back to provider authority.
Completed results remain readable independently of current execution grants.

A prepared request can carry an input token ceiling. Its measurement shares
the inference owner's permit, authority, and absolute deadline. The runtime
rechecks authority before beginning a generation attempt. A provider can
receive the prepared input for counting even when the generation is refused.
A failed, estimated, or excessive count records a rejection before generation
and carries no generation usage. A completed outcome replays from the journal.
For a prepared tool, a compatible current selection can retain its original
grant references. Dispatch still requires the host to authorize that exact
action under current authority. Removing the selection or changing its
principal or scope prevents pending execution.

Each local owner captures its admission control revision. Pause and Cancel
interrupt older owners even when a control reader sees only the latest snapshot
after Resume. An attempt commit checks that same admission on retry. A known
control interruption is retained in the inference result. A Pause observed
before a tool attempt returns `InvokeOutcome::Paused` and leaves the exact
operation prepared for reconsideration. The operations view has been refreshed
from the journal, so it may already show a later Resume. A committed Stop still
records definite nonexecution for the unstarted target. Dispatched tool work
can still have an uncertain result.

Journal acknowledgment loss triggers readback using the same change identity.
If the committed disposition cannot be established, admission freezes. A
successor must reconcile that state before new dependent work.

`record_interruption` records an orphan attempt's uncertainty without calling a
provider or executor. For an interrupted inference, it reconstructs observed
call declarations from the original call IDs retained on admitted child tools.
`recover_tool` invokes the executor's explicit recovery contract with current
authority, bounded capacity, cancellation, and a deadline.
`reconcile_tool` accepts an explicit current inventory for a turn-bound executor.
The master can use `cancel_prepared` and `withdraw_input` to account for unstarted work and open
interactions before settling a stopped turn. Those operations perform no
executor work.

## Steps and history

A step consumes one prepared inference and its captured inventory. Complete tool
calls can start while later response items stream. Every admitted child retains
its inference origin and original provider call ID before effects. A later
inference failure preserves those outcomes.

`StepOutcome.history` is a candidate projection of durable inference and tool
results. The master installs it together with its next checkpoint using
`publish_continuation`. Replaying a completed step reconstructs the candidate
without requiring a live provider or the old tool inventory. Deferred tool work
returns its wait identity. A step with deferred or paused tool work retains
sibling results and leaves transcript installation to continuation.
`recorded_step_history` projects completed exchanges from the journal without
starting provider or tool work. It keeps the original call identity and omits
unpaired declarations. A master can publish this history when stopping a step
whose outcomes were recorded before its transcript was installed.

Suspension and settlement validate the master's exact control and history basis.
A concurrent change rejects that decision. Terminal commits never silently
rebase onto newer input or controls.

## Verification

Run from the repository root.

```sh
cargo test -p agent-kit-runtime --locked
cargo clippy -p agent-kit-runtime --all-targets --locked -- -D warnings
cargo fmt -p agent-kit-runtime --check
```

Contract tests exercise simple-master publication, key replay and conflict,
concurrent duplicate calls, streaming tool dispatch, lost acknowledgments,
unknown commits, orphan recovery, questions, controller/observer lifetime,
authority activation, and terminal-control races. Persistent-store and product
integration are exercised by their consuming crates.
