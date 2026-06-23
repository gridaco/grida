---
title: "Image insertion — resolvable href, host-owned I/O"
description: "FRD for inserting <image> elements into the SVG editor. The editor accepts an image insertion at a point given a resolvable href and host-supplied intrinsic size; turning a local file into a usable URL, and loading bytes to learn a natural size, are host-owned I/O. Specifies the insertion contract, the responsibility boundary, drop/paste transport ownership, href authoring, and the P1 round-trip guarantee for the inserted element."
keywords:
  - svg
  - svg-editor
  - image
  - insertion
  - href
  - data-uri
  - drop
  - paste
tags:
  - internal
  - svg
  - wg
  - images
format: md
---

# Image insertion — resolvable href, host-owned I/O

**Status:** Proposed — v1 design. The insertion contract (a designed
image-insertion command, host-supplied intrinsic size, SVG 2 `href`
authoring) is specified here for implementation; the named deferrals
(§ Out of scope) remain open. Written so a second implementer could
honor the contract without reading the current implementation.

This document specifies how an `<image>` element is inserted into an
open document: what the editor accepts, what it refuses, who resolves a
local file or a bare URL into something insertable, and what survives the
round-trip. It is a sibling of [`clipboard.md`](./clipboard.md) — both
divide a transport problem along the same seam, and both inherit the
editor's foundational stance that the SVG file is sovereign.

## Thesis: the editor inserts a reference, never reads a file

`<image>` is already a first-class element in the editor — existing
`<image>` nodes are selected, translated, resized, grouped, and
round-tripped today. The single missing capability is **insertion**: a
designed path to add a new `<image>` to the document.

The defining decision is where the responsibility line falls:

> **The editor accepts an image insertion at a point given a _resolvable_
> href. Turning a local file into a usable URL — and loading bytes to
> learn a natural size — is host-owned I/O, not the editor's job.**

A **resolvable href** is one the rendering context can already fetch: a
remote URL, a `data:` URI, or any URL the host serves. Given one, the
editor places the element, sizes it, and guarantees the round-trip.
Everything that produces a resolvable href from something that is _not_
one — a dropped `File`, a pasted `image/*` blob, a path on disk — is the
host's concern, because it is file I/O, and file I/O is a host-owned seam
(P2). The editor never reaches into the local filesystem, never reads a
`File`, never decodes bytes.

This is the same cut [`clipboard.md`](./clipboard.md) makes: _what the
payload is_ is core; _how text reaches the OS clipboard_ is the host's.
Here: _placing and authoring the `<image>`_ is core; _producing a
resolvable href, and measuring it_ is the host's.

The cut is not arbitrary. The editor core is headless by construction —
it owns the document model, accepts commands, and emits state, but
imports no rendering context, no window, no image decoder, no network.
"Resolve this href to pixels and tell me its natural size" is precisely
the work the core _cannot_ do without an I/O capability it does not have.
The host has that capability already: it had to, to turn the user's
dropped file into a URL in the first place.

## Vocabulary

- **Resolvable href** — a reference the rendering context can fetch as-is:
  a remote URL, a `data:` URI, or a host-served URL. The unit the editor
  accepts.
- **Intrinsic size** — the natural width and height an image declares in
  its own bytes (a raster's pixel dimensions; an SVG image's viewport).
  Knowable only by loading the bytes — an I/O act.
- **Placement point** — a document-space coordinate at which the inserted
  image is positioned. The transport's contribution to insertion.
- **Resolution (file → href)** — the host act of turning a local `File`
  or blob into a resolvable href (object URL, `data:` URI, or an upload
  to a served URL). Not the editor's act.

## The responsibility boundary

Two questions hide inside "insert this image," and they belong to
different owners.

- **The first question — "what `<image>` element should exist, and
  where?"** Authoring the element, choosing its representation, placing
  it, and keeping the document round-trippable. This is **core**: it
  touches the file-sovereignty invariant (P1), and no view of the
  editor's state lets a consumer build it themselves.
- **The second question — "how do I get a resolvable href, and how big is
  it?"** Turning a local file into a URL; decoding the bytes to learn the
  intrinsic size. This is **host-owned I/O** (P2): the same class of
  concern as clipboard and file-open, and a kind of work the host has a
  rendering or decode context for and the headless editor structurally
  does not.

The editor answers the first question and refuses the second. A host that
already holds a resolvable href and a size finds insertion is the only
thing missing — and it is supplied.

## Requirements

- **R1 — The editor inserts from a resolvable href, never from a file.**
  The insertion contract accepts a resolvable href (and a placement
  point, and a size). It never accepts, reads, or decodes a local `File`
  or an `image/*` blob. Producing a resolvable href from a non-resolvable
  source is outside the contract.
- **R2 — Intrinsic size is host-supplied in v1.** Because measuring an
  image is an I/O act the headless core cannot perform, the size travels
  _into_ the insertion as caller-supplied dimensions. The insertion
  command is therefore **synchronous** — it holds no in-flight load, and
  editor state never sits in a pending-resolve limbo. (A host-owned
  resolver provider that would let the editor _orchestrate_ resolution is
  a named enhancement; see § Intrinsic size.)
- **R3 — A size is always written, with a defined fallback.** An inserted
  `<image>` always carries explicit `width` and `height` so it is
  immediately selectable and resizable and its bounds are well-defined.
  When the caller supplies a size, that size is used. When it does not, a
  default placeholder size is written — explicitly _not_ intrinsic, and
  named as such. The fallback is deliberate, not a strict-surface
  refusal: insertion corrupts nothing (unlike, say, ungrouping a stateful
  group, where refusal is the honest answer), so a missing size degrades
  to a resizable placeholder rather than rejecting the gesture; a host
  that knows the size supplies it. (An `<image>` without width/height has
  implementation-defined bounds across renderers — SVG 1.1 treats a
  missing dimension as zero and disables rendering, SVG 2 uses the
  intrinsic size — so the editor writes a size always rather than inherit
  that ambiguity.)
- **R4 — The inserted element round-trips clean (P1).** After insertion,
  the document's only delta is one `<image>` element. It is authored with
  SVG 2 `href` (§ Round-trip), no namespace declaration is forced, and
  serialize → reparse is byte-stable.
- **R5 — Insertion is one history step.** Adding an image is a single
  undoable gesture; undo restores the document byte-equal to before, redo
  re-inserts and re-selects, matching the existing insertion contract.
- **R6 — The editor imposes no content policy on the href.** No size cap
  on `data:` URIs, no scheme allowlist, no fetch, no validation of what
  the href points at. The href is written verbatim and round-trips
  verbatim (P1 — content is sovereign). Whether to inline a large `data:`
  URI or upload to a served URL is the host's choice, made before the
  href reaches the editor.
- **R7 — Transport is host-owned.** How a user's drop, paste, or file
  pick becomes a resolvable href and a placement point is the host's
  concern. The editor supplies the document-space projection a host needs
  to turn a screen-space drop into a placement point; it does not install
  drop, drag, or image-paste listeners of its own (§ Transport).

## The insertion contract

Insertion is a **designed command** that takes a resolvable href and
optional placement and sizing, authors one `<image>`, places it, selects
it, and records one history step. It is distinct from the generic
element-insertion command in three ways that justify a dedicated surface:

1. **It carries content.** A rectangle is defined by its geometry; an
   image is defined by its href. The href is the payload, and the command
   names it as a first-class argument rather than as an opaque attribute
   bag.
2. **It has an intrinsic size.** Geometry-only shapes have none — their
   size is whatever the user draws. An image's natural size is a real
   quantity the contract must have an answer for (R3).
3. **It authors the reference cleanly.** `href` vs. legacy `xlink:href`,
   and the no-namespace-declaration guarantee, are round-trip decisions
   the contract owns (§ Round-trip), not caller responsibilities.

### Not a drag-to-size tool tag

The editor's drag-to-size insertion subsystem is a closed set of tags
whose members have **no intrinsic size** — the user's drag _is_ the size.
`<image>` is the opposite: it _has_ an intrinsic size and carries href
content. Forcing it into the drag-to-size set would misrepresent both
properties, exactly as text was kept out of that set for the mirror
reason (text also has no intrinsic size, but is placed by click, not
drag). Image insertion is its own command, driven by the host's
transport, not a member of the drag-to-size vocabulary.

A pointer-driven place gesture — a tool where the user, having already
chosen an image, clicks the canvas to drop it at intrinsic size — is a
plausible future surface (the mirror of the click-to-place text tool).
It is **deferred**: the drop, paste, and programmatic flows all drive the
command directly, supplying their own point, so no host yet needs a
canvas tool to place an already-chosen image. It graduates when a host
does, under the same "public only after a second consumer shapes it"
discipline that governs every other surface in this package.

### Placement

The placement point is a document-space coordinate. The inserted image is
centered on it — the same convention the shape insertions use for their
click-no-drag fallback, so a drop lands centered under the pointer. With
no point supplied, the element is anchored at the document origin (its
top-left at the origin, not centered on it); the host is expected to
supply a point for any pointer-driven flow.

The transport's only geometric contribution is that point. Projecting a
screen-space drop or paste location into document space is a query the
editor already answers for its own gestures, and the host reuses it; the
editor does not need to observe the drop itself to provide it.

## Intrinsic size: host-owned I/O

Learning an image's natural size means loading its bytes — a network
fetch and a decode, or a rendering-context measurement. The headless core
has none of those capabilities. So the capability lives where the I/O
lives: with the host.

This mirrors the shape of the editor's declared font seam: the editor
owns the _need_ for a measurement (font metrics there, intrinsic size
here), but the _resolution_ is delegated to the host, because resolution
is I/O the headless core cannot perform. (The font seam is declared in
the construction surface but not yet exercised by an awaited flow; it is
cited here for its shape, not as a proven async precedent.)

**v1: the host supplies the size.** The argument is impossibility, not
mere preference. Learning a natural size means **decoding** the image —
running a raster decoder, or measuring an SVG image's viewport in a
rendering context. The headless core has no such context by construction;
it _cannot_ decode, at all. The host can — it is the party with the DOM
or the server-side image library — and it is already the party that
produced the resolvable href. So the decode must happen on the host. Note
honestly that this decode is a _distinct_ act from producing the URL:
creating an object URL does not read pixels, and encoding a `data:` URI
does not decode dimensions, so the host performs one decode it would not
otherwise need. But that decode is unavoidable wherever it lives, only
the host can do it, and doing it host-side keeps the editor's command
**synchronous and headless** (R2). For a bare remote URL with no size,
the host decodes once and passes both href and size in.

**Named enhancement — an image resolver provider.** A host-owned resolver
that maps a resolvable href to its intrinsic size, mirroring the font
resolver, would let the editor _orchestrate_ resolution: a caller could
insert from a bare href and let the editor await the size. It is deferred,
for two reasons. First, it has one prospective consumer; a provider seam
shaped against a single host ossifies around that host's quirks, and the
package's discipline is to let a second consumer shape a contract before
it is promoted. Second, it drags asynchrony into a command model that is
otherwise synchronous, which raises real questions — what the document may
do mid-resolve, how undo interacts with a pending insert — that a
single-consumer design has no pressure to answer well. When a host needs
editor-orchestrated resolution, the resolver is the promotion path, and
those questions get answered then.

## Transport: drop, paste, and the P2 boundary

A user inserts an image by dropping a file, pasting a blob, or picking a
file. Each starts from a **non-resolvable** source — a local `File` or an
`image/*` clipboard blob — and each therefore lands on the host's side of
the boundary (R1, R7).

**The editor does not install drop, drag, or image-paste listeners.** The
reasons compound:

- **The source is non-resolvable.** A dropped `File` is not an href; a
  pasted `image/*` blob is not an href. Turning either into one is the
  resolution act the editor refuses (R1). An editor listener would have
  nothing to do but hand the file back to the host.
- **The host already owns the surrounding surface.** The rendering
  container is exclusively the editor's, but the host renders its own
  chrome — and its own drop affordance — around it. A host that wants
  drop-to-insert already has a drop target and already computes a drop
  point. A second drop listener inside the container would split that
  ownership for no gain.
- **The point is already available.** The one thing the editor uniquely
  knows — how to project a screen location into document space — is
  exposed for the host to call. The host owns the file; the editor owns
  the projection; insertion composes them.

So the v1 transport is: the host's drop/paste/pick handler resolves the
source to a resolvable href (and a size), projects the location to a
placement point, and calls the insertion command. The editor's existing
native-clipboard handling, which consumes SVG markup as text, continues
to ignore non-markup payloads — an `image/*`-only paste is not SVG text
and is left for the host, consistent with the clipboard FRD already
naming raster-image paste as deferred host work.

**Named enhancement — a drop observation.** The editor could, instead,
_observe_ drops the way it observes taps: report a drop's items and
document-space point on a dedicated channel, leaving the host to resolve
and insert. This keeps the editor out of file I/O (it reports a drop that
happened; it never reads the file) while sparing the host its own drop
plumbing. It is deferred under the same discipline as every observation
seam — it ships when a host needs editor-routed drops and a second
consumer pins its shape. It is explicitly _not_ an input-interception
hook: like the tap observation, it would report a drop that already
happened and could neither veto nor replace the host's handling. One
asymmetry that design must confront, and the tap observation does not: a
drop carries a browser default action that has to be suppressed to accept
the drop at all, so "purely passive observation" is not quite achievable
the way it is for a tap — who suppresses the default, and under what
gate, is part of what a second consumer would pin.

## Round-trip

**New images author SVG 2 `href`.** A freshly inserted `<image>` is
written with the namespace-free `href` attribute. This needs no namespace
declaration, matches the editor's no-proprietary-noise stance, and is
honored by every modern renderer. The legacy `xlink:href` form — the only
form some older renderers read — is **preserved** on images that already
use it: an edit to an existing `xlink:href` image keeps that form, which
is exactly why legacy targets are not stranded. But `xlink:href` is never
_authored_ for a new image, because doing so would force an `xmlns:xlink`
declaration onto the document root for no benefit on a modern target.

**No content policy.** The href is written verbatim, whatever it is —
a multi-megabyte `data:` URI, a remote URL, a fragment reference. The
editor imposes no size cap, no scheme filter, no fetch-to-validate. P1
makes content sovereign; policing it would be exactly the kind of silent
mutation the editor exists to refuse. A host with a reason to bound
payload size (to keep documents small, say) makes that choice on its side
of the boundary — by uploading large images to a served URL instead of
inlining them — before the href reaches the editor.

The result is locked by the round-trip invariant (R4): insert an image,
serialize, and the document gains exactly one well-formed `<image>` with
its href, position, and size; reparse is byte-stable.

## Trust model

**Inserting an image is load-equivalent in trust.** Writing an `<image
href>` into the model admits exactly what loading a document with the
same element admits: the editor stores the reference verbatim and
executes nothing by storing it. A `data:` URI is inert bytes in an
attribute; a remote URL is a reference the model does not dereference.

The honest boundary, as for paste and load, is the **rendering surface**.
A surface that mounts document markup into a privileged interpreter can
fetch a remote href (a tracking/privacy vector) or render hostile image
content; that exposure exists for any `<image>` the surface renders,
whether authored, loaded, pasted, or inserted. Insertion changes the
_likelihood_ of hostile input reaching the surface — a drop now suffices
where a file open was required — not the mechanism. The surface's
hardening posture is the subject of
[`rendering-hardening.md`](./rendering-hardening.md); insertion adds no
new obligation beyond the ones that document already carries for rendered
references.

## Rejected alternatives

- **Editor reads the dropped file.** Rejected by R1. The headless core
  has no file or decode capability, and reaching for one would dissolve
  the boundary that keeps the package testable without a rendering
  context. The host is the party with that capability; the editor
  accepting the resolvable href it produces is the whole interface.
- **`<image>` joins the drag-to-size tool set.** Rejected: that set is
  defined by the absence of intrinsic size, which `<image>` has, and its
  members carry no content payload, which `<image>` does. Membership would
  misrepresent both, the mirror of why text was excluded.
- **A required resolver provider in v1.** Rejected by the second-consumer
  discipline and by R2. A provider shaped against a single host ossifies,
  and an async resolver imposes a pending-resolve state on an otherwise
  synchronous command for no v1 caller that needs it. Named as the
  promotion path instead (§ Intrinsic size).
- **No size written, relying on intrinsic rendering.** Rejected by R3. An
  `<image>` without explicit width/height has renderer-dependent bounds
  and is not cleanly selectable or resizable the instant it is placed. The
  editor writes a size always — the supplied one, or a named placeholder.
- **Editor-owned drop/paste-image listeners.** Rejected by R7 and the
  non-resolvable-source argument: the editor would receive a file it
  refuses to read and could only hand it back. The host owns the surface
  around the container and the file I/O; the editor owns the projection
  and the insertion. A drop _observation_ (not a file read) remains a
  named future seam.
- **An href content policy (size cap, scheme allowlist).** Rejected by R6
  and P1. Content is sovereign; bounding it is a host decision made before
  the href arrives, not a silent editor behavior.

## Out of scope (v1)

Adjacent work this design names but does not include: the **image
resolver provider** that would let the editor orchestrate intrinsic-size
resolution from a bare href (§ Intrinsic size); the **pointer-driven
place tool** for dropping an already-chosen image by clicking the canvas
(§ The insertion contract); the **drop observation** channel that would
report drops for the host to resolve (§ Transport); **editor-side
ingestion** of local files or `image/*` clipboard blobs (permanently
host-owned by R1, not a deferral); and **aspect-ratio-constrained or
fit-to-viewport sizing** beyond center-on-point placement and the
supplied-or-default size.
