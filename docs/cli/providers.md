---
title: Grida CLI provider keys
description: Configure BYOK API keys, locate credentials.toml, understand key precedence, and remove stored credentials.
keywords: [grida, cli, byok, api keys, toml, credentials]
sidebar_label: Providers
sidebar_position: 4
tags: [cli]
format: md
---

# Grida CLI provider keys

Use your own OpenRouter, Vercel AI Gateway, fal, or ElevenLabs account for media
generation. Configure only the providers you need. BYOK requires no Grida login;
GG uses a separate [Grida session](./auth.md) and organization.

## Configure a provider

```sh
grida providers configure openrouter
grida providers configure fal
grida providers list
```

Enter your key at the hidden prompt. Every selected key passes static validation.
Configuration additionally checks OpenRouter, Vercel, and fal once before saving.
A rejected or unavailable check leaves existing credentials unchanged.
ElevenLabs has no suitable permission-neutral check and saves with verification
marked `not_supported`.

An accepted check proves only that the metadata read succeeded at that moment.
It does not guarantee model access, credit, or generation success. Listing and
generation do not repeat that check.

For automation, `providers configure` accepts `--key-stdin --no-input`. Supply
the key on stdin; literal key arguments are never accepted. Configuration still
performs supported verification before saving.

## Where keys are stored

Desktop and CLI share **plaintext** provider keys on macOS and Linux:

```text
~/.grida/providers/credentials.toml
```

An absolute `GRIDA_HOME` changes that to
`$GRIDA_HOME/providers/credentials.toml`. Keep the `providers` directory private
(`0700`) and the file private (`0600`). Anyone who can read the file can use its
keys. Do not commit it or share it in logs.

For manual editing, stop Desktop and other Grida processes using the same home,
then follow the canonical
[TOML file format](https://github.com/gridaco/grida/blob/main/packages/grida-auth/PROVIDER-CREDENTIALS-V1.md).
Preserve version and migration fields. `grida providers --help` prints the
location and format link without opening the credential store.

## Override a stored key

Precedence is stdin (`--key-stdin`), then the provider environment variable,
then the shared file. Explicit stdin/environment keys bypass storage and are
not saved. Blank or invalid explicit keys fail instead of falling back; unset
the variable to use the stored key.

| Provider     | Environment variable |
| ------------ | -------------------- |
| `openrouter` | `OPENROUTER_API_KEY` |
| `vercel`     | `AI_GATEWAY_API_KEY` |
| `fal`        | `FAL_KEY`            |
| `elevenlabs` | `ELEVENLABS_API_KEY` |

Windows preview users can use environment or stdin keys; shared file storage
is not supported there yet. Provider keys and Grida sessions are separate.

## Remove a key

```sh
grida providers remove fal
```

This removes the shared stored key for CLI and Desktop. It does not revoke the
key at fal, clear an environment override, or sign out of Grida.

## Resolve storage errors

`invalid_store` means invalid TOML or required structure. `unsupported_version`
requires a compatible Grida version; do not edit the version field to bypass it.
`store_busy` means another process holds the store. `storage_failed` can mean
filesystem, sandbox, ownership, or permission trouble; it does not imply bad
TOML. Follow the message without exposing file contents in a bug report.
