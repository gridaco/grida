---
name: agent-system
description: >-
  Grida AI agent system work: the native Rust agent (`crates/agent-kit-*`,
  `grida-agent-master`, the `grida-agent` host executable), its Desktop Main
  integration (`desktop/src/main/native-*`) and renderer chat controllers
  (`editor/lib/agent-chat/native-*`), plus the retained host services —
  `@grida/daemon` (DaemonServer, loopback perimeter, files/workspaces/recents,
  secrets store) and `@grida/ai-host` (media tenant, provider custody, ChatGPT
  subscription host). Use before implementing agent features or choosing
  their layer, including chat settings, attachments, session, tool,
  permission, provider, compaction or stream bugs, ACP/MCP protocol changes,
  and sidecar route changes. For pure Electron window, preload, menu, deep-link, or CDP work,
  use `desktop`.
---

# Grida Agent System

Chat execution and strategy run in the **native Rust agent**. The TypeScript
agent engine is gone; `@grida/ai-host` is now a retained media-services package
with no chat loop, sessions, prompts, skills or tool assembly. Desktop still
owns its client presentation, shell integration, and application preferences.
Do not recreate an execution engine or product master there.

Use [`desktop`](../desktop/SKILL.md) for Electron shell work. Adjacent:
[`security`](../security/SKILL.md) for GRIDA-SEC-004/006/008/014,
[`sdk-seam`](../sdk-seam/SKILL.md) for protocol changes between host and
Desktop.

## Start here

Before selecting implementation files, read the canonical
[architecture rings and placement rules](../../../docs/wg/ai/agent/index.md#architecture-rings),
then the [native package mapping and checked dependency budgets](../../../crates/grida-agent/docs/rust-core.md#dependency-budgets).
Record the behavior's owner, execution surface, retained-state owner, and
affected contracts. Application behavior outside the rings is a valid result;
an agent feature does not automatically need a core change.

Keep the definitions in that WG section and the concrete budgets in the native
binding. Link to those owners rather than copying their rules into skills,
local instructions, or feature implementations. For a boundary change,
identify each side's contract and required evidence before editing either side.
Run the dependency guard when changing agent manifests or dependency budgets.

## Topology

```
Desktop renderer  (editor/lib/agent-chat/native-*-controller.ts)
   │ guarded native chat IPC
Electron Main     (desktop/src/main/native-*.ts)
   │ supervises over private stdio: ACP + negotiated extensions,
   │ supervised provider HTTP (Main injects Gateway/ChatGPT credentials)
grida-agent       (crates/grida-agent — host composition, the executable)
   └ grida-agent-master  product policy: context, effort, goals, questions,
   │                     subagents, hooks, compaction accounts
   └ agent-kit-{core,runtime,sessions,providers,sandbox,store-sqlite}

Retained media sidecar (ServicesSidecar) — separate child of Main, runs no chat
   DaemonServer (@grida/daemon) + media tenant (@grida/ai-host/media-server)
```

Crate ownership and cross-crate rules:
[`crates/grida-agent/docs/rust-core.md`](../../../crates/grida-agent/docs/rust-core.md).
Wire: [`rust-client-protocol.md`](../../../crates/grida-agent/docs/rust-client-protocol.md).
Tool ownership across Rust/Electron/MCP:
[`tool-host-contract.md`](../../../crates/grida-agent/docs/tool-host-contract.md).
Feature status: [`docs/agent/features.md`](../../../docs/agent/features.md).

## Non-obvious facts

- **Provider selection and accepted-work authority have distinct lifetimes.**
  Follow the current [native continuation contract](../../../crates/grida-agent/docs/rust-core.md#persistent-adapter-and-composition)
  before changing selection or recovery. Do not impose a chat-lifetime
  connection lock or silently rebind accepted work.
- **Titles** are opt-in per launch and run on a temporary in-memory, tool-free
  host under the same execution; a rename always wins (catalogue revision).
- **Commands** run only through `agent-kit-sandbox` (Seatbelt / bubblewrap +
  seccomp). An unavailable boundary refuses the command; there is no
  unconfined fallback. Windows starts no chat engine.
- **Desktop chat state** lives under Electron `userData/native-chat/`
  (`workspaces/<key>/`, `documents/<key>/runtime/`), one SQLite
  `agent.sqlite` per state directory with one owning process. The store opens
  only an empty database or one it created; there are no schema upgrades. The earlier
  TypeScript `sessions.db` and its session scratch stay in place, denied to
  the retained sidecar; never reopen them.
- **Retained sidecar perimeter** (GRIDA-SEC-004): Main owns the loopback
  listener and transfers connected sockets; every route needs Basic Auth in
  the `Authorization` header (no query-string credential), plus Referer and
  Origin. `@grida/daemon` is AI-free by contract
  (`packages/grida-daemon/src/__boundary__.test.ts`); the tenant list is static.
- **ChatGPT subscription** custody is Main's in-process
  `@grida/ai-host/chatgpt-host`; the sidecar mounts no ChatGPT route and the
  native host receives only an opaque scope (GRIDA-SEC-008).
- **Gateway grants** are memory-only (GRIDA-SEC-006); BYOK keys live in the
  shared provider credential file (GRIDA-SEC-014), denied to model commands.

## Where tests go

- Policy and runtime behavior: the owning crate's tests;
  built-process cases under `crates/grida-agent/tests/process/`.
- Desktop wiring and IPC: `desktop/src/main/native-*.test.ts` — prove Main
  starts, routes and authorizes; do not duplicate crate behavior.
- Perimeter, files, workspaces, secrets: `packages/grida-daemon/src/**`;
  media routes: `packages/grida-ai-host/src/**`.
- Regression obligations and coverage model:
  [`rust-core-pressure-test.md`](../../../crates/grida-agent/docs/rust-core-pressure-test.md#coverage-model).

## Verification

```sh
cargo test -p grida-agent --locked --test dependency_boundaries
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
cargo test --workspace --all-features --locked

pnpm --filter @grida/daemon test          # + test:browser for the perimeter
pnpm --filter @grida/ai-host test
```

Headless end-to-end runs use `grida-agent run` (see the crate README) or the
mission runner in `scripts/agent-missions/`; both spend real model credits, so
run them only when asked. Desktop changes also need the `desktop` skill's
checks.
