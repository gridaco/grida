# agent-kit-store-sqlite

Conditional resume keeps pause changes and replacement ownership in one
transaction. Read-only claim receipt lookup recognizes repeated requests
without issuing a lease. Turn snapshots expose their history position for
conditional contributions.

SQLite implementation of durable session acceptance, claims, controls, and the
shared execution journal. It accepts an explicit database path in an existing
application-owned directory.

The adapter uses WAL with synchronous FULL commits. Session metadata, immutable
submissions, request receipts, and individual turns have separate records. A
turn commit updates that turn and any terminal session disposition in the same
transaction. Earlier turns are retained independently.

A turn is stored as a small head row, one row per operation, history record and
commit receipt, and each conversation message once per session under its digest.
A model call's request and outcome refer to those messages rather than repeating
them, so a turn's stored size grows with what it adds rather than with the
square of its length. A commit encodes and writes only the parts that differ
from this process's previous write of the turn. That previous state is trusted
only while the turn's stored generation token and head still match it; a newly
opened store, a rolled-back write or any other change reads the stored rows.
Reading assembles the same state, so recovery, identity and evidence checks are
unchanged. A turn written before this layout is read as it was and converts on
its next commit.

One opened database holds an exclusive operating-system lock for its lifetime.
Store clones and bound journal handles share that owner. Another process or store
must wait until ownership is released. Different sessions execute independently
while short database transactions serialize. Database I/O runs on blocking
workers. The host needs a Tokio runtime to poll asynchronous operations.

An optional bounded driver-state envelope has its own revision and is carried
into each claimed turn. State changes share the transaction with an exact
active-turn control or a turn journal commit. The committed revision appears
in the receipt. The adapter preserves the driver's bytes without interpreting
its policy. Earlier databases upgrade with empty driver state.
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
`control_receipt` reads the ordinary control receipt. An independently
recorded control cannot be joined into a pair later.

`resume_with` reclaims an exact paused turn with one opaque driver state
change or one related destination control or observation. Both changes
commit before the source lease is returned. Reopening the related turn
requires a committed paused suspension and release of its previous owner.
The related turn still needs a separate claim. `resume_receipt` observes the
source turn and retained related control by the original claim request.
Repeating a committed claim never issues a new lease.

The optional owner-defined catalog projects immutable session configuration
into a scope fingerprint. It indexes the scope at creation and upgrades earlier
records without reading their turns. A scoped page returns at most 32 entries
from an owner-selected bucket in reverse creation order. Its anchor must
already belong to that scope. An entry has an optional bounded display label
and its own revision. Updating it leaves execution and history unchanged.

An optional owner projection links an immutable submission to an exact retained
source turn in the acceptance transaction. Historical submissions are projected
in resumable batches when the owner opens the store. A known source session
with an unresolved historical turn marks its coverage incomplete. When even
the historical source session is unknown, every page discloses incomplete
coverage without exposing the unclassified submission. Reads are
bounded and require the source session and turn, and a linked input's current
disposition determines whether it has a turn to inspect. Deleting either side
removes the link.

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
The partial active-session index makes each page an indexed traversal. Its
first creation on an existing database scans sessions once, without changing
the database version or requiring a new reader format.

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
Their controls, queue updates, and receipts commit together. Reopening upgrades
the earlier schema transactionally while retaining completed and queued inputs.

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
External answers and history contributions are rejected after cancellation,
while the turn owner can still record already-observed outcomes.
