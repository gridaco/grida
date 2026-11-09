# agent-kit-store-sqlite

Conditional resume keeps pause changes and replacement ownership in one
transaction. Read-only claim receipt lookup recognizes repeated requests
without issuing a lease. Turn snapshots expose their history position for
conditional contributions.

SQLite implementation of durable session acceptance, claims, controls, and the
shared execution journal. It accepts an explicit database path in an existing
application-owned directory.

The adapter uses WAL with synchronous FULL commits. Session metadata, immutable
submissions, request receipts, and individual turn snapshots have separate
records. A turn commit updates its snapshot and any terminal session disposition
in the same transaction. Earlier turns are retained independently.

One opened database holds an exclusive operating-system lock for its lifetime.
Store clones and bound journal handles share that owner. Another process or store
must wait until ownership is released. Different sessions execute independently
while short database transactions serialize. Database I/O runs on blocking
workers. The host needs a Tokio runtime to poll asynchronous operations.

A live lease blocks recovery of its turn. Dropping it makes interrupted execution
eligible for an explicit recovery request. Reopening the database preserves the
turn's operations and outcomes, and recovery advances its writer epoch. Inspection
reports state without starting or resuming execution. Explicit recovery can
also reacquire a released cancelled suspension to record its final disposition.
Cancellation remains active during that recovery. The adapter supplies no
clock-based takeover.

On Unix, the parent directory must exclude group/other access. Database and lock
files use owner-only permissions, and existing symlinks or hard-linked files are
rejected. Other platforms rely on the host's application-directory access policy.
The lock file is retained so its identity remains stable across opens.

A session admits at most 256 queued inputs and 32 MiB of encoded pending payloads.
Each input uses the core's bounded versioned envelope. A single turn snapshot is
limited to 64 MiB. An over-limit write is rejected before its transaction commits.
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

Caller-owned pure projections can inspect a committed turn or transform each
turn's history within those bounded reads. They acquire no execution lease.
External answers and history contributions are rejected after cancellation,
while the turn owner can still record already-observed outcomes.
