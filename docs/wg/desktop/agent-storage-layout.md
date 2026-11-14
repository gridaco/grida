---
title: Agent storage layout
description: Which Desktop process keeps which files — the native agent host's chat state and the retained sidecar's registries and credentials.
keywords:
  [desktop, native agent host, services-sidecar, storage, sqlite, userData]
format: md
tags:
  - internal
  - wg
  - desktop
---

# Agent storage layout

This page is the **desktop-specific binding** of the
[agent storage and recovery contract](../ai/agent/components.md#storage-and-recovery). The RFC owns
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

## Chat-state ownership

The chat-state directory is claimed once. Its first use writes a small
ownership record that binds the directory to the profile's path facts — the
agent home, provider home and media root it was created beside. A later launch
opens the directory only when that record matches; a directory that holds
anything else, or a record for other paths, is refused rather than adopted.
A directory of another name is never consulted, so data that is not the
current store is neither read nor changed.

## Backups

Backups are the user's job. A backup helper for any SQLite store MUST use the
engine's backup API, not a raw file copy — a copy during a WAL checkpoint
risks tearing.

## See also

- [Process model](./process-model.md) — what each process owns.
- [Agent security / secrets discipline](./agent-security.md#secrets-discipline)
  — credential discipline.
