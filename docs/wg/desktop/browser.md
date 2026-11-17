---
title: Built-in browser
description: Ownership, isolation, lifetime and presentation contracts for browser pages inside Grida Desktop.
keywords: [desktop, browser, web pages, isolation, navigation]
format: md
tags: [internal, wg, desktop]
---

# Built-in browser

Desktop presents web pages beside workspace documents. A page is an ordinary
browser document with its own navigation and website state, independent of a
conversation, model, workflow or agent protocol.

The browser host owns admission and policy. The workbench owns presentation and
navigation controls. A page cannot acquire application authority by navigating
to an application URL.

## Vocabulary

| Term       | Meaning                                                               |
| ---------- | --------------------------------------------------------------------- |
| Page       | One admitted browser tab and, while mounted, its live guest document. |
| Owner      | The admitted workbench document and workspace containing the page.    |
| Attachment | Opaque authorization for one owner's current document generation.     |
| Mount      | One-use authorization to connect a guest to its exact owner and page. |
| Profile    | Website storage scope, independent of account and provider sessions.  |
| Viewport   | Workbench presentation slot for a selected page.                      |

## Ownership and lifetime

The host allocates attachment, page and mount identities. A caller cannot
choose another owner, session partition, preload or security preferences.
Every operation validates the current owner and page before effect. Exact
document identity is authoritative; matching a URL alone grants no authority.
Only a guest registered through the authorized mount can become the page.

Selecting another tab hides its presentation without ending the connected
live document. Layout changes, presentation movement and remounting workbench
controls must preserve it. Closing a page ends its guest. Hidden guests cannot
intercept workbench focus or input.

A guest's lifetime depends on its hosting document. Document replacement,
reload, crash, role withdrawal and window closure revoke the attachment and
end its pages. Detachment does not promise independent live retention by the
host. Delayed operations from the previous generation have no effect, even
when its navigation was already in progress before attachment.

Recovery and application restart reconstruct eligible recorded URLs with new
identities. They do not restore the running document, navigation history, form
state or scroll position. Window transfer likewise reconstructs a URL; it does
not transfer the running guest. Persistent website storage has an independent
lifetime. Ephemeral pages are not restart-restored.

## Navigation and isolation

User navigation admits absolute HTTP and HTTPS URLs, including local
servers. Credential-bearing, executable, file and private application document
destinations are refused. Links, redirects and document requests obey host
policy. External handoff uses the page's authoritative current URL.

Guests are sandboxed and context-isolated, with no Node access, application
preload or bridge, account cookie jar, provider transport or private workspace
protocol. The host installs policy before loading the first website document.
Application navigation restrictions remain separate from guest policy.

Unmanaged popups, sensitive permissions, device access, HTTP authentication
and JavaScript dialogs are denied. Certificate verdicts are not overridden.
File uploads require explicit user selection. Downloads require a native save
destination under a live owner and never automatically execute or open files.

## Profiles

Persistent website storage belongs to a workspace. Each ephemeral page has a
separate non-persistent profile. Neither scope shares application account or
provider sessions. Clearing a scope blocks competing admission, closes affected
pages and removes storage, connections, cache and authentication state before
admission resumes. Other workspaces and application sessions are unaffected.

Settings can clear one selected registered workspace after a native
confirmation naming it and defaulting to Cancel. This management operation
grants no page attachment or control authority. The exact Settings document
and workspace identity are revalidated before clearing begins.

## Live composition and focus

Pages compose with ordinary workbench content. Menus, tooltips, previews,
popovers and modal backdrops can appear above the live page without hiding it
or substituting a frozen image. Visible video and animation continue beneath
controls. Presentation must share frame clipping, follow layout and zoom, and
stay below browser chrome and unrelated workbench regions. Overlay-specific
recognition rules are not part of the browser contract.

A global modal's backdrop, focus trap and dismissal behavior apply across the
page. Dismissing it restores normal page interaction. Before hiding a focused
page, presentation returns focus to an actual workbench element. Selected
application shortcuts remain available while website editing and composition
stay with the page. Page reload and workbench reload are distinct operations.

Background throttling is permitted. The application does not pause media or
emulate website visibility on selection changes, and makes no guarantee about
hidden animation cadence. This does not permit freezing a visible page beneath
a workbench overlay.

A deliberate tab hover can request a bounded still preview of the last rendered
viewport. Hidden pages are not shown or focused for capture. Unavailable images
fall back to metadata. Image bytes remain transient; previews neither poll nor
start a capture stream.

## Observation and recovery

Bounded observations include identity, mounted state, URL, title, loading,
back/forward availability, focus and failure. Website metadata is untrusted
display data. A monotonic revision orders snapshots and changes; observation
gaps require a new snapshot.

Guest failure does not take down the workbench. Retry can reload a living guest
or mount a new one after destruction. Cleanup revokes pending mounts and
commands, closes guests and releases listeners and ephemeral state. A closed
page cannot reappear from a delayed event.

## Trust and extension boundary

The admitted workbench is a trusted embedder. Its presentation technology may
intrinsically permit scripting and navigation of its own guest contents; a
purpose-specific control API does not remove that authority. Some programmatic local document loaders can likewise bypass cancellable
navigation or request hooks. Unsupported observed documents are terminated
asynchronously; this is containment, not a preexecution scripting barrier.
Such scripting must not confer application bridge, account or provider
authority on the guest.
The product supplies no agent tool, debugger interface or automation protocol
through this browser feature. Additional callers require separately defined
admission and authority without weakening ownership or profile isolation.

The concrete binding, supported Electron behavior and upgrade checks live in
the [Desktop browser reference](https://github.com/gridaco/grida/blob/main/desktop/docs/browser.md).
