---
title: CLI credential custody
description: How established CLIs persist account access, and Grida's storage and refresh contract.
keywords: [grida, cli, oauth, credentials, keyring, authentication]
sidebar_label: Credential custody
sidebar_position: 4
tags: [internal, wg, cli, architecture]
format: md
---

# CLI credential custody

> **Status: accepted storage policy; CLI commands have not shipped.** The
> [native package contract](https://github.com/gridaco/grida/blob/main/packages/grida-auth/README.md)
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

## Grida experience

`grida auth login` uses the OS credential store by default. A separately selected
file mode supports machines without a usable credential service. The choice
prioritizes OS protection for ordinary login while keeping headless use
explicit. The CLI mode-selection syntax remains open.

An unavailable or locked store produces a storage error. It never silently
creates a plaintext copy or reports the user as signed out. File mode remains
plaintext, protected by user-only OS permissions; it is not described as
encrypted. A host without an implemented protection adapter fails closed.

`grida auth status` shows the account, selected backend, and local session state
without showing tokens or contacting the issuer. `grida auth logout` clears
this session locally and reports whether its remote revocation succeeded.
Application-wide and account-wide revocation remain distinct actions.

Neither mode requires Desktop or a daemon. OS storage protects credentials at
rest; it does not establish isolation from an authorized process running as
the same OS user, including the user's chosen agent harness.

## Persistence contract

Credentials belong to a trusted CLI profile: credential home, issuer, public
client ID, and API origin. Persisted identity must match the verified account.
Repository configuration cannot redirect credentials or select another store.
Desktop cookies and provider keys remain separate.

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

## Security ownership

**GRIDA-SEC-010** owns registered native OAuth account authority, including
consent, callback, token use, durable custody, and session-local revocation.
The registry records the implemented controls and their platform limits.

**GRIDA-SEC-011** owns the separate local Supabase OAuth provisioning boundary:
disposable fixture authority, environment isolation, administrative registration,
and scoped cleanup. It does not certify hosted deployment. Hosted provisioning
will need its own enforced contract when introduced.
The [security registry](https://github.com/gridaco/grida/blob/main/SECURITY.md)
defines both boundaries and their bound files. Existing Desktop and GG
boundaries remain in force.
