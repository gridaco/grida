---
id: TC-DESKTOP-SETTINGS-004
title: Hooks settings inspect the global TOML source
module: desktop
area: settings
tags: [desktop, settings, hooks, config, trust]
status: untested
severity: high
date: 2026-11-15
updated: 2026-11-15
automatable: false
covered_by:
  - editor/lib/desktop/settings-hooks.test.ts
  - desktop/src/main/native-agent-hooks.test.ts
---

## Behavior

Desktop hooks have one user-wide config.toml definition source. Settings lists
configured commands and diagnostics, opens/reloads that file and reviews exact
command trust. It does not import JSON or activate workspace definitions.

## Steps

1. Use an isolated Desktop profile and absolute GRIDA_HOME fixture. Open
   Settings → Hooks with no configuration file. Confirm an understandable
   empty state and the intended global configuration path.
2. Open configuration, add the documented observational session-start hook,
   save, then reload. Confirm its definition appears pending trust without
   running merely because Settings inspected it.
3. Review and trust the exact command. Confirm trust status updates. Change
   its arguments externally and reload; confirm review is required again.
4. Open fresh connections in two fixture workspaces. Confirm the same trusted
   global definition is selected in both. Confirm a legacy workspace hooks.json
   does not add hooks. Existing running work keeps its captured selection.
5. Introduce malformed TOML, an invalid event or duplicate ID, and reload.
   Confirm a useful diagnostic and no silent claim that invalid settings ran.
6. Disable/remove the definition in TOML and reload. Confirm the list reflects
   the file. Restart Desktop and confirm all connections use the new selection.
7. Repeat inspection on an older shell without hooks capability. Confirm an
   update/unavailable state rather than a broken import action or runtime error.
