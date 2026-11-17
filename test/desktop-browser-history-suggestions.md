---
id: TC-DESKTOP-BROWSER-006
title: Address suggestions search and manage one shared browser history
module: desktop
area: browser
tags: [browser, history, search, suggestions, keyboard, composition]
status: untested
severity: medium
date: 2026-11-17
updated: 2026-11-18
automatable: partial
covered_by:
  - desktop/src/main/browser-history.test.ts
  - desktop/src/main/browser-host.test.ts
  - desktop/src/main/ipc-admission.test.ts
  - editor/lib/desktop/browser.test.ts
  - editor/lib/desktop/browser-history.test.ts
  - editor/scaffolds/desktop/workbench/browser-omnibox.test.ts
  - editor/scaffolds/desktop/workbench/browser-address-bar.test.tsx
---

## Behavior

The browser's address control supports website navigation and submitted Google
searches. Its suggestions come from one shared, device-local history across
workspaces and windows. Suggestions compose over the live page, preserve
keyboard and text-composition behavior, and are never remote type-ahead
requests. Removing an entry forgets it across views without closing the page
or clearing website sign-ins. Global browsing-data cleanup also removes history.
An active address edit or IME composition owns its draft while the page updates
its URL. Escape restores the latest page address.

## Steps

1. Visit two controlled pages with distinct titles and addresses. Open another
   workspace/window and focus **Search or enter URL**.
   - Expected: recent pages from both windows are available. Typing a title or
     address fragment narrows the local results without navigating the page.
2. With video or animation running, open the suggestion list. Select an entry
   by pointer, then repeat with **↑**, **↓** and **Enter**.
   - Expected: the page keeps updating beneath the list. Only explicit
     selection/submission navigates. **Escape** dismisses suggestions and
     restores the existing address/page interaction.
3. Submit `web typography examples`, an HTTPS URL and `localhost:3000`.
   - Expected: the phrase searches Google; addresses navigate directly.
     Typing alone makes no remote search-suggestion request.
4. Compose search text with an IME and use its confirmation key.
   - Expected: composition confirmation does not submit. A subsequent ordinary
     **Enter** submits the completed text. Rapid editing never displays stale
     results from an earlier query over the current query.
5. Remove a suggestion while its page remains open, then open
   **Settings → Browser → History** in another window.
   - Expected: the entry is absent in both views. Removing does not navigate,
     close the page or clear its cookies. A later title change does not restore
     the entry. A genuine revisit may add it again.
6. Search and remove an entry in Settings. Restart Desktop.
   - Expected: removal remains effective; retained history is available and
     remains shared without a workspace/profile selector.
7. Use the separate **Clear history** action while pages are open. Expected:
   history disappears across views while pages, sign-ins and cache remain. Clear
   cache separately; pages, history and website sign-ins remain.
8. Use **Clear browsing data…**, first canceling and then confirming.
   - Expected: cancellation preserves history and tabs. Confirmation closes
     browser tabs across all windows and empties history. Restarting does not
     restore it from an older queued write.
9. Use a v4 browser host missing the optional history capability.
   - Expected: direct navigation and Google search still work; history controls
     show an update requirement without invoking unsupported native methods. An
     older v3 host instead shows the browser update requirement and preserves
     saved HTTP(S) addresses without receiving v4 calls.
10. Begin entering a search or address while the controlled page redirects or
    updates its URL through browser history. Repeat during IME composition.
    Expected: typed text and its suggestions remain intact, and Enter submits
    that text. Escape instead restores the page's latest URL.
