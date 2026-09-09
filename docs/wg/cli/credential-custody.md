---
title: CLI credential custody
description: Grida account session custody and the accepted shared TOML storage design for local provider API keys.
keywords: [grida, cli, oauth, credentials, keyring, authentication, byok, toml]
sidebar_label: Credential custody
sidebar_position: 4
tags: [internal, wg, cli, architecture]
format: md
---

# CLI credential custody

> **Status: accepted design; the replacement CLI has not shipped.** Native
> account custody and shared BYOK storage in TOML are implemented.
> Environment/stdin keys remain explicit per-invocation overrides.
> The [native package contract](https://github.com/gridaco/grida/blob/main/packages/grida-auth/README.md)
> records implemented platforms and verification limits. See the [v1 spec](./v1.md).

Sign in once, close the terminal, and keep using Grida. Two commands running
together must not invalidate each other's session. Signing out must survive a
late response from another process. These are separate requirements from where
credentials are stored.

## What established CLIs do

Reviewed on 2026-09-06 using official documentation and public source: GitHub
CLI `v2.100.0`, Codex `rust-v0.153.4`, and Azure CLI/MSAL documentation and their
`dev` branches. These are source observations, not runtime security audits.

| CLI        | Persistent storage                                                                                                                                         | Refresh and logout                                                                                                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub CLI | OS credential store first; automatically falls back to plaintext when unavailable or failing. `--insecure-storage` explicitly chooses plaintext.           | `auth refresh` reruns authorization to adjust scopes; the inspected CLI persists an access token, not a rotating refresh-token pair. `auth logout` removes local authentication without server revocation.    |
| Codex      | CLI auth defaults to a plaintext file. `keyring` requires OS storage; `auto` permits file fallback. Source also supports process-only `ephemeral` storage. | Managed ChatGPT auth refreshes and saves replacement tokens. CLI logout attempts remote revocation, then removes local credentials even if revocation fails. API-key logout does not revoke the Platform key. |
| Azure CLI  | Microsoft documents an encrypted MSAL file cache on Windows and plaintext on Linux/macOS. This describes that cache, not every broker-backed login.        | MSAL Extensions coordinates cache modifications with a file lock and reloads persisted state. This alone does not establish serialization of the complete network refresh.                                    |

Sources: GitHub CLI [login](https://cli.github.com/manual/gh_auth_login),
[refresh implementation](https://github.com/cli/cli/blob/v2.100.0/pkg/cmd/auth/refresh/refresh.go#L185),
[authorization result](https://github.com/cli/cli/blob/v2.100.0/internal/authflow/flow.go#L87),
and [logout](https://cli.github.com/manual/gh_auth_logout);
Codex [storage modes](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/config/src/types.rs#L97),
[storage implementation](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/login/src/auth/storage.rs#L179),
and [revocation](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/login/src/auth/revoke.rs#L1);
Azure [MSAL cache documentation](https://learn.microsoft.com/en-us/cli/azure/msal-based-azure-cli?view=azure-cli-latest)
and [cache coordination](https://github.com/AzureAD/microsoft-authentication-extensions-for-python/blob/dev/msal_extensions/token_cache.py).

There is no single industry default. File storage is a defensible portability
choice; OS storage is a defensible protection default. Neither supplies the
entire session lifecycle.

Codex illustrates the concurrency distinction: its inspected refresh path uses
an in-process semaphore and rereads credentials before refreshing. Its official
CI guidance requires one machine or serialized job stream per credential copy,
with refreshed credentials preserved between runs. We should not infer
cross-process safety from a refresh method or a keyring backend.
[Refresh source](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/login/src/auth/manager.rs#L2592),
[CI guidance](https://learn.chatgpt.com/docs/auth/ci-cd-auth).

## Grida account experience

`grida auth login` uses the OS credential store by default. A separately selected
file mode supports machines without a usable credential service. The choice
prioritizes OS protection for ordinary login while keeping headless use
explicit: `grida auth login --storage file` chooses file mode for a new profile;
`grida auth storage migrate <keyring|file>` changes an existing profile.

An unavailable or locked store produces a storage error. It never silently
creates a plaintext copy or reports the user as signed out. File mode remains
plaintext, protected by user-only OS permissions; it is not described as
encrypted. A host without an implemented protection adapter fails closed.

`grida auth status` shows the account and local session state;
`grida auth storage show` reports the selected backend. Neither exposes tokens
or contacts the issuer. `grida auth logout` clears
this session locally and reports whether its remote revocation succeeded.
Application-wide and account-wide revocation remain distinct actions.

Neither mode requires Desktop or a daemon. OS storage protects credentials at
rest; it does not establish isolation from an authorized process running as
the same OS user, including the user's chosen agent harness.

## Grida account persistence contract

Credentials belong to a trusted CLI profile: credential home, issuer, public
client ID, and API origin. Persisted identity must match the verified account.
Repository configuration cannot redirect credentials or select another store.
These are Grida account profiles. Desktop browser cookies and provider
credentials remain separate authorities.

The selected backend is stable for that profile. A read failure never causes
an older file or keyring entry to become authoritative. Backend changes need
an explicit migration that handles residual copies and incomplete cleanup.

One coordinator per profile serializes **reread → refresh → durable save**
across processes. Every credential mutation participates, including identity
verification, login commits, logout, and cleanup; locking individual storage
reads and writes is insufficient. Login captures the durable revision before
browser interaction and checks it when committing, without holding a long
lock during consent. Logout leaves a durable invalidation marker so an earlier
login cannot restore the session afterward.

File mode uses atomic replacement and private permissions. Keyring mode still
needs process coordination and protected metadata. Accepted refresh rotation
is saved before a later identity request can fail. A remote token rotation and
a local write cannot form one atomic transaction: a crash between them may
still require login. Recovery must report that outcome honestly.

## Provider credentials

**Implemented in the development preview:** Desktop and CLI share
`providers/credentials.toml` for BYOK API keys under the user's Grida home
(`~/.grida` by default, or the explicit `GRIDA_HOME`). Plaintext
with user-only permissions is the default. Both clients use the same credential
owner; neither requires the other to run. A language rewrite must preserve this
contract without requiring the previous runtime or a credential daemon.

TOML provides readable sections, comments, and explicit types. The filename
and header identify sensitive content. TOML is still plaintext: its syntax
provides no additional confidentiality over JSON or INI.

The [versioned storage protocol](https://github.com/gridaco/grida/blob/main/packages/grida-auth/PROVIDER-CREDENTIALS-V1.md)
owns the exact schema, locking, migration rules and manual configuration instructions.
Provider help prints the default and overridden file locations without opening
storage. Manual editors must stop other clients using the same home, retain
private permissions, and preserve version and migration metadata. A minimal record looks like:

```toml
# Grida provider credentials.
# Contains secrets. Do not commit or share.
version = 1

[migration]
state = "unstarted"
removed = []

[providers.fal]
api_key = "..."

[providers.elevenlabs]
api_key = "..."
```

Configure a connection once, then use it from either client:

```sh
grida providers configure fal
grida providers list
grida providers remove fal
```

`configure` uses hidden terminal input. Automation supplies `--key-stdin`;
there is no literal key argument. `list` reports presence and effective source,
never key contents or verified access. Stored credentials currently require
macOS/Linux and Node 24+ on the main thread. Windows stored BYOK is unsupported;
explicit CLI environment/stdin keys remain available.

Precedence is `--key-stdin`, the selected provider's environment variable, then
the shared file. A blank or malformed explicit key fails; unset the environment
variable to use storage. Overrides never persist or open the selected stored key.

### Key validation

Every selected CLI key, whether loaded from TOML, environment or stdin, passes
cheap static validation. Obvious template values are rejected. Provider-specific
rules require official evidence; Grida's input size/header-safety limits are not
claims about a provider's key length. The
[shared provider policy](https://github.com/gridaco/grida/blob/main/packages/grida-ai/README.md)
owns the exact rules, upstream references and authenticated check endpoints.

`providers configure` checks a newly entered OpenRouter, Vercel or fal key once
before saving, including when input comes from `--key-stdin`. A rejected,
permission-denied, timed-out or inconclusive check does not replace the old key.
ElevenLabs has no suitable permission-neutral check; its key is saved with static
validation only. Output distinguishes `verification.status: accepted` from
`not_supported`. Neither promises model entitlement, credits or future access.

File edits, invocation overrides, listing, availability and generation never
trigger registration checks. Verification is not persisted or cached as authority.
A future custom base URL requires its own credential and endpoint policy; protocol
compatibility alone must never select first-party key formats or probe destinations.
Custom base URL configuration remains deferred.

### Protection and lifecycle

- Use one canonical provider file per Grida home, separate from project
  configuration and Grida account OAuth custody. Provider keys require no
  Grida login. Explicit environment/stdin inputs override stored keys for that
  invocation without reading or modifying the provider file.
- Create private files and directories before writing secrets: owner-only
  permissions on supported POSIX hosts; Windows requires an equivalent ACL
  implementation before support. Validate ownership and unsafe filesystem aliases; publish complete updates
  atomically and coordinate all mutations across processes.
- Accept keys through masked input or stdin. Ordinary status, errors, logs and
  receipts disclose no secret values; status identifies the source and
  plaintext storage mode. Repository configuration cannot redirect custody.
- Removing a stored provider connection affects both clients. It does not
  revoke the provider's API key or recall requests already sent. Grida account
  logout leaves provider connections intact.
- When stored credentials are selected, a malformed, unsupported or unreadable
  store produces an explicit error;
  it never silently selects a stale credential copy. Migration must retire
  the old BYOK read/write path and handle interrupted cleanup. Permanent
  Desktop/CLI copies and bidirectional synchronization are outside this design.

File permissions reduce accidental exposure and access by other users. They
do not encrypt backups or isolate secrets from programs with the user's file
access. This is a user-level credential store. Grida remains responsible for
its own input, persistence, output and credential-use behavior.

### Portability and alternatives

The durable contract must specify the file's location and version, provider
identifiers, encoding, parsing and update rules, process coordination, and
migration/recovery behavior. Shared conformance examples must make these rules
independent of a programming language. A common interface in one language is
not sufficient; matching TOML alone does not establish safe concurrent writes.

Optional OS keyring storage is the second choice, deferred behind the same
provider contract. It improves protection from ordinary file disclosure but
adds platform integration, unlock and headless availability requirements.
Selecting keyring must not silently fall back to plaintext. A custom vault,
external helper protocol, and persistent broker are not required for this scope.

Plaintext BYOK persistence has direct precedents: Codex's
[API-key login](https://github.com/openai/codex/blob/main/codex-rs/login/src/auth/manager.rs)
uses its configured backend, whose [default is file storage](https://learn.chatgpt.com/docs/config-file/config-sample);
OpenCode documents provider API keys in a local
[credential file](https://opencode.ai/docs/cli/#auth).
These observations support the portability tradeoff; they do not define
Grida's format or protection requirements.

The updated Desktop imports legacy API keys on first provider access. Existing
shared keys and explicit removals win; only API-key records are retired from the
old file, preserving ChatGPT OAuth. An interrupted retirement leaves migration
pending and blocks stored-key operations until updated Desktop retries cleanup.
Environment/stdin overrides remain usable. After completion the old file is
never a BYOK source again. Do not run older clients that still write the old
provider store, delete the whole TOML file, or edit its migration metadata to
remove a connection; use the command or Desktop connection settings.

Account OAuth retains its keyring default. This does not export ChatGPT
subscription credentials or persist GG grants. Provider OAuth refresh/sharing remains a separate future lifecycle
contract; BYOK file access alone cannot coordinate rotating tokens.

## Security ownership

**GRIDA-SEC-010** owns registered native OAuth account authority, including
consent, callback, token use, durable custody, and session-local revocation.
The registry records the implemented controls and their platform limits.

**GRIDA-SEC-014** owns shared native BYOK custody and one-time legacy retirement.
The CLI input/egress boundary remains **GRIDA-SEC-013**.

**GRIDA-SEC-011** owns the separate local Supabase OAuth provisioning boundary:
disposable fixture authority, environment isolation, administrative registration,
and scoped cleanup. It does not certify hosted deployment. Hosted provisioning
will need its own enforced contract when introduced.
The [security registry](https://github.com/gridaco/grida/blob/main/SECURITY.md)
defines both boundaries and their bound files. Existing Desktop and GG
boundaries remain in force.
