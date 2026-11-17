---
title: Built-in browser
description: Browse and search the web in Grida Desktop, find recently visited pages, and manage shared history and website data.
keywords: [Grida Desktop, built-in browser, search, browser history, localhost]
sidebar_position: 1
tags: [user-facing, desktop]
format: md
doc_tasks:
  - translate
---

# Built-in browser

Open websites and local web apps in a content tab alongside your files in
Grida Desktop. Browser tabs work independently of chat, and you interact with
the page directly.

Availability depends on your installed Desktop build. If a browser tab asks
you to update Desktop, update and restart the app. The built-in browser is
available only in Desktop.

## Open a browser tab

1. Open a workspace in Grida Desktop.
2. Select **+** in the content tab bar to open **Quick Start**.
3. Select **Open Browser**. The browser replaces Quick Start in the same tab.
4. Use **Search or enter URL** to enter a website address or search the web,
   then press **Enter**.

You can also choose **File → New Tab** from the application menu or press
**Command+T** on macOS (**Ctrl+T** on Windows and Linux) to open Quick Start,
then choose **Open Browser**.

For a local web app, start its development server first, then enter its
address, for example `http://localhost:3000`. The browser accepts HTTP and
HTTPS addresses. You can enter a hostname such as `example.com` or
`localhost:3000` without the scheme.

Ordinary new-tab links open beside their source tab. Modified clicks can open a
background tab. Scripted login popups and named windows open in managed website
windows so the site's normal login and close behavior can work. Links inside
cross-origin frames may also open in those windows.

Pages your app generates with `blob:` or `about:blank` can open normally. These
previews belong to the current session and are not restored after restarting.

## Search and find recent pages

Enter a search phrase, such as `web typography examples`, to search Google.
Typing alone does not send a search request: Google opens when you submit a
search.

Focus the address bar to see recent pages. As you type, suggestions match the
titles and addresses in your built-in browser history. Use **↑** and **↓** to
choose a suggestion and **Enter** to open it, or select it with the pointer.
Choose the Google search action to search for the text you entered.

History suggestions come from pages you visited in Grida's built-in browser,
across all workspaces and windows. Your regular browser's history is separate.
Use the remove button beside a history suggestion to forget that page.

## Navigate and preview tabs

Use **Back** and **Forward** to move through the current tab's history.
**Reload page** becomes **Stop loading** while a page loads. Select the
address bar to change the URL.

Tabs show the page title and the website's icon when available. A globe
appears when an icon is unavailable. Hover over a tab to see its title,
hostname and, when available, a thumbnail. Thumbnails are still previews and
may show an earlier page state.

Switching tabs or resizing workbench panes keeps the open page and its form
contents. Workbench menus and dialogs can appear above a live page. A hidden
tab may continue playing audio; close it to stop its page.

If a website asks you to stay before closing its tab, **Stay** keeps the live
page and its form contents. Closing the workspace window, reloading the
workbench or resetting browser data still ends its pages.

### Find, zoom, print and inspect

Open the browser's **…** menu for **Find in page**, zoom controls, **Print** or
**Inspect page**. You can also right-click the page for its browser context menu.
These commands apply to the website you are viewing. **Inspect page** opens its
DevTools.

### Keyboard shortcuts

While a browser page has focus:

| Action                | macOS                 | Windows / Linux |
| --------------------- | --------------------- | --------------- |
| Open Quick Start      | Command+T             | Ctrl+T          |
| Focus the address bar | Command+L             | Ctrl+L          |
| Reload the page       | Command+R             | Ctrl+R          |
| Close the current tab | Command+W             | Ctrl+W          |
| Find in page          | Command+F             | Ctrl+F          |
| Zoom in / out         | Command++ / Command+- | Ctrl++ / Ctrl+- |
| Reset page zoom       | Command+0             | Ctrl+0          |
| Print                 | Command+P             | Ctrl+P          |

Press **Escape** while editing the address to discard your changes and
return to the page.

## Website sign-ins and data

All built-in browser tabs share one browser profile across workspaces and
windows. Sign in to a website once to use that sign-in in other browser tabs.
Closing a tab leaves website cookies and storage intact. Saved website data
can persist after Desktop restarts; websites determine when you need to sign
in again.

This profile is separate from your default browser, your Grida account and
your AI provider connections. Sign in to websites directly in the built-in
browser. Changing your Grida account does not clear website sign-ins.

### Clear browsing data

1. Open **Settings → Browser**.
2. Select **Clear browsing data…**.
3. Confirm in the dialog to close every built-in browser tab in all windows
   and remove browsing history, website sign-ins, cookies, site storage and
   cache.

You can also choose **… → Clear browsing data…** in any browser tab. Both
actions clear the same shared data; no workspace selection is needed.

Clearing browser data leaves your Grida sign-in, provider connections,
workspace files and downloaded files intact. Choose **Cancel** in the
confirmation dialog to keep the tabs and data.

### Manage browsing history

Open **Settings → Browser → History** to view recent pages or search by title
or address. Remove an entry to forget that address across all workspaces and
windows. Removing a history entry leaves its open page and website sign-in
intact. Visiting the page again can add it to history again.

Select a history title to open it in an existing workspace's browser. If no
workspace is open, open one first. **Clear history** removes the shared history
while keeping your tabs and website sign-ins. **Clear cache** removes cached
responses without clearing history or signing you out.

History keeps up to 500 recent page addresses on this device and remains
available after restarting Desktop. **Clear browsing data…** clears the shared
history along with website data. Update Desktop if the browser, history or
page controls show an update requirement.

## Downloads and uploads

Downloads save to your system Downloads folder by default. In
**Settings → Browser → Downloads**, choose another location or enable
**Ask where to save each download**. Existing files are kept; another download
with the same name receives a different filename.

Accepted downloads continue when their tab closes while Desktop remains
running. Files are not opened automatically. Clearing browsing data does not
delete files you have saved.

Use a website's file picker to select a file for upload.

## Website permissions and development HTTPS

Fullscreen, normal clipboard writes and pointer lock are available while you
use a page. Websites can request camera, microphone, location, notifications,
clipboard reading and other supported permissions through a browser prompt.
Screen sharing and device access use a chooser. Permission choices are shared
for this Desktop session, with the requesting site shown in the prompt.

Use **Settings → Browser → Reset permissions** to clear those choices and stop
active access. Open pages reload, and pages that stall during reload close.
Finish any unsaved work first.
If you selected a USB, HID or serial device, restart Desktop when prompted to
fully revoke its browser grant. Electron can retain that grant until restart.

For a development server with a self-signed certificate, the browser offers a
session-only exception for that host and certificate. Other sites continue to
use normal certificate validation. Restart Desktop to fully reset exceptions;
Chromium can retain an accepted certificate in its cache after a reset.

Website HTTP authentication opens a sign-in form naming the challenged site
or proxy. It uses the credentials you enter there and keeps them separate from
your Grida account and AI provider connections.

Website alerts, confirmations and ordinary tab Leave/Stay warnings are enabled.
Some runtime features remain unavailable: Electron 42 does not support
`prompt()` dialogs, screen sharing currently supplies video without system
audio, and some device pairing or protected-directory requests are unsupported.
Some Bluetooth serial devices are also unsupported.

Mail, telephone and SMS links can open their apps on your computer. Other app
links ask before opening. An accepted choice for a site's app links lasts for
this Desktop session; scripted requests still ask. Grida's private protocols
and direct local-file or executable links are unavailable to websites.
If a site opens a separate app-launch window, cancelling or an unavailable OS
handler can leave that window blank. You can close it.

## Open a page in your default browser

Choose **… → Open in default browser** to open the current address in your
system browser. Its own sign-in state applies; an active website session in
Grida is not transferred.

Use this option when a website requires a runtime feature or sign-in provider
that does not work in an embedded browser.

## Restore tabs and recover a page

Desktop remembers browser addresses with your workspace's tab layout. After
reopening a workspace or restarting Desktop, restored tabs load those
addresses as new pages. They do not restore navigation history, unsaved form
contents or scroll position. Closing a tab ends its running page.

If a page fails, choose **Try again** or **Reload page**. For a local app,
check that its development server is still running and that the address and
port match. If a website's sign-in or another workflow cannot complete, try
**Open in default browser**.
