---
title: Built-in browser
description: Ownership, navigation, website interaction and storage contracts for browser pages inside Grida Desktop.
keywords: [desktop, browser, web pages, isolation, navigation]
format: md
tags: [internal, wg, desktop]
---

# Built-in browser

Desktop presents web pages beside workspace documents. A page is an ordinary
browser document with its own navigation and website state, independent of a
conversation, model, workflow or agent protocol. Normal website interaction
includes new browsing contexts, permission requests, authentication, downloads
and page inspection.

The browser host owns admission, native interaction and policy. The workbench
owns presentation and navigation controls. Website URLs and shared website
storage never confer application authority.

## Vocabulary

| Term              | Meaning                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Page              | An admitted workbench browser tab and its live guest document.                                  |
| Owner             | The admitted workbench document and workspace containing a page.                                |
| Attachment        | Opaque authorization for one owner's document generation.                                       |
| Mount             | One-use authorization to connect a guest to its exact owner/page.                               |
| Website window    | A managed browsing context preserving website opener, name and submission semantics.            |
| Profile           | Shared website storage, separate from account/provider sessions.                                |
| Live location     | A bounded observation of the document currently displayed.                                      |
| Recorded address  | An eligible HTTP(S) destination retained for history or reconstruction.                         |
| Accepted download | A native transfer with an admitted destination and lifetime independent of its originating tab. |

## Ownership and lifetime

The host allocates attachment, page and mount identities. A caller cannot
choose another owner, profile, preload or security preferences. Every operation
validates its current owner and page before effect. Exact document identity is
authoritative; matching a URL alone grants no authority. Only an actual guest
registered through an authorized mount can become the page.

Selecting another tab hides its presentation without ending the connected
live document. Layout changes, presentation movement and remounting workbench
controls preserve it. Hidden guests cannot intercept workbench focus or input.

Ordinary navigation and page closure respect a website's unsaved-change request.
A native Stay/Leave choice defaults to Stay. Staying preserves the document and
its workbench tab. Document replacement, reload or crash of the hosting
workbench, role withdrawal, window shutdown and explicit full browser reset
revoke the attachment and force its pages to end. A website cannot veto owner
teardown. Delayed operations from a previous generation have no effect.

Recovery, reopening and application restart reconstruct eligible recorded
addresses with new identities. They do not restore a running document,
Back/Forward history, form input or scroll. Window transfer similarly
reconstructs an address, rather than transferring a running guest. Website
windows and generated documents have no restart-restoration promise.

## Browsing contexts and navigation

A deliberate new-tab link can create a workbench content tab without reloading
its opener. Foreground/background intent is retained, and new children are
placed beside their opener's existing children. The host publishes creation;
the workbench adopts that outcome rather than replaying the website action.

Website-created windows retain ordinary opener, naming, form submission and
self-close semantics. Replacing a submitted context with a new address load
would lose those semantics. Managed website windows therefore remain real
browser contexts with the same website profile and isolation rules. Their
lifetime remains bounded by their opener's native context and owning workbench
document. Ordinary website navigation adds no product-specific force-close rule;
normal browser window lifecycle remains in effect. Opener destruction/crash and
owner teardown end dependent windows.
The host bounds open tabs/windows and reports resource exhaustion instead of
creating an unmanaged context.

Input can be a website address or ordinary search text. Submitting search text
opens a Google search. Typing alone makes no remote suggestion request. Local
suggestions match shared browsing history; selecting one explicitly navigates.
While an address edit or composition is active, website URL changes preserve
that draft. Escape restores the latest page address. A prior navigation
error ends when a later allowed full-document navigation succeeds, including
Back/Forward recovery; pending, canceled or failed loads and subframe changes
do not imply recovery.

A live document location and a recorded destination are different values.
Ordinary generated blank, inline, blob and data documents can remain usable
browser content. Their locations are transient observations, not filesystem,
fetch or application authority. Large generated locations may use a bounded
display marker. They are excluded from history, saved layouts, reopening,
external handoff and favicon acquisition.

Explicit navigation, persisted addresses and whole-page default-browser handoff
admit absolute HTTP(S), including local servers, without embedded credentials or control
characters. File, executable and private application destinations remain
refused. Whole-page handoff uses an eligible authoritative page address.

External-app links are a separate action. A real top-document mail, telephone
or SMS link can open its normal OS handler. A custom scheme first requires
native consent for the actual HTTP(S) origin/scheme, remembered for the application
session. Scripted handoffs with attributable website context always require native
confirmation; saved click consent does not turn them into automatic launches.
Requests without attributable context remain unavailable. Private native
routes, files, known executable schemes and malformed or unbounded URIs remain
refused. A changed source document/owner or identified requesting frame cannot
spend an earlier confirmation. Handler availability is determined by the OS;
the browser does not promise every custom scheme can open an application.
A separate website window used for an app handoff may remain blank after
cancellation or an unavailable handler and can be closed normally.

## Website interaction and native consent

Guests are sandboxed and context-isolated. They have no page-level native runtime
access, application preload/bridge, account cookie jar, provider transport or private
workspace protocol. A narrow host-owned browser helper may report click intent
without exposing application capabilities. The host establishes policy before
website loading; application navigation rules remain separate.

Ordinary active-page clipboard writes, fullscreen and pointer lock remain
usable. Clipboard reads, camera, microphone, location and notifications obtain
native website consent. Known site choices can be remembered across tabs for
the application session. Unknown permissions are refused. Website consent and
operating-system consent are distinct; neither substitutes for the other.

Consent identifies the actual requesting security origin and embedding context
where the runtime supplies that identity. A displayed URL alone cannot establish
an inherited or opaque origin. Sparse runtime identity must be described honestly
rather than presented as universal subframe scoping. After a wait, changed
owner, frame, origin or document invalidates consent. A background permission
check may consume an existing known-origin grant without opening a prompt.

Screen sharing requires selection of a real screen/window, never automatic
selection of an available source. Device access likewise requires selection of
an actual device. A selected file/folder handle grants only its admitted scope;
workspace membership and native private paths do not become website grants.
Platform-specific chooser, pairing and capture limitations belong in the
implementation reference and must remain visible to callers.
Resetting permission choices must end active capture independently of the
initiating Settings document once reset begins. If the runtime retains native
device grants beyond reset, disclose the restart requirement; clearing an
application's choice map alone is not complete revocation.

HTTP authentication identifies the challenged site origin or actual proxy
endpoint. Credentials are delivered only to the corresponding native browser
challenge. Owner loss or navigation invalidates a pending credential form.

A development certificate exception requires an explicit native choice for the
exact host and certificate fingerprint in the isolated browser profile.
Application-account and provider networking remain outside its scope. Clearing
a remembered exception does not prove that a browser's cached verification
result has ended; any restart requirement must be stated.

Ordinary page alerts and confirmations remain available with repeated-dialog
handling. Runtime features that are unavailable must be reported as such,
rather than described as a product permission refusal. Unsaved-change dialogs
follow the ordinary/forced lifetime distinction above.

Find, page zoom, print and inspection operate on the actual admitted page.
Find results and pending work expire on navigation/teardown. Native context
menus address the guest under the pointer, including editable content, links
and website windows. Human page inspection grants no agent or cross-page
control interface.

## Shared browser state and downloads

All pages and website windows use one persistent website profile across
workspaces and windows. Cookies, sign-ins and storage are shared. An attachment
authorizes operations on exact pages; it does not select a profile or grant
control over another owner's pages. Closing pages or changing the application
account leaves website storage intact. There are no private or workspace-specific
profiles.

Downloads normally use a browser-wide native destination, with an optional
save-location prompt. Native folder selection, rather than a website or bridge
path argument, changes that destination. Website filenames are bounded and
sanitized; default saving avoids overwriting a collision. Once admitted, a
transfer can outlive its originating tab while the application runs. Pending
selection still requires its live owner. Downloads never open or execute
automatically. Browser reset can cancel accepted transfers without deleting
already saved files.

Browser maintenance separates effects:

| Operation                     | Contract                                                                                                                                                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove visits / clear history | Forget recorded browsing metadata without closing pages or clearing website storage/cache.                                                                                                                                             |
| Clear cache                   | Clear shared HTTP cache without closing pages or clearing history/sign-ins.                                                                                                                                                            |
| Reset website permissions     | Forget remembered website/device and external-app choices, cancel pending prompts and reload open pages/windows to end active capture. OS permission remains separate; native device grants and certificate cache can require restart. |
| Full browser reset            | Confirm all-windows scope, block competing admission, close all browser pages/windows, cancel accepted transfers and clear history, website storage, cache, connections, authentication and remembered choices.                        |

Permission-reset reloads may discard unsaved input and cannot be vetoed by the
old document. Full reset defaults to Cancel and revalidates the exact initiating
document after confirmation. Both workbench and Settings can request the same
global operation without choosing a workspace or profile. Settings management
grants no page attachment or navigation authority. An older scoped operation
must never be silently interpreted as a global reset.

Application sign-in, provider credentials, workspace files and saved downloads
remain separate from browser maintenance.

## Shared browsing history

History is one bounded, device-local collection across workspaces and windows,
with the latest eligible visit per exact address. Actual successful main-frame
navigation and titles, including eligible same-document navigation, can record
visits. Address keystrokes, subframes, failed loads and generated locations do
not. History survives owner teardown independently of tab navigation history
and application account identity.

Only admitted workbench and Settings documents can query or remove entries.
Queries return bounded recent title/address matches. Revisions order observations
and invalidate stale views without broadcasting website metadata. Renderer input
cannot insert visits or select a disk path, profile or guest. Metadata remains
untrusted display data.

Removal updates all views without closing a page or clearing its sign-in. A
late title update cannot recreate a removed entry; a genuine revisit can.
Clearing history fences queued persistence so an old write cannot restore it.

## Presentation, observation and recovery

Pages compose with ordinary workbench content. Menus, tooltips, previews,
popovers and modal backdrops appear above the live page without hiding it or
substituting a frozen image. Visible video and animation continue beneath
controls. Presentation shares frame clipping, follows layout and shell zoom,
and stays below browser chrome and unrelated workbench regions.

A global modal's backdrop, focus trap and dismissal apply across the page.
Dismissal restores interaction. Before hiding a focused page, presentation
returns focus to an actual workbench element. Selected application shortcuts
remain available while website editing/composition stay with the page. Page
reload and workbench reload are distinct operations. These interactions require
platform and input-method evidence; adapter tests alone do not establish them.

Background throttling is permitted. There is no guarantee of hidden animation
cadence, but a visible page beneath controls must remain live. Deliberate tab
hover can request a bounded still of an eligible page's last rendered viewport.
Capture neither shows/focuses a hidden guest nor starts continuous capture.
Unavailable pixels fall back to metadata. Favicons are likewise bounded,
transient display data, not remote loading authority or restored state.

Bounded observations include page identity, mounted state, live location, title,
loading, navigation availability, focus and failure. Monotonic revisions order
changes; observation gaps require a new snapshot. Guest failure leaves a
recoverable tab without taking down its owner. Cleanup revokes pending mounts,
commands and transient reads; a closed page cannot reappear from a late event.

## Trust and extension boundary

The admitted workbench is a trusted embedder. Its presentation technology may
intrinsically permit scripting/navigation of its own guests. A purpose-specific
control API does not remove that authority. Some programmatic loaders and
in-document scripts bypass cancellable document requests. Guards and
asynchronous containment are not a universal preexecution scripting barrier.
Such scripting still grants no application bridge, account or provider authority.

The feature introduces no agent browsing tool, MCP server or product automation
protocol. Additional callers require separately defined admission and authority.
The concrete binding, runtime limitations, release gates and verification cases
live in the [Desktop browser reference](https://github.com/gridaco/grida/blob/main/desktop/docs/browser.md).
