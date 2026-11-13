# agent-kit-store-sqlite

SQLite implementation of durable session acceptance, claims, controls, and the
shared execution journal. It accepts an explicit database path in an existing
application-owned directory.

The adapter uses WAL with synchronous FULL commits. Session metadata, immutable
submissions, request receipts, and individual turns have separate records. A
turn commit updates that turn and any terminal session disposition in the same
transaction. Earlier turns are retained independently.

## Schema and opening

The database has one schema, declared in `src/schema.rs`, and carries this
store's SQLite application identity and schema version 1. Opening an empty
database installs the schema in one transaction. A database with this store's
identity and version opens as it is. Every other file is refused unchanged
with `store_schema_unsupported`: a database another program wrote, one without
this store's identity whatever its version, and a non-empty file at version 0.
There are no in-place upgrades.

The database records the owner projections it was created with: whether it
keeps a catalog and whether it links submissions to source turns. Reopening it
with a different set is refused with `store_profile_mismatch`, so a session is
never admitted without the catalog placement or link its owner relies on.

Deleting a session inserts its retirement and removes the session row. Its
turns, parts, messages, submissions, links, receipts, history views and
context replacements are removed with it by foreign-key cascade, as are links
from other sessions to its turns.

A turn is stored as a small head row, one row per operation, history record and
commit receipt, and each conversation message once per session under its digest.
A model call's request and outcome refer to those messages rather than repeating
them, so a turn's stored size grows with what it adds rather than with the
square of its length. A commit encodes and writes only the parts that differ
from the store's previous write of the turn. The store keeps that previous
state in memory: a write inside a transaction is staged and becomes the
remembered state only after the transaction commits, so a rolled-back or
abandoned write is never read back. The open store is the database's only
writer, so the remembered state always equals the stored rows; edit the file
only while no store has it open. Reading assembles the same state, so
recovery, identity and evidence checks are unchanged. A store keeps at most 16
unsettled turns, within the largest assembled size of one turn, and releases
the least recently used first.

A lease's control reads, session inspection and claim receipts read a turn's
head and its stored history length rather than assembling the turn, so
watching controls or inspecting an idle session costs the same however long
its turns grew. Inspecting one turn assembles it and refuses malformed
stored data.

One opened database holds an exclusive operating-system lock for its lifetime.
Store clones and bound journal handles share that owner. Another process or store
must wait until ownership is released. Different sessions execute independently
while short database transactions serialize. Database I/O runs on blocking
workers. The host needs a Tokio runtime to poll asynchronous operations.

An optional bounded driver-state envelope has its own revision and is carried
into each claimed turn. State changes share the transaction with an exact
active-turn control or a turn journal commit. The committed revision appears
in the receipt. The adapter preserves the driver's bytes without interpreting
its policy.
Conditional submission keeps ordinary input identity while fencing admission
at the observed session revision. A new claim can reserve driver state in the
same transaction that claims the input and issues ownership.
Derived driver controls bind an opaque caller intent before computing the new
state. An exact retry returns the original receipt even after later changes.
`control_turn_with_driver_state` derives the opaque change from the locked
snapshot and records the ordinary turn directive under its original request
identity.

`claim_from_operation` atomically creates a session, accepts its first input,
reserves its opaque driver state, and claims its first turn. It requires an
owned source turn with the captured open control revision and the exact
running tool invocation and attempt. The destination session must be absent.
The caller supplies stable destination identities across competing source
operations. Each source operation can record only one destination.
An exact repeat observes the committed destination turn even after the
source owner has released its lease. Repeating a claim never issues another
lease. Recovery of released work remains explicit.

`control_operation_pair` applies a source turn control in one transaction with
an exact claimed destination control, a check that the claimed destination
turn has settled, or a check that the supplied deterministic session identity
is absent and unretired. The absence check proves only that identity is
available. The caller chooses the same destination identity for competing
claims. The store preserves opaque driver state and issues no lease.
Exact retries return the original pair receipt even after later controls.
`operation_pair_receipt` reads a committed pair by its original source control.
`control_receipt` reads the ordinary control receipt, and `claim_receipt`
observes the turn of an exactly repeated claim, both without issuing a lease. An independently
recorded control cannot be joined into a pair later.

A paused, suspended turn resumes with its pause lifted in the same
transaction that issues the new lease. `resume_with` reclaims an exact paused turn with one opaque driver state
change or one related destination control or observation. Both changes
commit before the source lease is returned. Reopening the related turn
requires a committed paused suspension and release of its previous owner.
The related turn still needs a separate claim. `resume_receipt` observes the
source turn and retained related control by the original claim request.
Repeating a committed claim never issues a new lease.

The optional owner-defined catalog projects immutable session configuration
into a scope fingerprint once, at creation. A configuration the owner does not
recognize is in no scope. A scoped page returns at most 32 entries
from an owner-selected bucket in reverse creation order. Its anchor must
already belong to that scope. An entry has an optional bounded display label
and its own revision. Updating it leaves execution and history unchanged.
An update or deletion at a stale entry revision is a conflict to reload and
retry.

An optional owner projection links an immutable submission to an exact retained
source turn in the acceptance transaction. A linked source turn must be
retained, or the submission is refused. Reads are bounded and require the
source session and turn, and a linked input's current disposition determines
whether it has a turn to inspect. Deleting either side removes the link.

A live lease blocks recovery of its turn. Dropping it makes interrupted execution
eligible for an explicit recovery request. Reopening the database preserves the
turn's operations and outcomes, and recovery advances its writer epoch. Inspection
reports state without starting or resuming execution. Explicit recovery can
also reacquire a released cancelled suspension to record its final disposition.
Cancellation remains active during that recovery. The adapter supplies no
clock-based takeover.

`active_turn_page` lists at most 32 active session and turn identities in
ascending session order without reading snapshots or acquiring leases. Its
cursor is the last returned session identity, even if that session is later
removed. Pages reflect each read rather than a frozen snapshot; a caller must
recheck an identity before acting and restart a pass to observe concurrent
insertions behind its cursor. Malformed stored identities fail explicitly.
The partial active-session index makes each page an indexed traversal.

On Unix, the parent directory must exclude group/other access. Database and lock
files use owner-only permissions, and existing symlinks or hard-linked files are
rejected. Other platforms rely on the host's application-directory access policy.
The lock file is retained so its identity remains stable across opens.

`SqliteStore::open_in_memory` keeps the same session, lease, and journal
contracts in one memory-only database. Its state lasts only as long as a
store clone or bound journal remains alive.

A session admits at most 256 queued inputs and 32 MiB of encoded pending payloads.
Each input uses the core's bounded versioned envelope. A single turn's stored rows
are limited to 64 MiB, and the state a reader assembles from them to 512 MiB.
An over-limit write is rejected before its transaction commits.
These bounds are storage admission limits. Retention and cleanup policy belong to
the host.

Acceptance positions remain immutable while queued work has its own ordering.
Replacement and withdrawal preserve original payloads and dispositions.
Their controls, queue updates, and receipts commit together. A submission's
disposition is one recorded state, and the schema ties its queue order, turn
and replacement to that state. An accepted submission is its own retry
receipt: the same identity and content returns the original acceptance, and
the same identity with other content is `request_identity_reused`.

`SqliteStore::history` reads the active view's materialized seed and committed
local records in append order. An exclusive turn cut selects the view that
owned that turn and reads its history through the preceding turn. Projection
reads the retained snapshots without modifying them or acquiring a lease. It returns an
explicit limit error if the result exceeds 4,096 records or 8 MiB encoded, or
the scan exceeds 4,096 turns or 128 MiB of stored snapshots.

`retained_history_with` also exposes seed provenance, view identity and committed
journal positions. A seeded session can capture the committed view of a running
source and retain the materialized prefix independently. Revising history requires
an idle session and an empty queue. The new view and replacement input commit in
one transaction, preserving admission pause, previous views and turn snapshots.
Creation and revision use a committed history basis and return their original
receipts for exact retries.

The history basis covers the view, seed and every scanned snapshot, including
later evidence recorded for an older turn. Session inspection keeps reporting
the latest retained execution. The selected history basis identifies the latest
turn in that particular view when one exists.

An unprompted claim uses the same lease and retained journal as a submitted
turn. The initial checkpoint and exact model-context basis are committed with
the claim. An owned successful turn can install one context replacement by
matching its retained outcome and covered history. Model reads select the
latest eligible replacement and newer local turns. Transcript reads and
queued submissions retain their existing records.

A bounded context-prefix read can return an older complete-turn prefix when
the ordinary context projection would exceed its record or byte limit. It
identifies the last projected turn and retains the exact basis of the full
source for claim and installation. All later turns remain outside the
projection. The full snapshot scan keeps its existing bounds and refuses
malformed snapshots even in the unprojected suffix.

Caller-owned pure projections can inspect a committed turn or transform each
turn's history within those bounded reads. They acquire no execution lease.
A turn view reports its history position, and a history contribution or
answer-with-contribution applies only while that position is unchanged.
External answers and history contributions are rejected after cancellation,
while the turn owner can still record already-observed outcomes.

## Delete an idle session

`delete_idle` removes one saved session conditionally and retires its identity.
A `DeleteSession` names the session, its owner-defined catalog scope, a stable
request identity, and the observed session and catalog revisions. In one
immediate transaction the store checks both revisions, requires no active turn,
no live owner and an empty queue, and runs the owner's pure checks over the
session's configuration and driver state and over each retained turn within
the history scan bounds. It then records the identity in `session_retirements` and removes the session
with every row it owns. A retired identity cannot be created again
(`session_identity_retired`), and an absence check for a deterministic
identity treats it as taken.

An exact retry returns the original `SessionDeleted` receipt without
rechecking retired state; `deletion_receipt` reads that receipt. A changed
revision or a request reused with different content is a conflict, and a busy
or queued session is refused with `session_deletion_requires_idle` or
`session_deletion_requires_empty_queue`.

`delete_idle_with_dependents` also retires a reviewed family. The caller first
reads `retirement_dependencies` for an owner-defined dependent scope, which
returns at most 128 sessions and a basis over their membership and revisions,
and passes that scope and basis in `DeleteDependents`. The deletion fails with
`session_deletion_dependencies_changed` if the basis moved; otherwise every
dependent must be idle and pass the owner's checks, and all are retired in the
same transaction.

Removal of owner storage outside the database is two-phase.
`delete_idle_with_cleanup` and `delete_idle_with_dependents` retain an
optional 32-byte cleanup identity with the retirement. After a restart,
`pending_retirement_cleanup` pages through retirements still awaiting cleanup,
16 at a time, and `finish_retirement_cleanup` clears only that exact identity
once the owner has verified removal. Retrying the exact deletion request
returns the cleanup identity while it is still pending.

## Read history backward

`history_replay_window` reads the current view of a session from newest to
oldest in bounded windows without acquiring a lease. The caller supplies a
pure projection from each turn to its displayed records and a measure that
returns a record's displayed size, or zero for a record it does not show. A
window holds up to 128 displayed records and 256 KiB, scans up to 32 turns or
the history byte limit per call, and refuses a single record over 1 MiB. It
returns the records in history order with the turn that committed each one,
recorded facts about each contributing turn (status, start time, settle time
once settled,
reported context tokens, whether the window holds the turn's newest record,
and the account of a settled turn that added no records), and an opaque
`ReplayCursor` for the next older window, or none at the start of the view.
Inherited seed records come last and belong to no turn of this session.

The cursor is bound to the view and to the turn and position at which it cut.
If history is revised, or the cut turn's journal position changes, the next
read fails with `history_replay_window_changed`; restart from the latest
window. `open_history_replay` instead captures the current view once and
yields its seed, settled turns in pages, and the projected active turn last.
