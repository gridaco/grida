---
title: Built-in browser
description: Ownership, isolation, lifetime and presentation contracts for browser pages inside Grida Desktop.
keywords: [desktop, browser, web pages, isolation, navigation]
format: md
tags: [internal, wg, desktop]
---

# Built-in browser

Desktop can present web pages beside documents in a workspace. A page is an
ordinary browser document with its own navigation and website state. Its
existence does not depend on a conversation, model, workflow or page-specific
protocol.

This contract separates the browser host from its presentation. The host owns
the page and its authority; the workbench requests placement and presents
navigation controls. A page cannot acquire application authority by navigating
to an application URL.

## Vocabulary

| Term       | Meaning                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------- |
| Page       | One host-owned browser document and its live navigation state.                           |
| Owner      | The admitted workbench window and workspace that contain a page.                         |
| Attachment | An opaque authorization identity for one owner's current top-level document generation.  |
| Profile    | A browser storage scope, independent of the application's account and provider sessions. |
| Viewport   | The rectangle in the workbench reserved for a visible page.                              |

## Ownership and lifetime

The host allocates page and attachment identities. The caller cannot choose
another owner, a session partition or browser security preferences. Every page
operation validates the current attachment and page ownership before effect.
Frame identity is authoritative; a matching URL alone does not grant authority.

Selecting another tab hides the page without ending its document. Closing the
tab ends the page. Closing the owning window or withdrawing its application
role ends all of its pages and revokes its attachments. Renderer replacement
invalidates the old attachment and hides live pages. An admitted replacement
may attach again, recover the host snapshot and lay them out before showing
them. Delayed messages from the previous attachment have no effect.
A navigation already in progress when the host attaches does not exempt its
eventual document replacement from these lifetime rules.

An application restart restores only eligible tab descriptors and last recorded
URLs. It does not restore navigation history, scroll position, form state or
in-memory documents. Persistent website storage has a separate lifetime from
the tab descriptor.

## Navigation and isolation

User navigation admits absolute HTTP and HTTPS URLs, including local development
servers. URL credentials and executable, file and private application schemes
are refused. Direct navigation, links and redirects follow the host's policy.
An external-browser action uses the page's authoritative current URL.

Pages run in sandboxed, context-isolated browser contexts with no Node access,
application preload, application bridge, account cookie jar or provider
transport. Browser policy is installed before the first document load. The
application's own navigation restrictions remain independent of page policy.

The initial browser denies unmanaged popup windows, sensitive site permissions,
HTTP authentication and JavaScript dialogs. It honors the browser engine's
certificate verdict without trust overrides. A site may receive files only
through an explicit user file selection. Each download requires a user-selected
save destination; completion does not execute or open the file.

## Profiles

The persistent profile belongs to a workspace. Ephemeral pages receive their
own non-persistent profile. Neither scope shares the Desktop account profile or
the provider networking profile. Clearing a scope ends affected live pages
before removing website storage and permission state. Clearing one workspace
does not affect another workspace or the application account.

The application Settings surface may clear one selected registered
workspace's website data after native confirmation. This management operation
does not grant page attachment or control authority to Settings. The host
revalidates the exact Settings document and selected workspace before
beginning the shared clearing operation.

## Native presentation

The workbench reserves a rectangular viewport below browser chrome. Geometry is
expressed in workbench CSS pixels; the host applies its authoritative zoom,
rounding and window clipping. Invalid, stale or out-of-window layouts cannot
expose a page outside the owning window's content area. Pages start hidden at
valid on-screen bounds and become visible only after an accepted layout.

The owning frame's resolved inner corner radius is shared by the DOM page
viewport and the native page. Border thickness is accounted for before the
host scales the radius with its authoritative zoom. Radius changes are layout
changes even when the viewport rectangle stays unchanged. The page viewport
has a uniform radius at all four corners; native clipping does not crop or
offset the website's content.

The native page layer appears above workbench HTML. A workbench overlay that
intersects a viewport therefore hides the page and displays a neutral
placeholder. Closing the overlay restores the page at the latest accepted
bounds. Dragged or transformed containers likewise hide their pages. This
behavior requires no periodic capture.

A deliberate tab hover may request a bounded image of that page's last
rendered viewport. This is a still preview: hidden pages are neither shown nor
focused to obtain it, and it may lag behind the current document. If no image
is available, the card shows page metadata. Image bytes remain transient
presentation data and are discarded when the preview closes. Hovering does
not start a capture stream or select the page.

Focus combines page focus and owning-window focus. Hiding a focused page first
returns focus to the workbench. Selected application commands remain available
while a page has focus; ordinary editing and text composition stay with the
page. Reloading a page and reloading the workbench are distinct operations.

## Observation and recovery

The host exposes bounded navigation outcomes: page identity, URL, title,
loading, back/forward availability, focus and failure. Metadata from websites
is untrusted display data. A monotonic revision orders snapshots and changes;
an observation gap requires a fresh snapshot rather than guessed state.

Page failure does not take down the workbench. The user can retry navigation or
close the tab. Page teardown removes native views, closes their browser
contents and releases listeners. A closed page cannot later reappear from a
delayed event.

## Boundary

This contract provides page hosting and presentation. It grants no page-script
execution, debugger access, content inspection or automated interaction.
Additional callers and protocols must define their own admission and authority
without changing the meaning of page ownership or profile isolation.

The concrete binding and verification instructions live in the
[Desktop browser reference](https://github.com/gridaco/grida/blob/main/desktop/docs/browser.md).
