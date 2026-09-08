# Grida Desktop App

[👉 Download](https://grida.co/downloads)

The desktop app is the Electron host for the Grida editor. It loads the
hosted editor under `/desktop/*`, exposes a path-scoped preload bridge,
and starts the agent sidecar through `desktop/src/agent-sidecar.ts`.

Most native behavior does not belong in this directory. Shared model operations
live in `@grida/ai`; their HTTP adapters and the agent system live in
`@grida/agent`. Desktop stays thin: windows, menus,
protocol routing, app lifecycle, IPC sender validation, and sidecar
supervision.

The accepted security architecture for host-native networking and confined
agent execution is [Desktop agent authority](./docs/agent-authority.md).
The native system-browser and loopback flow for using an eligible ChatGPT
subscription is documented in
[ChatGPT subscription OAuth](./docs/chatgpt-subscription-oauth.md).
That flow has an active local credential boundary and remains an experimental
integration: it defaults to the public native Codex OAuth client identity,
never starts Codex/ACP, and is still gated for stable release on a
legal/support contract with OpenAI.

## Architecture

```text
Electron main/preload (desktop)
  -> owns the live Grida-account projection and versioned Desktop preferences
  -> derives the one sign-in / onboarding / main entry-window role
  -> owns the exact 127.0.0.1 ephemeral listener and per-spawn auth
  -> transfers only accepted connected sockets to the socketless sidecar
  -> owns provider destination grants and a dedicated Chromium network session
  -> loads editor /desktop/*

Desktop sidecar composition
  -> @grida/daemon owns the perimeter, shared-provider adapter and local resources
  -> @grida/agent/media-server serves media through @grida/ai without chat startup
  -> full @grida/agent/server also enables sessions and desktop agent execution
  -> serves authenticated daemon HTTP only on main-transferred sockets
  -> sends only provider requests and credential-free provider-asset downloads
     over bounded framed stdin/stdout

editor /desktop/*
  -> owns UX only, through typed bridge clients
```

Desktop starts with the agent enabled. Launching with `--disable-agent` selects
media-only startup before the chat server is imported. Image, video, music,
sound effects, speech and 3D routes keep the same authenticated transport,
BYOK key store, GG memory custody and durable media root. Agent/session routes,
configured text-provider routes and native ChatGPT auth are absent; the
handshake reports those capabilities as unavailable. No chat database, skill
discovery, scratch preparation or finite-command authority is initialized.
This is a host launch choice, not a renderer setting or fallback after failure.

The separate media entry is an application adapter in the existing package.
It establishes startup independence; Desktop still bundles the agent package.
The independently usable model SDK is `@grida/ai`, which owns no HTTP routes,
Desktop lifecycle or chat state.

Small, non-secret native preferences live in `preferences.json` under
Electron's `userData` directory and are owned exclusively by main. The hosted
renderer receives purpose-specific actions, never a generic preferences
key/value bridge. `DesktopPreferences` uses a small versioned JSON document
with owner-only atomic writes. Account cookies remain in Chromium's HttpOnly
session, while BYOK API keys use the shared native `providers/credentials.toml` under
Grida home through the sidecar's secret adapter. ChatGPT OAuth stays in the
agent's `auth.json`. On the first upgrade from Desktop 0.0.13, main consumes the former
renderer onboarding-completion flag through one fixed hidden same-origin probe
and records the migration before selecting an authenticated role. That legacy
flag is never consulted again.

Shared BYOK custody (GRIDA-SEC-014) is private plaintext on macOS/Linux.
Desktop and CLI see the same provider changes without either requiring the
other to run. The supervisor resolves Grida home once and forwards that exact
path to the sidecar and its sandbox policy. An explicit
`GRIDA_AGENT_USER_DATA` override isolates both agent state and provider custody.
Migration preserves ChatGPT OAuth, retires old API entries and resumes pending
cleanup without reimporting keys. Older mixed-file writers must not run
concurrently. Windows BYOK storage is currently unsupported; existing ChatGPT
OAuth behavior is unchanged. No renderer capability returns stored keys.

On macOS and Linux, the sidecar runs under `srt` with no direct external
destinations and `allow_local_binding: false`; Electron main supplies the two
explicit capabilities above. A model-selected command is a third private
sidecar-to-main capability: main gives each finite worker a fresh SRT profile
containing only its exact workspace, own session scratch, and private command
temp write roots. The coarse sidecar profile is not used as proof of
cross-session shell isolation. Windows currently runs the sidecar without the
outer wrapper: shell and external ACP are withheld, while structured local
file tools remain available and no kernel egress fence exists. That is a
documented nonconformance rather than a sandbox claim.

Windows still accepts per-session scratch staging. Raster inputs remain
operable through provider perception/`view_image`, and structured text
(including SVG) remains operable through filesystem tools. Scratch-only binary
inputs such as PDF/archives are withheld because the confined binary command
tool is unavailable; the renderer does not create an inert attachment path.

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

In one terminal, start the editor dev server:

```bash
pnpm --filter editor dev
```

In a second terminal, start Electron:

```bash
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
