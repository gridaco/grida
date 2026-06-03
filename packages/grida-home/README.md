# @grida/home

The canonical Grida home directory contract. Resolves **where** Grida stores
per-user state on disk — and nothing else.

> Status: experimental (0.x). The surface may change until a second consumer
> shapes it.

## What it is

One canonical directory, `~/.grida`, overridable with a single `GRIDA_HOME`
environment variable. This is the `~/.cargo` / `~/.aws` / `GRADLE_USER_HOME`
convention — a single self-contained per-user home — **not** the XDG
category split. Components carve subdirectories under it:

```ts
import { home } from "@grida/home";

home.dir(); // ~/.grida   (or $GRIDA_HOME, if set to an absolute path)
home.join("agent"); // ~/.grida/agent
```

`GRIDA_HOME` is honored only when set to a non-empty **absolute** path (mirrors
`CARGO_HOME`); otherwise it falls back to `<home>/.grida`. The location is the
same on every platform — that uniformity is the point of the single-home model.

Host facts (`env`, `home`) are injectable for testing:

```ts
home.dir({ env: { GRIDA_HOME: "/tmp/x" }, home: "/Users/me" }); // "/tmp/x"
```

## What's NOT in the box

- **No filesystem I/O.** Resolves paths only — never creates, reads, or stats a
  directory. Callers `mkdir` lazily themselves.
- **No migration / legacy-dir handling.** It does not find, move, or symlink any
  prior location.
- **No app-data semantics.** It does not know `sessions.db`, `auth.json`, file
  contents, or permissions — only _where_ a component's slice lives.
- **Not XDG / not a category split.** One home, by design. If config/data/cache
  separation is ever needed, that's a different package, not a knob here.
- **No env knobs beyond `GRIDA_HOME`.** Per-component overrides (e.g. the agent's
  `GRIDA_AGENT_USER_DATA`) live in the consumer, not here.
- **Not an Electron path provider.** Independent of `app.getPath(...)` and the
  app's branding/name.

## Prior art

The single-home convention, as used by `cargo` (`~/.cargo`, `CARGO_HOME`),
the AWS CLI (`~/.aws`), and codex (`~/.codex`, `CODEX_HOME`).
