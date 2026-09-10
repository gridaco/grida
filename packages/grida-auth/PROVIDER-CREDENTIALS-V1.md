# Provider credentials, file protocol v1

> **GRIDA-SEC-014** — private native API-key custody. This protocol is independent
> of a programming language, application, model catalog, and account session.
> The reference implementation is the experimental `@grida/auth/providers` export.

## Authority and location

The caller supplies one explicit, absolute Grida home. The canonical credential
file is `<home>/providers/credentials.toml`; there is no discovery, environment
fallback, project config, profile selection, keyring, or alternate file format.
Readers and writers must use this same path and the lock protocol below. Native
account OAuth files and GG grants are separate authorities. Possession of an API
key establishes no account identity or provider eligibility.

The home path must already be lexically normalized, must not be the filesystem
root, and must contain no invalid Unicode, ASCII control character, or DEL.
Reject filesystem aliases: each existing path component must be a real directory
whose real path is that exact component. Never silently resolve a symbolic link
to a different credential authority. Missing directories may be created with
mode 0700. Existing ancestors may be readable, including a 0755 Grida home, but
must be owned by the effective user or root and not writable by others. A
root-owned sticky temporary ancestor is allowed. The final `providers` directory
must belong to the effective user with mode exactly 0700.

Credential, temporary, and lock files must be regular files, owned by the effective
user, mode exactly 0600, with exactly one hard link. Open with no-follow and
nonblocking flags; compare opened device/inode with the named entry before use.
Reject special files, symbolic/hard links, unsafe owners, and loose permissions.
Never repair an existing path with chmod/chown. Reject additional macOS ACL allow
entries, including inherited grants, on files and all ancestors. On Linux, access
ACL rights are constrained by the mode's group mask; owner-only final modes deny
other principals effective access. The process and its effective user are trusted.

The reference implementation supports local macOS/Linux filesystems and Node 24+
on the main thread. Windows and worker-thread use fail before storage I/O. A port
must establish equivalent ACL and lock semantics on its actual platform before
claiming support. Network filesystems, hostile same-user processes, filesystem
backups, and snapshots are outside this contract.

## UTF-8 and TOML schema

The file is at most 1,048,576 bytes, valid UTF-8 without a BOM. Malformed byte
sequences must be rejected; replacement-character decoding is forbidden. Parse
TOML 1.1, then independently validate the following exact logical schema. No
unknown field or extra record type is allowed. TOML comments and table order
have no authority and need not survive a mutation. The parser must bound nesting;
the reference implementation permits at most four levels.

```toml
# Contains secrets. Do not commit, log, or share this file.
version = 1

[migration]
state = "unstarted"
removed = []

[providers.example]
api_key = "synthetic-example-key"
```

| Field                    | Required value                                                           |
| ------------------------ | ------------------------------------------------------------------------ |
| `version`                | TOML integer with value 1; a float or string is invalid.                 |
| `migration`              | Table with exactly `state` and `removed`.                                |
| `migration.state`        | String `unstarted`, `pending`, or `complete`.                            |
| `migration.removed`      | Array of distinct valid provider IDs; empty unless state is `unstarted`. |
| `providers`              | Table mapping provider IDs to tables with exactly one `api_key` field.   |
| `providers.<id>.api_key` | Valid API-key string as defined below.                                   |

An empty store contains an explicit empty `[providers]` table. Each provider ID
is 1–64 ASCII characters matching `^[a-z][a-z0-9_-]{0,63}$`; IDs are opaque,
case-sensitive, and independent of any model catalog. There are at most 128 live
providers plus removed IDs combined. A removed ID cannot also have a live entry.

Keys contain 1–16,384 UTF-8 bytes of valid Unicode scalar values. U+0000–U+001F
and U+007F–U+009F are forbidden, including CR, LF, and NUL. Leading/trailing
spaces, quotes, backslashes, and non-ASCII scalar values are preserved exactly;
the store never trims or transforms a key. Credentials have no lengths,
fingerprints, prefixes, verification status, OAuth fields, timestamps, or account
metadata in the observation surface.

Reference writers prepend the secret warning above, sort provider IDs and removed
IDs lexically, and emit ordinary TOML strings. Conforming readers accept equivalent
TOML escaping, literal strings, comments, and table ordering. A maintained TOML
parser owns syntax; schema validation owns authority. The synthetic compatibility
fixtures live in [fixtures/providers-v1](fixtures/providers-v1/README.md).

## Manual configuration

On macOS or Linux, you can create or edit `<home>/providers/credentials.toml`
offline. Close Desktop and stop other Grida clients or commands using that home
before editing: ordinary editors do not acquire the credential lock. Automation
that can run concurrently must use the public store API or implement the lock
and atomic-publication protocol below.

For a new file, use the schema example above, replace the example provider ID and
key, and leave `migration.state = "unstarted"` and `removed = []`. Create the
`providers` directory with mode 0700 and the file with mode 0600, both owned by
your user. Existing safe ancestor directories can remain 0755. Use regular files
and directories without symlinks, hard links, or additional macOS ACL grants.
Save as UTF-8 without a BOM, with correct TOML escaping. Keep keys on one line.

For an existing file, preserve its version, migration metadata, deletion
tombstones, and other provider entries. Change only the intended key. Use
`grida providers remove <provider>` for deletion and `grida providers configure
<provider>` to restore an ID listed in `migration.removed`; these commands retain
the migration guarantees. If migration is `pending`, let updated Desktop finish
its cleanup before editing. Do not change the state to bypass it.

Keep the editor's saves private and avoid credential backup or swap files. Save a
complete document before restarting clients. Never delete the whole credential
file or `profile.lock.sqlite` to reset or repair the store. Windows clients must
use their explicit environment or stdin key input instead of this file adapter.

## Read and mutation rules

Every operation acquires exclusive authority, discards valid unpublished orphan
temporaries, and reads the latest complete canonical file. A missing file alone
means an empty `unstarted` store. A corrupt, unsupported, unreadable, or unsafe file
is never an empty store and must not be overwritten as recovery. A pending
migration blocks ordinary read/list/set/remove operations.

Reading a named provider returns exactly its key or absence. This is a secret
output for trusted SDK injection. Listing returns only sorted provider IDs with
keys present. Set replaces the specified provider and preserves other records;
it clears that provider's pre-import tombstone. Remove deletes the specified
provider and, while migration is `unstarted`, retains a tombstone even when no
live value existed. Remove must persist an empty document instead of unlinking
the whole file: the migration fence and tombstones are part of its authority.

For each write, validate the entire candidate and byte limit before publication.
Create `credentials.toml.<UUIDv4>.tmp` exclusively in the same private directory,
validate its owner/mode/link/ACL protection, write the complete UTF-8 payload,
fsync the file, close it, atomically rename over the validated canonical path,
then fsync the parent directory. Do not claim success before the final sync.
A failure after rename may have committed the complete replacement. Never restore
older credentials to compensate for this uncertain result.

Under exclusive authority, cleanup may remove only names matching
`credentials.toml.<lowercase-UUIDv4>.tmp`, after the same private-file validation,
then fsync the directory. An unsafe matching orphan fails closed. Unrelated names
remain untouched. Never adopt an orphan as canonical state; a crash before rename
leaves the old canonical document authoritative.

## Cross-process exclusion

The lock is `<home>/providers/profile.lock.sqlite`, a stable, zero-byte, private
regular file. Do not unlink or replace it, add a schema, store data, commit a
transaction, or enable WAL. Serialize every open/close of this same lock inode
within a process, including separately loaded library copies: closing a second
descriptor can release POSIX process-scoped locks.

After private directory/file validation, validate an existing rollback journal
with the same private file policy. A disappearing journal during another holder's
normal cleanup is harmless. Reject `-wal` or `-shm` sidecars. Open SQLite with
extension loading disabled, set `busy_timeout = 0`, and acquire with
`BEGIN IMMEDIATE`. Retry only `SQLITE_BUSY` until a 30-second monotonic acquisition
deadline, with waits no longer than 25 ms. All other errors fail closed. Acquisition
failure must not run caller work. There is no time-based stealing or PID guessing.

Hold the transaction through the complete operation, then `ROLLBACK` and close
the database. Credential-file publication is outside SQLite's data transaction;
rollback never undoes a completed credential write. SQLite's OS lock releases on
process termination; SQLite owns recovery of a validated interrupted rollback
journal. The acquisition deadline never cancels an already-running operation.

`CredentialLock` uses this same protocol in a caller-supplied private directory
for a different native credential writer. It supplies only exclusion: the caller
still owns protection, decoding, publication, and domain errors for its own file.
There is no nested-lock ordering service. The migration order below is mandatory.

## One-time source import and retirement

There is exactly one source-retirement transition per canonical home, without a
source registry or arbitrary migration IDs. The source owner decodes its own old
format and supplies only `{provider, apiKey}` entries. Its retirement action must
remove only API-key records, preserve unrelated OAuth/other records, publish
durably, and be idempotent. Updated source writers must share one exclusive lock.
Mixed execution with older applications that ignore this lock or continue using
the old API-key file is unsupported.

Acquire the source writer's exclusive lock **before** calling migrate; retain it
through completion. Migrate then acquires the canonical provider lock. The source
read/retire callbacks execute under both locks, must not reenter either lock, and
must not call ordinary provider operations. Ordinary provider operations acquire
only their own lock and never open the source. This establishes a single order:
source writer → canonical provider authority.

1. If `complete`, return complete without invoking either callback. A later
   malformed unrelated source record cannot break ordinary canonical reads.
2. If `unstarted`, invoke source read once, validate at most 128 distinct entries,
   merge only IDs absent from both canonical live values and tombstones, and
   durably publish the candidate with state `pending` and no tombstones.
3. If `pending`, do not read or import the source again. Invoke only retirement.
   The canonical document is already authoritative and blocks ordinary operations
   until cleanup succeeds. Publication failure or uncertain durability must never
   trigger source retirement in the failed attempt.
4. Once retirement resolves durably, publish state `complete`. Return only
   `{state: "complete"}`. Failures do not revert the import or restore old keys.

A crash before pending publication leaves the original canonical and source
unchanged. A crash after pending publication retries retirement without reimport.
A crash during or after retirement also retries idempotent retirement; the source
owner must preserve unrelated records in each attempt. A crash after complete
publication performs no more source work. Canonical replacement wins over a stale
source value; deletion before first import is protected by its tombstone; deletion
after completion is protected by the durable complete state.

Deleting the whole file, restoring an old backup, or manually removing protocol
metadata is not a supported removal or migration operation and can erase these
fences. Plaintext storage and atomic replacement do not provide secure erasure
of historical disk blocks or snapshots.

## Failure and observation contract

Provider operations expose fixed failures: `invalid_input`, `invalid_store`,
`unsupported_version`, `storage_failed`, `store_busy`, `migration_failed`,
`migration_pending`, and `unsupported_platform`. Unknown integer versions are
`unsupported_version`; invalid syntax, UTF-8, floats, missing fields, duplicate
fields, and bounds violations are `invalid_store`. Input validation uses
`invalid_input`. Failed source callbacks use `migration_failed`. No failure
contains credential contents, parser excerpts, filesystem paths, host exception
text, environment values, or nested causes.

Presence and migration outcomes are safe metadata. The explicit read result and
source import entries are secrets; hosts must keep them outside logs, model
context, renderers, status output, and exceptions. Public `CredentialLock` failures
classify only acquisition/release: a callback's own exception remains the caller's
domain error, so its outer host must apply its own secret-safe error policy.
