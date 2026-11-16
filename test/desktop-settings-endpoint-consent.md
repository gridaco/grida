---
id: TC-DESKTOP-SETTINGS-006
title: Endpoint connection consent survives visits and restarts
module: desktop
area: settings
tags: [desktop, settings, ollama, providers, consent]
status: untested
severity: high
date: 2026-11-15
updated: 2026-11-15
automatable: false
covered_by:
  - editor/lib/desktop/settings-ollama.test.ts
  - editor/lib/desktop/bridge.test.ts
  - desktop/src/main/provider-endpoint-consent.test.ts
  - desktop/src/main/provider-endpoint-startup.test.ts
---

## Behavior

Connecting or saving an endpoint is the user's approval of the displayed
address. Desktop remembers that choice on this device. Visiting Settings,
discovering models and relaunching Desktop do not open another approval
dialog. Automatic discovery cannot authorize a new address. Removing the
connection also removes its remembered approval.

## Steps

1. Use an isolated Desktop profile with a local Ollama fixture. Open
   Settings → LLM Providers → Ollama and choose Set up Ollama. Confirm the
   Base URL is visible before connection and no provider request starts.
2. Choose Connect. Confirm models are discovered without an additional
   native approval dialog. Return to another settings category and back;
   confirm discovery refreshes without a dialog. Choose Detect explicitly
   and confirm the same behavior.
3. Quit and relaunch Desktop using the same profile. Confirm the endpoint
   remains connected and model discovery and selection work without a dialog.
4. Edit Base URL without saving. Confirm discovery at the edited address is
   withheld. Save it explicitly; confirm discovery can now use that address
   without a second confirmation. Use distinct fixture addresses to verify
   requests reach only the selected destination.
5. With Desktop closed, change the saved endpoint address outside Settings.
   Relaunch and confirm it needs Connect, with no background requests to the
   changed address and no approval popup. Connect explicitly and confirm it
   becomes usable.
6. Remove the connection and restart. Confirm it is absent and has no retained
   approval. Set it up again and confirm Connect is required before discovery.
7. Repeat with a preexisting saved endpoint from a Desktop build without
   persistent approval. Confirm a usable Connect action appears, even when
   the configuration is unchanged. Confirm opening Settings in an older host
   does not automatically trigger its legacy probe approval dialog.
