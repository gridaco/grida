---
title: Agent storage layout
description: Which Desktop process keeps which files — the native agent host's chat state, the retained sidecar's registries and credentials, and the archive of the earlier chat store.
keywords: [desktop, native agent host, agent-sidecar, storage, sqlite, userData]
format: md
tags:
  - internal
  - wg
  - desktop
---

# Agent storage layout

This page is the **desktop-specific binding** of the
[agent RFC's persistency contract](../ai/agent/persistency.md). The RFC owns
the abstract session model; this page records only which Desktop process
keeps which files, and why they stay separate.

## Owners

| Owner                   | Location                                                              | Holds                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Native agent host       | A private chat-state directory under Desktop's `userData`             | Per-workspace and per-document runtime state: the SQLite chat store, host configuration, retained attachments and documents. |
| Retained media sidecar  | The canonical Grida agent home                                        | `recent.json`, `workspaces.json`, daemon-owned OAuth records (`auth.json`), and media output under its host-supplied root.   |
| Shared provider custody | One private provider credential file per Grida home (`GRIDA-SEC-014`) | BYOK API keys shared by native applications.                                                                                 |
| Electron main           | `preferences.json` under Desktop's `userData`                         | Small, non-secret Desktop lifecycle preferences such as versioned onboarding completion.                                     |
| Electron main           | Main's ChatGPT subscription host (`GRIDA-SEC-008`)                    | ChatGPT subscription credentials, separate from every file above.                                                            |

Gateway grants are memory-only and never written to disk (`GRIDA-SEC-006`).

## Separation rules

- **Chat state is the native host's alone.** The sidecar never opens a chat
  store, and native command profiles deny the chat-state directory, the
  sidecar's state, and the shared provider credential root to model commands.
- **Credentials are not user data.** Credential files are owner-only and
  written atomically; chat stores hold user content and are protected by
  their owner's process boundary instead.
- **Preferences are not agent data.** `preferences.json` never contains
  account or provider credentials and is outside every agent owner above.

## The earlier chat store

Desktop builds before native chat kept chats in a `sessions.db` beside the
sidecar's files. On the first native launch, Desktop seals that store,
preserves it read-only in a private archive, and records a checkpoint before
native chat is admitted. The archive is never reopened as a live store; the
File menu can reveal it after Main re-verifies it.

## Backups

Backups are the user's job. A backup helper for any SQLite store MUST use the
engine's backup API, not a raw file copy — a copy during a WAL checkpoint
risks tearing.

## See also

- [Agent system RFC / Persistency](../ai/agent/persistency.md) — the abstract
  storage contract.
- [Process model](./process-model.md) — what each process owns.
- [Agent security / secrets discipline](./agent-security.md#secrets-discipline)
  — credential discipline.
