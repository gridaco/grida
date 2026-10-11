---
title: Grida FX in the Grida CLI
description: Plan, price and run Grida FX workflows with grida fx, the generative asset pipeline engine that ships with the Grida CLI.
keywords: [grida, cli, fx, workflow, generative assets, pipeline]
sidebar_label: FX
sidebar_position: 7
tags: [cli]
format: md
---

# Grida FX in the Grida CLI

`grida fx` runs [Grida FX](https://grida.co/fx): write a workflow file, and FX
plans it, prices it before anything is spent, caches every paid call by its
request, and records the run.

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

## Platforms

FX runs on macOS and on Linux with glibc 2.28 or later. On Windows, use WSL 2;
on Alpine and other musl systems, use a glibc-based image. Elsewhere,
`grida fx` exits with status `1` and explains this. The other `grida` commands
are unaffected.

## Provider keys

FX reads provider keys from the environment, or from a `.env` file in the FX
project. `grida fx doctor` reports which keys each workflow needs and which it
found, never their values. Reading the keys that
[`grida ai providers`](./providers.md) stores is planned.

## FX on its own

The JavaScript SDK is `@grida/fx` (`npm install @grida/fx`), which also installs
a standalone `grida-fx` command. The Python SDK is `pip install grida`, run as
`python -m grida.fx`. All three run the same engine, and what they print and
record is the same apart from the command name they show.
