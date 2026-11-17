---
title: Grida CLI provider keys
description: Save and remove provider API keys, including Grida Gateway keys, and see which credential source the Grida CLI uses.
keywords: [grida, cli, byok, api keys, grida gateway, credentials]
sidebar_label: Providers
sidebar_position: 4
tags: [cli]
format: md
---

# Grida CLI provider keys

Use `grida ai providers` to manage keys for OpenRouter, Vercel AI Gateway, fal,
ElevenLabs, Tripo, and standalone Grida Gateway. For the Gateway API key, use
provider `gg`. Native `grida ai` execution with `--provider gg` uses your
[Grida session](./auth.md) and selected organization.

## Configure a provider

```sh
grida ai providers configure openrouter
grida ai providers configure fal
grida ai providers configure gg
grida ai providers list
```

Enter your key at the hidden prompt. Every selected key passes static validation.
Configuration also checks OpenRouter, Vercel AI Gateway, fal, and Tripo once
before saving.
A rejected or unavailable check leaves existing credentials unchanged.
ElevenLabs and Grida Gateway use static validation only and save with verification
marked `not_supported`. Grida Gateway keys begin with `sk-gg-v1-`.

An accepted check proves only that the metadata read succeeded at that moment.
It does not guarantee model access, credit, or generation success. Listing and
generation do not repeat that check.

For automation, `ai providers configure` accepts `--key-stdin --no-input`. Supply
the key on stdin; literal key arguments are never accepted. Configuration still
performs supported verification before saving.

## Where keys are stored

Grida stores provider keys in a shared **plaintext** file on macOS and Linux:

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
Preserve version and migration fields. `grida ai providers --help` prints the
location and format link without opening the credential store.

## Override a stored key

For native AI operations that use provider keys, precedence is stdin
(`--key-stdin`), then the provider environment variable, then the shared file.
Explicit keys used for an operation are temporary.
`grida ai providers list` shows the effective source for each configured provider
key and keeps the key values private. It uses the environment first, then checks
the shared file. A blank or invalid explicit key fails validation. Clear the
environment variable to use the saved key.

| Provider     | Environment variable |
| ------------ | -------------------- |
| `openrouter` | `OPENROUTER_API_KEY` |
| `vercel`     | `AI_GATEWAY_API_KEY` |
| `fal`        | `FAL_KEY`            |
| `elevenlabs` | `ELEVENLABS_API_KEY` |
| `tripo`      | `TRIPO_API_KEY`      |
| `gg`         | `GG_API_KEY`         |

Windows preview users can use environment or stdin keys; shared file storage
is not supported there yet. Provider keys and Grida sessions are separate.

## Remove a key

```sh
grida ai providers remove fal
grida ai providers remove gg
```

This removes the key from the shared file. Environment overrides remain
effective. Manage key revocation with the provider that issued the key.

## Resolve storage errors

`invalid_store` means invalid TOML or required structure. `unsupported_version`
requires a compatible Grida version; do not edit the version field to bypass it.
`store_busy` means another process holds the store. `storage_failed` can mean
filesystem, sandbox, ownership, or permission trouble; it does not imply bad
TOML. Follow the message without exposing file contents in a bug report.
