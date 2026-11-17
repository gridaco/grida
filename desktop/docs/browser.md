# Desktop browser

This reference is for contributors implementing or verifying Desktop browser
pages. The [browser contract](https://grida.co/docs/wg/desktop/browser) owns the
behavior model. Browser pages work independently of chat, including with
`--disable-agent`.

## Use

In a workspace, use content-tab **+** to open Quick Start, then choose **Open
Browser**. This replaces Quick Start at its existing position. The native
application menu also offers **Open Browser**. Enter an HTTP(S) address,
including a local development server. The toolbar provides back/forward,
reload/stop and location entry. Its **…** menu contains **Open in default
browser** and **Clear workspace browser data…**.

Tab switching preserves the connected guest and its live document. Closing a
tab ends it. Reopening, workbench reload and application restart reconstruct
eligible recorded URLs with fresh page identities. They do not restore the
running document, navigation history, form contents or scroll. Ephemeral pages
are not restored. Moving a tab to another window cannot transfer a live guest:
stock Electron provides no supported adoption contract here.

A deliberate tab hover requests one bounded still thumbnail when available.
It does not select or show a hidden page. Images may be stale; unavailable
images fall back to metadata. A capture wait is bounded to 1.5 seconds and can
return no image, especially for a hidden guest. No hidden guest is revealed or
woken to obtain pixels. At most one underlying capture per owner can remain
in flight. Bytes remain transient and no capture stream runs.

Website storage is independent of Desktop sign-in and provider sessions.
Persistent browser storage belongs to a workspace; ephemeral storage belongs
to one page. **… → Clear workspace browser data…** closes affected pages and
clears their cookies, site storage, cache and HTTP authentication after a native
confirmation that defaults to Cancel. **Settings → Browser** provides the same
cleanup for a selected registered workspace. Recorded tab addresses and saved
downloads have separate lifetimes.

## Architecture and rollout

Browser protocol **2**, with `presentation: "webview"`, is independent of the
Desktop bridge protocol. The hosted renderer requires both the native browser
capability and this exact supported browser presentation. It withholds v2 calls
on older hosts and preserves saved browser addresses while displaying an
update requirement. A native release is required for this implementation;
publishing hosted JavaScript does not update installed Electron builds.
Deploy the compatible hosted renderer before the native browser v2 release;
keep older hosts on the unavailable-presentation fallback until updated.

Main allocates attachment and page identities. `reserveMount` returns a
one-use opaque `about:blank` bootstrap, bound to the exact shell document,
attachment and page. It is neither a website source nor a session selector.
The global attachment guard rejects all other guests, discards supplied
preferences/preloads, forces the approved session and security preferences,
and suppresses automatic source loading. The created guest object must match
`did-attach-webview` before Main installs policy and loads the authoritative URL.
No guest preload is approved. `Page.mounted` acknowledges actual registration.

The document-owned `WorkspaceBrowserSession` retains canonical tab state and
`BrowserGuestMounts` retains connected DOM nodes. React owns chrome and leases
for presentation slots. Remounting chrome, changing tabs or moving the
presentation slot never rewrites `src` or reparents the guest through a
React-owned subtree. Inactive wrappers are hidden and inert, with focus first
returned to an actual shell element. Main also rejects focus/input commands
for inactive pages. An absent slot is explicitly hidden before DOM removal;
CSS anchor fallback is not a visibility guarantee.

The connected guest layer uses CSS anchors to the current workbench's
non-scrolling content frame. Shared CSS border/radius tokens clip its bottom
corners together with that frame. It does not inherit arbitrary ancestor
scrollport or transform clipping: a future scrolling or transformed content
host must revise this presentation contract and its interaction evidence.
Layout, zoom and clipping use DOM/CSS; no rectangle messages, native geometry,
overlay mutation scanning, overlay classification or hide-on-overlay placeholder
is retained. Menus and modal backdrops use normal stacking and focus primitives;
the page remains visibly live beneath them. Pointer handling inherits the
workbench's body-level modal locking.

Main requests `backgroundThrottling: true`. The application does not pause
media or synthesize visibility events on tab switches. Background scheduling
can vary with Electron and existing application Chromium flags; hidden-page
animation cadence is not a product guarantee. Visible video beneath controls
must keep advancing.

## Security and supported websites

Guests use sandboxing, context isolation, disabled Node integration and disabled
nested webviews. They receive no application preload, bridge, account session,
provider transport or private workspace protocol. Visiting a Desktop URL grants
no native authority. Main validates the exact shell/frame, native role,
registered workspace, attachment and page for each operation; URL shape or raw
webContents ID is never admission evidence.

Typed navigation admits absolute HTTP(S) and rejects credentials, control
characters, file and executable/private schemes. Session request policy also
rejects forbidden main-frame document requests exposed by Chromium, including
file/data loads through built-in APIs. Some programmatic local loaders such as
`blob:` bypass cancellable navigation and request hooks. Observed unsupported
document loads revoke input and close the guest asynchronously after the
native callback. This is containment and recovery, not proof that scripts
never executed. The same trusted workbench already has own-guest scripting
authority. Page-origin links and redirects retain their cancellable guards.
Popups, sensitive permissions, device access, JavaScript dialogs and HTTP
authentication are denied. Certificate errors remain errors. File uploads use
explicit user selection. Downloads require a native save destination under a
live owner and are never automatically opened. Sites requiring disabled
features can be opened in the system browser.

The hosted workbench is a trusted webview embedder. Stock elements expose
own-guest APIs such as script execution and navigation. The typed bridge does
not remove those intrinsic APIs; `javascript:` can execute in-document script
without a network request. This architecture isolates guest websites from
Desktop authority, rather than isolating website contents from their trusted
workbench. No agent browsing tool, MCP server or public debugger surface is
introduced. Native browser commands operate on the actual registered guest
`WebContents`, which remains the mediation point for any future authorized CDP
integration.

## Failure and recovery

Snapshots and changes carry a monotonic owner revision and bounded, untrusted
website metadata. Subscribe before reading; recover observation gaps with a
fresh snapshot. Render metadata as text.

Guest destruction is observed independently of React. A failed/disconnected
guest leaves a recoverable tab; explicit retry navigates or creates a fresh
guest as appropriate. A living crashed guest can reload. Host document reload,
crash, route withdrawal or window closure revokes the attachment and ends its
pages and ephemeral sessions. Detaching does not leave live pages retained in
Main. Delayed mounts, captures and commands cannot resurrect a closed page.
If an accepted mount never produces its creation event, admission keeps a
fail-closed tombstone until that shell is destroyed; close and reopen the
window rather than reusing that ambiguous creation slot.

## Verification and upgrade limits

Run bridge tests/build/typecheck, Desktop tests/typecheck and editor typecheck.
Controller/registry tests cover state and DOM ownership; they do not establish
real Chromium composition, keyboard routing or platform behavior. The opt-in
native fixture runs stock Electron with a disposable profile and mock Keychain:

```sh
GRIDA_DESKTOP_TEST_ELECTRON=1 pnpm --dir desktop exec vitest run src/main/browser-host.electron.test.ts
```

For the actual workbench, use local Supabase with insiders authentication and
a disposable Desktop profile. Use controlled HTTP pages with forms, navigation,
downloads, frame-refusing headers and advancing video/animation. Verify a real
workbench menu and global modal above live contents, modal focus/dismissal,
interaction after dismissal, tab/remount/layout continuity, rounded clipping,
zoom/resize/scroll, shortcuts/composition, session cleanup and reload/crash.
See [composition](../../test/desktop-browser-native-composition.md),
[navigation continuity](../../test/desktop-browser-navigation-continuity.md),
[session isolation](../../test/desktop-browser-session-isolation.md),
[previews](../../test/desktop-browser-tab-preview.md) and
[Settings](../../test/desktop-browser-settings.md).

Native CDP verification must use the registered guest, separately exercising
evaluation, screenshots and input. In the stock Electron42.2/Playwright1.58
probe, raw CDP discovered `type: "webview"` targets while ordinary Playwright
`context.pages()` exposed only the shell. Target discovery does not establish
an ordinary Playwright Page adapter. DOM focus must reach the webview before
input; focusing only the shell or guest WebContents is insufficient evidence.

During development, Fast Refresh of a lifetime-owner module creates a new
module instance; use a full workbench reload after editing those modules.
Ordinary React remounts with unchanged modules retain the document-owned
session. Development module replacement is not a live-guest adoption contract.

Electron [warns that webview architecture and availability can change](https://www.electronjs.org/docs/latest/tutorial/web-embeds).
This is an accepted upgrade-maintenance tradeoff. Repeat attachment, lifetime,
composition, focus and CDP checks on Electron upgrades. Platform execution
must be reported separately; a macOS result does not verify Linux or Windows.
No rendering-speed advantage over native child views is claimed.
