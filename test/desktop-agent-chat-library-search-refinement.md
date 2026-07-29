---
id: TC-DESKTOP-AGENT-CHAT-008
title: Refine a pending Library search without losing selected references
module: desktop
area: agent-chat
tags: [agent-chat, library, design-search, human-input]
status: untested
severity: medium
date: 2026-07-29
updated: 2026-07-29
automatable: false
covered_by:
  - editor/kits/agent-chat/design-search-explorer.test.ts
  - editor/scaffolds/desktop/shared/design-search.test.ts
---

## Behavior

The agent's Library query initializes the pending reference picker; it does not
freeze the user's exploration. The user can search several visual directions
inside the same picker and keep references selected from each search. Only the
committed references resolve the pending tool call. A late response from an
older query must never replace or contaminate the current result gallery.

## Steps

1. Open a workspace in Grida Desktop and ask the agent to create an image that
   causes it to request Library references.
   - Expected: the reference-picker tab opens with the agent's initial search in
     the search field.
2. Select two references from the initial results.
   - Expected: both appear in the selected-reference strip and the action shows
     two selected references.
3. Enter a materially different query and press Enter or Search.
   - Expected: the gallery changes to the new results.
   - Expected: the two earlier selections remain selected and removable.
4. Select one reference from the new results.
   - Expected: the picker now reports three selected references.
5. Switch to a file tab and return to the reference-picker tab.
   - Expected: the refined query, current results, and all three selections
     remain intact.
6. Choose Use 3 references.
   - Expected: the pending call resolves once with all three references.
   - Expected: the agent resumes and the picker tab closes as it did before this
     change.
7. Repeat the flow, starting a slow search and immediately submitting another
   query.
   - Expected: only the newest query's results and count appear; no rows from the
     older response are appended.
8. Repeat once with a query that returns no results or fails, then submit a
   valid query.
   - Expected: the picker recovers normally and retains prior selections.
9. Start one more reference request, close the picker tab, and choose the compact
   Skip action beside the pending-reference chip above the composer.
   - Expected: Skip resolves the pending call without references, just like the
     action inside the picker tab.
