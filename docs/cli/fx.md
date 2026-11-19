---
title: Grida FX in the Grida CLI
description: Plan, run and inspect asset workflows with the Grida FX engine bundled in the Grida CLI.
keywords: [grida, cli, fx, workflow, generative assets, pipeline]
sidebar_label: FX
sidebar_position: 7
tags: [cli]
format: md
---

# Grida FX in the Grida CLI

`grida fx` plans and runs reusable asset workflows. FX reuses cached results
and records each run for inspection.

## Run a workflow

```sh
grida fx --help
grida fx plan workflow.yaml
grida fx run workflow.yaml --live --max-usd 2
```

Each `grida` release carries the Grida FX version it pins, so updating `grida`
updates FX. `grida fx --version` prints that version. FX owns these commands,
their options and their help: `grida fx <command> --help` describes each one.
The [FX guide](https://github.com/gridaco/fx/tree/main/docs/guide) covers
workflow files, nodes, costs, caching and runs.

## Generate one image

For a single PNG, you can call `image.generate` directly. This example
previews a request using the project's configured image route.

```sh
grida fx call image.generate --prompt 'A red kite above a foggy hill' --dry-run
```

To generate, replace `--dry-run` with `--live`. Metered routes use
`--max-usd` or the project budget. See `grida fx call image.generate --help`
for route and output options.

## Platforms

FX runs on macOS and on Linux with glibc 2.28 or later. On Windows, use WSL 2;
on Alpine and other musl systems, use a glibc-based image. Elsewhere,
`grida fx` exits with status `1` and explains this. The other `grida` commands
are unaffected.

## Provider keys

FX checks the environment, then the project's `.env`. On macOS and Linux,
eligible providers can also use a key saved with `grida ai providers configure`.
Use `grida fx doctor` to check your setup. [Configure provider keys](./providers.md)

## FX on its own

The JavaScript SDK is `@grida/fx` (`npm install @grida/fx`), which also installs
a standalone `grida-fx` command. The Python SDK is `pip install grida`, run as
`python -m grida.fx`. All three run the same engine, and what they print and
record is the same apart from the command name they show.
