# Desktop browser

This reference is for contributors implementing or verifying Desktop browser
pages. The [browser contract](https://grida.co/docs/wg/desktop/browser) owns the
behavior model. Browser pages are independent of native chat and can be used
with `--disable-agent`.

## Use

Open a workspace and use the content-tab **+** button to open Quick Start,
then choose **Open Browser**. The native application menu also offers
**Open Browser** directly. Enter an HTTP(S) address, including a local development
server. The browser toolbar provides navigation and reload/stop. Its **…**
menu contains **Open in default browser** and **Clear workspace browser data…**.
Browser tabs share the content area with workspace documents.

Choosing **Open Browser** on Quick Start replaces that tab at its existing
position. Other open tabs retain their order and live state.

Hover a browser tab to see its title, address and a small image of its last
rendered viewport when available. The preview does not select the tab, and a
hidden page is not shown to obtain the image. It is a still image and may be
stale; a page that has not rendered yet shows only its metadata.

Switching tabs keeps the live page. Closing a tab closes its native contents.
Reopening a closed browser tab starts a new page at its recorded address.
Restart restoration remembers addresses and tab placement, not form contents,
navigation history or scroll position. Ephemeral pages are not restored.

Website cookies and other storage are separate from the Desktop sign-in
session. Persistent browser storage is workspace-scoped. Clearing it closes
affected pages before clearing their storage. Choose **… → Clear workspace
browser data…**; the native confirmation defaults to Cancel.

The **Browser** category in application Settings provides the same cleanup
for a selected workspace. Choose the workspace and **Clear cookies and site
data…**, then confirm in the native dialog. This closes its live browser tabs
and clears cookies, site storage, cache and HTTP authentication. Tab-address
restoration and downloaded files have separate lifetimes.

## Initial website support

Ordinary HTTP(S) navigation is supported. Browser pages have no application
bridge, Node integration or private workspace protocol. File, script and
private application URL navigation is refused. A guest visiting a Desktop URL
remains an ordinary isolated page.

Unmanaged popups, JavaScript dialogs, HTTP authentication and sensitive site
permissions are unavailable. Certificate errors remain errors. File uploads
use explicit user selection. Downloads require a native save destination and
are never opened automatically. Sites that require a disabled browser feature
can be opened in the system browser.

## Bridge

The optional `browser` namespace and native browser capability must both be
present. Its version is independent of the existing Desktop bridge protocol.
Older installed Desktop builds omit the feature; the hosted renderer must
withhold browser actions on those builds.

The shared `DesktopBrowser` contract in `@grida/desktop-bridge` defines:

- An attachment issued for an admitted workspace and exact top-level owner
  document. Attachment IDs are opaque and are not credentials for other
  bridge namespaces.
- Create and purpose-specific navigation, focus, visibility and lifecycle
  operations. Callers cannot set session partition names or web preferences.
- Snapshot and change observations ordered by an owner revision. Subscribe
  before reading; replace uncertain observations with a snapshot after a gap.
- Bounded page metadata. Render titles as text; never interpret website
  metadata as trusted markup or application commands.
- An optional bounded viewport thumbnail operation. Older browser-capable
  builds may omit it; their tab previews show metadata. Images are requested
  only for the current hover preview and are not persisted. The result is a
  JPEG at most 320 by 180 pixels and 64 KiB; callers cannot choose capture
  options or output paths.
- An optional Settings-only workspace-data clearing operation. Main resolves
  the registered workspace and names it in a native confirmation. Cancellation
  returns false; true means the shared cleanup completed. Existing page
  operations still require a workspace attachment and cannot run in Settings.

Layout rectangles use CSS pixels relative to the owning window's content area.
Main obtains the shell zoom factor and clips native bounds itself. Layout
sequences reject delayed updates. Visibility is explicit; hiding a DOM
container alone cannot hide a native view. A zero-sized inactive slot hides
the native page while preserving its last real viewport dimensions.

`Layout.borderRadius` carries the uniform page radius in CSS pixels. The
renderer derives it from the content frame's computed CSS and border widths,
then uses the same value for the DOM viewport. Main scales it with shell zoom,
clamps it to the page's dimensions and applies it directly to the browser view.
Main contains no duplicated styling constant. An omitted radius means zero.
The native cutout still has a rectangular input area within the page viewport.

## Native layering

The existing `BrowserWindow` remains the shell. Each page is a child
`WebContentsView`. It starts hidden at on-screen bounds and is shown after an
accepted layout. Closing a page explicitly removes the view and closes its
`webContents`.

The radius applies to the browser view itself. A rounded ancestor `View` does
not clip its native browser child on macOS. Likewise, a `BrowserWindow` page
capture excludes native child contents and cannot prove their corner clipping;
inspect the actual application window for that check.

Workbench HTML cannot paint above these views. Intersecting shell overlays and
drag transitions hide the page and show a neutral placeholder. Occlusion does
not capture screenshots; a deliberate tab hover separately requests one small
page image for display in the hosted renderer. A focused
page returns focus to the shell before being hidden. Application command
routing and website text input have separate handling.

## Verification

Run the bridge package build, tests and typecheck, Desktop tests and typecheck,
and editor typecheck. Browser controller and workspace continuity tests belong
beside their renderer modules. Native host ownership and policy checks belong
beside the native host. Real Electron composition tests must explicitly opt in
to starting Electron.

```sh
GRIDA_DESKTOP_TEST_ELECTRON=1 pnpm --dir desktop exec vitest run src/main/browser-host.electron.test.ts
```

The Electron fixture uses a disposable profile and Chromium's mock keychain,
so synthetic browser tests do not request access to the person's macOS
Keychain. The production application keeps its normal Chromium storage policy.

For interaction verification, use local Supabase with insiders authentication
and a disposable Desktop profile. Use a controlled HTTP server containing
navigation, forms, redirects and frame-refusing pages. Exercise the actual
Desktop workbench rather than substituting an iframe in a web browser.

The manual interaction cases cover [native composition](../../test/desktop-browser-native-composition.md),
[navigation continuity](../../test/desktop-browser-navigation-continuity.md) and
[session isolation](../../test/desktop-browser-session-isolation.md), plus
[tab previews](../../test/desktop-browser-tab-preview.md) and
[browser Settings](../../test/desktop-browser-settings.md).
Platform execution evidence is distinct from unit tests; a macOS run does not
verify Linux or Windows behavior.
