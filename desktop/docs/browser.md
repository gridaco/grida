# Desktop browser

This reference is for contributors implementing or verifying Desktop browser
pages. The [browser contract](https://grida.co/docs/wg/desktop/browser) owns the
behavior model. Browser pages work independently of chat, including with
`--disable-agent`. Everyday instructions live in the
[built-in browser user guide](https://grida.co/docs/editor/desktop/browser).

## Tabs, links and website windows

In a workspace, use content-tab **+** to open Quick Start, then choose **Open
Browser**. This replaces Quick Start at its existing position. The native
application menu's **New Tab** (⌘T / Ctrl+T) also opens Quick Start.
**Search or enter URL** accepts HTTP(S) addresses, including local development
servers, or text submitted to Google search. Typing alone requests no remote
search suggestions. Back, Forward, Reload and Stop operate on the page.

Trusted main-frame HTTP(S) anchor clicks with `target="_blank"`, a middle click,
or ⌘/Ctrl-click can create workbench content tabs. New tabs are placed beside
their opener's existing children. Modified clicks open in the background unless
Shift requests the foreground; an ordinary `_blank` click opens in the
foreground. Download links and links explicitly retaining an opener use their
ordinary Chromium path. Main publishes created-page outcomes; the renderer does
not invent a page identity or replay a website action.

A fixed, private sandboxed guest preload reports top-document click intent.
It exposes no application bridge and runs without `nodeIntegrationInSubFrames`.
Consequently cross-origin iframe anchors that open another context use managed
website windows, rather than becoming content tabs. Script-created, named and
form-created windows likewise use real Chromium windows. These preserve
Chromium's opener, POST body, window naming and script self-close behavior;
they are not reconstructed by issuing a replacement GET. They share the browser
profile, receive browser policy and remain owned by their opener's native
contents and workbench document. Ordinary website navigation does not add a
Grida rule that force-closes its windows; Chromium retains its normal lifecycle.
Opener destruction/crash and owner teardown end dependent managed windows.
They are not restart-restored.

The limit is 64 content pages per owner, with a separate cap of 64 managed
website windows across the host. Reaching a limit shows a native notice instead
of silently creating an unmanaged window.

Tab switching preserves the connected guest and its live document. Ordinary
navigation, reload and tab closure honor a site's `beforeunload` request through
**Stay / Leave**, defaulting to Stay. Stay preserves the page and tab. Owner
loss, workbench document replacement, window shutdown and full browser reset
force teardown; a website cannot veto those lifecycle operations.

A successful full-document navigation clears an earlier navigation error,
including recovery through Back, Forward or website navigation. A pending or
canceled load, another failure or an iframe navigation does not claim recovery.

Reopening, workbench reload and application restart reconstruct eligible recorded
HTTP(S) URLs with fresh page identities. They do not restore the running
document, its Back/Forward history, form contents or scroll. Moving a tab to
another window reconstructs its address: stock Electron provides no supported
live-guest adoption contract here.

## Agent browser pages

The browser tools can address the exact displayed workbench tab or an
independent background page. Main creates one never-shown window for each
background page. Its fixed sandboxed shell mounts one guest using the same
one-use claim, exact guest registration, browser Session and destination policy
as a workbench tab. Background owners cannot be selected by workbench
presentation. The owner and guest close together on scope loss. Shared browser
data clearing applies to both target kinds.

The browser operation service checks document, frame and viewport identity
before interaction and around capture. Trusted input dispatch is coordinated
inside Main. Native Act and the optional MCP export use the same catalog and
execution results through their captured authority. Website prompts that would
require user interaction are reported as background blockers.
[Browser automation reference](./browser-automation.md) ·
[Tool-host contract](../../crates/grida-agent/docs/tool-host-contract.md)

## Live locations and recorded addresses

Main distinguishes a bounded live location from a persistable destination.
Ordinary website-generated `about:blank`, `about:srcdoc`, `blob:` and `data:`
documents can remain live browser contents. Large data locations are represented
by the display marker `data:`. These observations grant no native authority.

Explicit create/navigate, shared history, saved layouts, reopen/restore,
**Open in default browser** and favicon acquisition retain strict HTTP(S)
validation. Generated locations are transient, are omitted from saved browser
descriptors and history,
and cannot be reopened as recorded addresses. File, executable, credential-bearing
and private application destinations remain refused. A generated document does
not gain an application role by inheriting or displaying a familiar URL.

The current page URL and a focused address edit have separate lifetimes.
Redirects and same-document URL changes update the page location without
replacing typed text or IME composition. Escape restores the latest page URL;
URL changes continue displaying normally when no edit is active.

Website external-app links use a separate Main-owned handoff. A real
top-document `mailto:`, `tel:` or `sms:` anchor click opens the operating system's
chosen handler without an extra Grida prompt. A custom scheme's first trusted
click asks **Open another app?**, defaulting to Cancel; acceptance is remembered
for that actual HTTP(S) origin and scheme during this app session. Scripted
requests and Chromium `openExternal` permission routes with attributable website
context always require native confirmation, even when the same origin/scheme
has saved click consent. Requests without attributable context remain unavailable.
Subframe requests with native requester identity retain that identity; the top-document
helper does not run in every subframe.

URIs are bounded to 8192 bytes and reject whitespace, control characters,
malformed escapes, embedded credentials, private Grida/internal routes, files
and known executable schemes. This does not disable browser web security or
expose application routing. The initiating visible guest, source document and
any identified frame must still be current after confirmation; a stale source
cannot launch an app. Unsupported or unregistered OS handlers can fail while
leaving the website intact. A script-created app-launch window can remain blank
after cancellation or an unavailable OS handler; it remains user-closable.
Permission reset or full browser reset clears the
remembered external-app click consent and cancels pending confirmations.

Browser tabs show a website favicon when available, with a globe fallback.
Icon reads use the isolated browser session without cookies or authentication;
the workbench receives bounded raster data rather than remote loading authority.
Icons are transient and discarded on document changes. Generated documents do
not request favicon enrichment or tab thumbnails.

A deliberate tab hover requests one bounded still thumbnail of an eligible
page. It does not select, show or wake a hidden page. Capture waits at most
1.5 seconds and may return no image, particularly for a hidden guest. At most
one underlying capture per owner remains in flight. Images can be stale, remain
transient and never start a capture stream.

## Page tools and native interaction

The **…** menu provides Find in page, page zoom, Print, Inspect page, Open in
default browser and Clear browsing data. The optional version1 `utilities`
contract targets the exact admitted attachment/page. It accepts bounded find
text and zoom factors from 0.25 to 5, opens Chromium's ordinary print UI, and
opens detached DevTools for that website. It exposes no arbitrary script or
remote debugger transport to the hosted renderer.

Find reports match count and active match, supports next/previous and case
matching in content tabs, and clears its selection when closed. A managed
website window has its own native find form with Next, Previous and Done.
Navigation or teardown invalidates pending searches. Page zoom is distinct from
workbench zoom; it follows Chromium's zoom behavior and is not a separately
persisted Grida preference.

The actual guest's native context menu offers HTTP(S) link opening in foreground
or background tabs and in the default browser. Editable content gets ordinary
undo/redo, cut/copy/paste and Select All; selected noneditable text gets Copy.
Find, Reload, Print, zoom controls and Inspect Element operate on that guest,
including a managed website window. Native page shortcuts route to those tools;
selected workbench shortcuts still reach the owning workbench. Website editing
and IME behavior require platform interaction verification.

Ordinary `alert()` and `confirm()` use Electron's dialogs with `safeDialogs`
enabled for repeated-dialog handling. Electron 42.2 does not implement
`window.prompt()`; this runtime limitation is not a Grida permission denial.

## Website permissions, authentication and development TLS

`BrowserSitePolicy` installs only on the dedicated browser Session and registers
actual admitted guest objects and their live native parent. Ordinary active-page
clipboard writes, fullscreen and pointer lock do not add a consent dialog.
Clipboard reads, camera, microphone, location and notifications use native
website consent. Camera and microphone also retain macOS system consent; the
packaged usage descriptions and entitlements do not bypass an OS denial.

Site allow/block decisions are bounded, held in memory for this app lifetime,
and shared across tabs in the browser Session. Where Electron identifies the
requesting frame, labels and decisions use its actual security origin and
embedding origin, including inherited origins of generated documents. Opaque
origins and ambiguous duplicate-frame matches are refused. A null-WebContents
permission check can consume an existing known origin grant; it cannot prompt
or acquire active-page privileges. Async prompts recheck guest, owner, frame,
origin and navigation identity before granting access. Unknown permissions are
denied.

Screen capture requires an actual screen/window selection from
`desktopCapturer`; the first source is never chosen automatically. This chooser
provides video only, with no system audio. USB, HID, serial and Bluetooth use
native device-selection events and the selected actual device ID. Bluetooth
can wait briefly for discovery instead of selecting the first device. The
pinned runtime supplies sparse requester identity for serial and Bluetooth, so
the dialog identifies the containing page without claiming universal subframe
scoping. USB/HID selection has a requesting frame. Windows/Linux Bluetooth
pairing requiring a PIN or additional validation has no custom pairing handler.
Availability still depends on hardware, Chromium and the operating system.
Bluetooth-backed serial ports can remain unavailable: the pinned chooser omits
the native Bluetooth path needed to match its permission check. Display names
are not used as substitute device identities.

Chooser identifiers are used only to select the actual device. Remembered
USB/HID/serial grants use type-specific metadata available again during permission
checks; incomplete identities are not remembered. A site's USB forget operation
also removes its matching remembered grant. Electron can retain native ephemeral
device grants outside this policy: after accepting a USB, HID or serial choice,
permission reset continues to require a Desktop restart for complete revocation.
Reset starts reloading live pages as soon as it clears consent, even if Settings
closes or connection cleanup fails. A main-frame document commit confirms that
the page was replaced. Main forces a close if reload throws or no new document
commits within two seconds. Reset reports failure if destruction is still
unconfirmed two seconds after that close request.

File System Access uses Chromium's selected file/folder handles and confirms
that exact path and read/write scope. Workspace attachment and private native
paths are never inherited as website grants. Restricted-directory overrides
remain unavailable: Electron 42.2's restricted-path event lacks an initiating
frame/WebContents identity.

HTTP authentication uses a native credential form for the actual site origin;
a proxy challenge identifies its actual host and port. Navigation or owner loss
cancels pending authentication. Credentials go to Chromium's challenge callback,
not the hosted renderer or application account store.
Authentication and managed-window Find forms reuse bounded isolated session
slots after storage cleanup. Find submissions receive a local HTTP 204 response,
so Next, Previous and a new query retain the same script-free form document.

A certificate error can show an explicit native trust choice for the exact
hostname and certificate. The displayed SHA-256 fingerprint is the X.509 DER
fingerprint. Exceptions apply only to the browser Session, never account or
provider networking. There is no global certificate-ignore switch or disabled
web security. Exceptions are memory-only. Reset clears the saved exception and
closes connections, but Chromium can cache accepted verification results: a
Grida restart is required to guarantee cached trust ends. Once an exception has
been accepted, repeated resets continue to report that restart requirement.

## Shared storage, history and clearing

All browser tabs and managed website windows use one persistent browser profile
across workspaces and windows. Website cookies, sign-ins and storage are shared.
Closing a page/window or changing the Desktop account does not clear them.
Ownership governs page operations, independently of profile storage. There are
no workspace profiles or private-page modes. Desktop sign-in and provider
sessions remain separate.

History is a Main-owned collection of at most 500 unique HTTP(S) addresses in a
bounded 2 MiB private file. Actual successful main-frame commits record URL,
title and visit time. Failed loads, subframes, generated locations and typed-only
text are not visits. Managed website windows can also record eligible visits.
Local title/URL matches populate address suggestions; explicit selection
navigates. Settings searches and removes the same shared history.

The optional `history` group negotiates version1 independently. Queries/removals
require the current admitted workspace or Settings top-level document, not a
page attachment. Revision-only invalidations prompt bounded rereads. Queries
return at most 100 matches; the address control requests 8 and Settings 100.
Atomic owner-only writes, bounded no-follow reads and ordered removal/clear
barriers protect the native store. Removing a visit leaves its page and website
state intact; a delayed title change cannot recreate it, while a genuine revisit
can.

The optional version1 `management` group separates browser maintenance:

| Action                    | Effect on open pages and shared data                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clear history             | Removes recorded visits; leaves pages, website sign-ins and cache intact.                                                                                                                                |
| Clear cache               | Clears HTTP cache; leaves pages, history and website sign-ins intact.                                                                                                                                    |
| Reset website permissions | Clears remembered choices and ends active captures by reloading or closing pages. OS grants remain separate. Native device grants and cached certificate trust can require restart.                      |
| Clear browsing data       | Native-confirmed all-windows reset: closes every browser tab/window, cancels accepted downloads, and clears history, website storage, cache, connections, authentication and remembered website choices. |

Permission-reset reloads override `beforeunload`; they can discard unsaved form
input. Full clearing blocks competing browser admission/work, drains teardown
and prevents queued history writes from restoring old data. Its confirmation
defaults to Cancel and rechecks the exact initiating document after the wait.
The toolbar and Settings invoke the same full reset, without a profile/workspace
selector. Settings requires no open workspace. Desktop sign-in, provider
credentials, workspace files and already saved downloads are unaffected.

Recognized experimental browser partitions are cleaned only by explicit full
clearing. Their cookies are not merged into the shared profile, and account or
provider partitions are never cleared by browser maintenance.

## Downloads

Downloads normally save to the operating system Downloads directory, or the
browser-wide folder selected through a native directory chooser in Settings.
**Ask where to save each file** optionally enables a save dialog per download.
Default saving sanitizes website filenames and reserves a collision-free name;
it does not overwrite an existing file merely because the website supplied the
same name. A failed destination reports an error and directs the person to
choose a writable folder.

The folder path and preference document stay private to Main; the renderer gets
only a display basename and the ask-before-download choice. No website or bridge
request supplies a filesystem destination. Admission checks the live website
before accepting the native job. Once accepted, that job can outlive tab closure
while Grida remains running. Pending destination selection still requires its
live owner. Full browser reset cancels retained jobs. Downloads are never opened
or executed automatically, and this feature makes no malware-scanning claim.

## Architecture and rollout

Browser protocol **4**, with `presentation: "webview"`, is independent of the
Desktop bridge protocol. The hosted renderer requires the native browser
capability, exact version4 and supported presentation before issuing calls.
Older hosts display an update requirement while preserving saved browser URLs;
they are not sent v4 calls or silently mapped to an older scoped reset.
Optional history, utilities and management groups have their own version1 gates.

This work requires a native Desktop release. The current package version is
0.1.1; it has not been published for this implementation. Hosted JavaScript
does not update installed Electron builds. A compatible hosted renderer can
ship first because its exact gate withholds unsupported behavior until the
native host is installed.

Main allocates attachment and page identities. `reserveMount` returns a one-use
opaque `about:blank` bootstrap for the exact shell document, attachment and page.
The global attachment guard rejects unknown guests, discards supplied
preferences/preloads, forces the isolated Session and security preferences, and
suppresses automatic source loading. The actual created object must match
`did-attach-webview` before website load. Only the fixed private browser click
preload is approved; the application preload and its arguments are never used.
`Page.mounted` acknowledges actual registration.

`WorkspaceBrowserSession` retains document-owned tab state and
`BrowserGuestMounts` retains connected DOM nodes. React owns chrome and
presentation-slot leases. Remounting chrome, selecting tabs and moving a slot
never rewrites `src` or reparents a guest through a React-owned subtree.
Inactive wrappers are hidden and inert, with focus returned to an actual shell
element before hiding. Main also rejects inactive-page input commands. An
absent slot is hidden before DOM removal.

The connected layer uses CSS anchors to the non-scrolling content frame and
shared border/radius tokens. Layout, zoom and clipping use DOM/CSS, without
native rectangle synchronization, overlay classification or frozen placeholders.
Menus and modal backdrops compose above the visibly live page with ordinary
stacking, focus and pointer-locking primitives. Arbitrary future scrolling or
transformed hosts require revised presentation evidence.

Main requests `backgroundThrottling: true`. Grida does not pause media or
synthesize visibility changes on tab switches. Hidden animation cadence varies
with Chromium/platform scheduling; visible animation beneath controls must keep
advancing.

## Isolation, recovery and verification

Guests retain sandboxing, context isolation, disabled Node integration in pages,
subframes and workers, disabled nested webviews, and enabled web security.
They receive no application bridge, account Session, provider transport or
private workspace protocol. Visiting a Desktop URL grants no native role.
Actual shell/frame identity, registered workspace, attachment and page ownership
remain the admission evidence.
Native application-menu classification also requires the actual editor origin
and account Session, so a website window visiting a Desktop URL does not receive
workbench menu commands. Normal URL drag/drop navigation remains available in
website guests/windows; private native authentication/find forms disable it.

The hosted workbench is a trusted embedder. Stock webview APIs intrinsically
permit own-guest scripting and navigation; the typed bridge does not remove
that authority. `javascript:` may execute without a document request. Native
request/navigation guards and asynchronous containment of forbidden documents
are not a universal preexecution barrier against trusted embedder scripting.
Generated browser documents remain sandboxed website content. Human DevTools
inspects the selected guest. The [browser tools](#agent-browser-pages) use
their captured workbench lease for automation.

Guest failure leaves a recoverable tab without taking down the workbench.
Retry reloads a living guest or mounts a replacement after destruction. Owner
reload/crash/role withdrawal ends its guests and managed windows, while shared
website storage survives. Delayed mounts, reads and commands cannot resurrect a
closed page. An ambiguous consumed mount keeps a fail-closed tombstone until
its shell is destroyed; close/reopen the window rather than reusing that slot.

Run bridge tests/build/typecheck, Desktop tests/typecheck and editor typecheck.
Headless tests establish contracts and adapters, not actual workbench composition,
OS permission behavior, hardware access, printing, keyboard routing or IME.
The opt-in fixture uses stock Electron, a disposable profile and mock Keychain:

```sh
GRIDA_DESKTOP_TEST_ELECTRON=1 pnpm --dir desktop exec vitest run src/main/browser-host.electron.test.ts
```

Actual workbench checks use local Supabase with insiders authentication and a
disposable Desktop profile. Exercise controlled pages, real menus/modals,
advancing video, layout/zoom/clipping, focus, navigation, generated documents,
managed windows and cleanup. Manual cases remain **untested** until run:
[composition](../../test/desktop-browser-native-composition.md),
[continuity](../../test/desktop-browser-navigation-continuity.md),
[isolation](../../test/desktop-browser-session-isolation.md),
[previews](../../test/desktop-browser-tab-preview.md),
[Settings](../../test/desktop-browser-settings.md),
[history](../../test/desktop-browser-history-suggestions.md),
[links/windows](../../test/desktop-browser-links-popups.md),
[permissions](../../test/desktop-browser-permissions.md),
[page tools](../../test/desktop-browser-page-tools.md),
[downloads](../../test/desktop-browser-downloads.md),
[HTTP authentication](../../test/desktop-browser-http-authentication.md) and
[development TLS](../../test/desktop-browser-development-certificates.md).

Native CDP checks must separately establish evaluation, screenshots and input on
the registered guest. An earlier stock Electron42.2/Playwright1.58 probe found
raw `type: "webview"` targets while ordinary `context.pages()` exposed only the
shell. Target discovery alone establishes neither a normal Playwright Page
adapter nor effective DOM input focus.

Use a full workbench reload after editing lifetime-owner modules: Fast Refresh
is not a live-guest adoption contract. Electron
[warns that webview architecture and availability can change](https://www.electronjs.org/docs/latest/tutorial/web-embeds).
Repeat attachment, lifetime, composition, focus and CDP checks on upgrades.
Record each tested OS and input method separately; macOS evidence does not
verify Linux/Windows, and no rendering-speed advantage over native views is
claimed.
