---
title: Resource loading
description: How the desktop renderer obtains host-owned resource bytes (workspace files — text, images, video) — the buffered-vs-streamed transport model, the privileged media scheme, and why the host proxies rather than handing the renderer or main process its own file authority.
keywords:
  [
    desktop,
    electron,
    renderer,
    resource-loading,
    streaming,
    range,
    csp,
    grida-sec-004,
  ]
format: md
tags:
  - internal
  - wg
  - desktop
---

# Resource loading

> **Status: V1 in place.** Buffered reads are committed; the streamed
> media transport is committed for images and video. More streamed
> resource kinds may follow.

The desktop renderer is a web origin — it runs the same `grida.co/desktop/*`
app a browser would (see [renderer bridge](./renderer-bridge.md)). But the
resources it must display — a workspace's source files, images, and video —
live on local disk, **outside any web origin** and behind the host's trust
boundary. This page is about the one question that creates: how do those
bytes cross from disk into an `<img>`, a `<video>`, or a text view, without
handing the renderer the filesystem?

This is a distinct concern from the [capability bridge](./renderer-bridge.md).
That bridge is how the renderer _invokes_ host capabilities (open a folder,
write a file, read a directory) — request/response over `window.grida`.
Resource loading is how the renderer _streams host-owned bytes_ into a media
element. Different mechanism, different constraints, different doc.

## The two delivery shapes

A host-owned resource reaches the renderer in one of two shapes.

**Buffered (opaque).** The host reads the whole resource and returns it as a
single encoded payload that the renderer inlines — for text, the decoded
string; for binary, a base64 `data:` URL. Simple and self-contained: one
request, one response, no second origin. Its costs are intrinsic to inlining:
the entire resource (plus ~33% base64 overhead, for binary) is resident in
renderer memory at once, it is **capped** to bound that memory, and it is not
seekable. Right for small, opaque reads — source text, a thumbnail — and for
hosts that cannot offer the streamed shape (see [Non-desktop hosts](#non-desktop-hosts)).

**Streamed.** The renderer references the resource by a **URL the host serves
incrementally**; the browser's image/video decoder pulls bytes the same way it
would over the network. Nothing is ever fully buffered, so it is
**size-independent**, runs in **constant memory**, and supports **HTTP Range**
— which is what makes video seeking work. Right for media, where resources are
routinely larger than any buffered cap and seeking is expected.

## Why not inline everything

Inlining is the obvious first design, and it has a hard ceiling. Inlining a
resource means the whole file plus encoding overhead sits in renderer memory as
a single value, so the host must cap the size to keep a large file from
exhausting memory — and that cap rejects ordinary photos and essentially all
video. There is no Range, so a video cannot seek. The buffered shape is not a
smaller version of the streamed shape; it is a different shape with a ceiling
the streamed shape does not have.

The streamed shape is the same one the web platform already uses: an
`<img src>` or `<video src>` over the network is never inlined — the decoder
streams it. Streaming host-local resources brings them to parity with that, and
removes the ceiling because nothing is ever fully resident.

## The streamed transport: a privileged scheme

Streaming requires the renderer to name a resource as a URL the host can serve.
The host registers a **privileged URL scheme** for this; the renderer points a
media element's `src` at a host URL that addresses a resource by _(workspace,
relative path)_; the host resolves that URL by serving the bytes — honoring a
`Range` request for partial reads.

**Desktop binding.** The scheme is `grida-workspace:`. Its authority is a fixed,
data-less literal; both the workspace id and the relative path live in the URL
path (so authority canonicalization cannot corrupt the id). It is registered in
the Electron main process as a privileged, streaming scheme. The renderer never
constructs raw filesystem paths — only this opaque resource URL.

## Proxy, not new authority

The streamed transport grants **no new filesystem authority** to anyone.

- **Containment stays single-sourced.** The privileged-scheme handler does not
  read disk itself; it **proxies** to the same host perimeter (see
  [process model](./process-model.md)) that already serves buffered reads. The
  workspace-relative path resolution and its symlink/realpath guard live in one
  place and run identically for every read, agent or human. The scheme is a
  _transport_ for an already-exposed capability, not a new file-read origin.
- **Reads are pinned to the validated resource.** Containment is checked once,
  then the read is bound to the validated file — opened so it cannot follow a
  symlink swapped in after the check, and the bytes served come from the
  inode that was validated, not whatever later occupies the path. This matters
  because the streamed read is uncapped: it must not be coaxed into streaming an
  out-of-workspace target.
- **The credential never reaches the renderer.** The host serves resources
  behind the same authenticated perimeter as every other capability; the
  privileged-scheme handler injects that credential. The renderer holds no
  token, and the scheme carries no userinfo.
- **CSP admits the scheme narrowly.** The `/desktop/*` policy allows the scheme
  only in image and media fetch contexts — never as script, document, or
  connect. It is an explicit, scoped admission, not a blanket policy bypass.

## Trust boundary

A streamed resource origin is renderer-reachable file-read, so it lives under
the same trust boundary as every other host capability —
[`GRIDA-SEC-004`](https://github.com/gridaco/grida/blob/main/SECURITY.md). The
invariants above are what keep it inside that boundary: no new reachable root,
containment single-sourced, the credential never in the renderer. The uncapped
streamed read is safe precisely because streaming is constant-memory — the cap
that bounds buffered reads exists only to bound _their_ resident size, and does
not apply.

## Non-desktop hosts

A host that cannot register a privileged scheme — a plain browser talking to a
loopback daemon, for instance — has no streamed transport available. It falls
back to the **buffered** shape, with its cap. The renderer selects transport by
asking the host for a streamable resource URL: when the host offers one
(desktop), the renderer streams; when it does not, the renderer inlines the
buffered read. The model therefore **degrades, it does not break** — large media
is unavailable on a buffered-only host, but text and small media still render.

## What lives where

| Concern                              | Where                                            |
| ------------------------------------ | ------------------------------------------------ |
| Privileged scheme registration       | Electron main (`desktop/src/`)                   |
| Resource route (buffered + streamed) | host perimeter — `@grida/agent` (`AgentSidecar`) |
| Path containment (single source)     | the workspace filesystem layer in `@grida/agent` |
| CSP scheme admission                 | the `/desktop/*` CSP                             |
| Transport selection + viewers        | renderer (`editor/scaffolds/desktop/`)           |

## What can change

- **More streamed resource kinds.** Audio is already inside the media fetch
  context; any future host-owned, renderer-displayed resource that is large or
  seekable belongs on the streamed transport rather than the buffered one.
- **Range on the buffered fallback.** A buffered-only host could gain partial
  reads without a privileged scheme if one ever needs seekable media without
  one — at the cost of staying fully buffered per range.
- **Containment as a package edge.** The workspace filesystem layer is a host
  capability that today lives inside the agent package; promoting it to its own
  package would make the single-source containment boundary a compilable package
  edge rather than a convention. See the [god class](./index.md#god-class) note.

## See also

- [Renderer bridge](./renderer-bridge.md) — the sibling channel: capability
  invocation over `window.grida`, not resource bytes.
- [Process model](./process-model.md) — the host perimeter the scheme handler
  proxies to.
- [Agent security](./agent-security.md) — the five `GRIDA-SEC-004` layers.
- [`GRIDA-SEC-004`](https://github.com/gridaco/grida/blob/main/SECURITY.md) —
  the trust boundary every resource read sits inside.
