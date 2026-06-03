# Grida Desktop App

[👉 Download](https://grida.co/downloads)

The desktop app is the Electron host for the Grida editor. It loads the
hosted editor under `/desktop/*`, exposes a path-scoped preload bridge,
and starts the agent sidecar through `desktop/src/agent-sidecar.ts`.

Most native behavior does not belong in this directory. The agent system
lives in `@grida/agent`; desktop should stay thin: windows, menus,
protocol routing, app lifecycle, IPC sender validation, and sidecar
supervision.

## Architecture

```text
Electron main/preload (desktop)
  -> starts and authenticates loopback agent sidecar
  -> loads editor /desktop/*

@grida/agent
  -> owns BYOK secrets, providers, files, workspaces, sessions,
     and desktop agent execution

editor /desktop/*
  -> owns UX only, through typed bridge clients
```

If a bug reproduces in files, workspaces, BYOK providers, sessions,
or agent execution, add the first test in
`packages/grida-ai-agent`, not here. Desktop tests should prove the host
adapter still wires the core.

## Distributions

We support macOS, Windows, and Linux distributions.

[See All Releases](https://github.com/gridaco/grida/releases/latest)

| Name             | Platform | x64 | arm64 | universal | makers           | signed | notes                                         |
| ---------------- | -------- | --- | ----- | --------- | ---------------- | ------ | --------------------------------------------- |
| `Grida`          | `darwin` | ✓   | ✓     | ✓         | `zip`, `dmg`     | ✓      |                                               |
| `Grida`          | `win32`  | ✓   |       |           | `exe (squirrel)` |        | We only support x64 for win32 / not signed () |
| `Grida`          | `linux`  | ✓   | ✓     |           | `deb`, `rpm`     | ✓      |                                               |
| `Grida Insiders` | `darwin` |     |       | ✓         | `zip`, `dmg`     | ✓      | Insiders version is only available for MacOS  |

> Insiders app is a contributor version of the app, which requires additional setup to run.

# Building locally

See the [CONTRIBUTING.md](CONTRIBUTING.md) file for instructions on how to build and run the project locally.

**Quick Start**

Note: the `/desktop` directory has its own `pnpm-workspace.yaml` file, so you need to run `pnpm install` in the `/desktop` directory.

```bash
pnpm install
pnpm dev
```

In development, `pnpm dev` in this directory launches Electron only.
Run the editor dev server separately:

```bash
pnpm --filter editor dev
cd desktop && pnpm dev
```

## Testing

```bash
pnpm --filter @grida/agent test
pnpm --dir desktop test
pnpm --dir desktop typecheck
```

Use agent package tests for core behavior. Use desktop tests for Electron
adapter behavior.
