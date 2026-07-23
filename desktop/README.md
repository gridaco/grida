# Grida Desktop App

[👉 Download](https://grida.co/downloads)

The desktop app is the Electron host for the Grida editor. It loads the
hosted editor under `/desktop/*`, exposes a path-scoped preload bridge,
and starts the agent sidecar through `desktop/src/agent-sidecar.ts`.

Most native behavior does not belong in this directory. The agent system
lives in `@grida/agent`; desktop should stay thin: windows, menus,
protocol routing, app lifecycle, IPC sender validation, and sidecar
supervision.

The accepted security architecture for host-native networking and confined
agent execution is [Desktop agent authority](./docs/agent-authority.md).

## Architecture

```text
Electron main/preload (desktop)
  -> owns the exact 127.0.0.1 ephemeral listener and per-spawn auth
  -> transfers only accepted connected sockets to the socketless sidecar
  -> owns provider destination grants and a dedicated Chromium network session
  -> loads editor /desktop/*

@grida/agent
  -> owns BYOK secrets, provider selection/credential injection, files,
     workspaces, sessions, and desktop agent execution
  -> serves authenticated daemon HTTP only on main-transferred sockets
  -> sends only provider requests and credential-free provider-asset downloads
     over bounded framed stdin/stdout

editor /desktop/*
  -> owns UX only, through typed bridge clients
```

On macOS and Linux, the sidecar runs under `srt` with no direct external
destinations and `allow_local_binding: false`; Electron main supplies the two
explicit capabilities above. Windows currently runs the sidecar without that
outer wrapper: shell and external ACP are withheld, while structured local file
tools remain available and no kernel egress fence exists. That is a documented
nonconformance rather than a sandbox claim.

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

The `/desktop` directory is a separate pnpm workspace, while the Grida
packages it links are built by the root workspace. Install both from the
repository root:

```bash
pnpm install
pnpm --dir desktop install
pnpm --dir desktop dev
```

Desktop commands build their linked packages first. Turbo reuses cached
outputs when their sources have not changed.

In development, `pnpm --dir desktop dev` launches Electron only.
Run the editor dev server separately:

```bash
pnpm --filter editor dev
pnpm --dir desktop dev
```

## Testing

```bash
pnpm --filter @grida/agent test
pnpm --dir desktop test
pnpm --dir desktop typecheck
```

Use agent package tests for core behavior. Use desktop tests for Electron
adapter behavior.
