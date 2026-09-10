---
title: Grida CLI
description: Use Grida's account services and media tools from your terminal, scripts, or your own agent harness.
keywords: [grida, cli, command line, byok, media generation]
sidebar_label: Getting started
sidebar_position: 1
tags: [cli]
format: md
---

# Grida CLI

Discover models, generate media, and keep the files in your own workflow.
Desktop does not need to be running.

> **Private development preview.** These guides describe the replacement CLI
> in this repository. It has not been published to npm. Installing the legacy
> `grida` package does not provide these commands. Hosted Grida login and GG
> setup are not yet available for this preview.

## Run the preview

Use Node.js 24 or later and a repository checkout with dependencies installed.
Build and invoke the preview from the repository root:

```sh grida-setup
pnpm --filter grida... build
node packages/grida-cli/dist/bin.mjs --help
```

Below, `grida` means that executable. During development, replace it with
`node packages/grida-cli/dist/bin.mjs` from the repository root. See the
[contributing guide](https://github.com/gridaco/grida/blob/main/CONTRIBUTING.md)
for checkout setup. Global installation instructions will accompany the npm
release.

Stored credentials currently support macOS and Linux. Windows users can supply
BYOK through explicit environment variables or stdin; durable account login is
not supported there yet.

## Generate your first image

Bring an OpenRouter API key and enter it at the hidden prompt:

```sh
grida providers configure openrouter
grida models list --provider openrouter --modality image --available
grida generate --provider openrouter --model openai/gpt-image-2 \
  --prompt "A blue ceramic teapot on a warm neutral background" --out ./image
```

Generation sends your input to the selected provider and may incur charges on
that provider account. `./image` must not already exist. A successful command
saves media and `receipt.json`, then prints their paths.

BYOK needs no Grida login. [Provider credentials](./providers.md) explains
storage and overrides. [Grida login](./auth.md) and [account credits](./account.md)
describe the separate account path required by GG.

## Find the right command

| Task                                   | Guide                       |
| -------------------------------------- | --------------------------- |
| Sign in and manage a Grida session     | [Auth](./auth.md)           |
| Inspect memberships and cached credits | [Account](./account.md)     |
| Configure your own provider keys       | [Providers](./providers.md) |
| Discover models and accepted inputs    | [Models](./models.md)       |
| Generate media and chain local files   | [Generate](./generate.md)   |

```sh
grida --version
grida --help
grida docs generate
```

`--help` describes your installed version and works offline. `docs` prints a
guide URL without opening a browser; reading the guide needs a connection.
These pages describe the development preview. Agent, render, and MCP commands
are deferred.

## Use Grida in scripts

Use `--json` where supported for one structured result on stdout; diagnostics
go to stderr. Errors have `error.code` and `error.message`. Exit codes are `0`
for success, `1` for operation failure, and `2` for invalid usage. Signed-out
`auth status` and logout with unconfirmed remote revocation return `1`.

`--no-input` prevents terminal questions where supported. It does not suppress
OS keyring dialogs. Interactive login rejects `--json` and `--no-input`.
Never put a key itself in a command argument.

Generation does not automatically retry a possibly accepted paid request.
Check errors and saved paths before deciding to submit again.
