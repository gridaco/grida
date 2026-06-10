---
title: "Rendering hardening — the inert projection"
description: "Specification for rendering untrusted SVG documents inertly in the SVG editor: hardening is a projection choice at the rendering surface, never a mutation of the document model. Names the execution-vector inventory the projection must neutralize, the surface obligations that constrain the strategy, the inert-projection requirements, the named costs, and the residual risks left to the host."
keywords:
  - svg
  - svg-editor
  - security
  - hardening
  - xss
  - rendering
  - projection
tags:
  - internal
  - svg
  - wg
format: md
---

# Rendering hardening — the inert projection

**Status:** Proposed — under review. No rendering surface implements
this specification yet: the live-page surface today mounts document
markup with full execution semantics, which is precisely the exposure
this document exists to close. Hardening behavior must not land
before this specification is reviewed. This document carries the
tracking obligation recorded in the clipboard FRD's trust model
([`clipboard.md`](./clipboard.md) § Trust model); that obligation
remains open — it is discharged when this specification is reviewed
and a surface enforces it, not by the specification existing.

## Thesis: the model keeps the bytes; the surface declines to execute

The editor's foundational stance is that the file is sovereign: the
bytes are the source of truth, round-trip is byte-exact, and the
editor never silently rewrites user content. That stance has a
security corollary that this document makes explicit:

> **Hardening is a projection choice. The document model is never the
> place to neutralize hostile content; the rendering surface is.**

A document containing a script element, an event-handler attribute,
or an embedded HTML island is a _valid document_. The model parses
it, preserves it, round-trips it, and copies it to the clipboard
verbatim — all of that is fidelity, none of it is execution. Danger
arises at exactly one place: a surface that hands the markup to a
privileged interpreter (a live web page, where the document's author
gains the embedding origin's authority). So the obligation lands
there: **the projection from model to rendered output must be inert
— author script must not execute in the embedding context — while
the model underneath stays verbatim.**

Sanitize-on-load and sanitize-on-paste are rejected throughout this
design family (see the clipboard FRD's trust model): mutating content
on the way _in_ destroys fidelity and still misses documents that
arrive by other doors. Neutralizing on the way _out to the renderer_
costs fidelity nothing — the projection is already a derived,
regenerable artifact — and covers every door at once, because every
document, however it arrived, renders through the same projection.

## Threat model

**The attacker is the document author; the victim is the embedding
origin.** An SVG document is active content, not an image: mounted
into a live page it can execute script through a half-dozen distinct
vectors (inventoried below). The author of a hostile document may be
an upstream of any ingestion path — a file the user opens, markup the
user pastes, an asset fetched from a library, a document produced by
another tool or an AI agent. Clipboard support changed the
_likelihood_ (a keystroke now suffices where a file open was
required), not the mechanism; the exposure is a property of rendering
untrusted markup at all.

What the attacker gains without hardening is the embedding origin's
authority: the host application's session, storage, DOM, and whatever
APIs the page exposes. For an editor SDK this is a _transitive_
promise — every application that embeds the surface inherits the
exposure — which is why the posture must be the package's default,
not a host afterthought.

Two trust boundaries are explicitly **not** this document's subject:
the document model (it polices nothing, by design), and the host
application's own input screening (a host that wants paste-time or
load-time scanning applies it on its side of the seams the editor
already provides). This document owns the third boundary: what the
surface mounts.

## What the surface owes the editor

The strategy space is constrained by what the editing surface must
be able to do. These obligations are why the platform's structural
isolation primitives — rendering the document as an image, or inside
a sandboxed frame — cannot carry the _editing_ surface, and they are
requirements on whatever hardening shape is chosen:

- **Per-node geometry.** The editor reads rendered geometry (bounding
  boxes, transforms-as-rendered) for selection, snapping, and
  measurement. The rendered tree must be measurable node-by-node.
- **Rendered-cascade resolution.** The editor resolves effective
  styling through the host renderer's computed values. The rendered
  tree must be queryable per node.
- **Hit-testing.** Pointer interaction resolves through the rendered
  tree.
- **In-place content editing.** Text editing mounts on the rendered
  node itself.

Each of these requires the document to be **live in the same
rendering context as the surface's chrome** — which is exactly the
privileged mounting that creates the exposure. The conclusion is not
"accept the exposure" but "neutralize within the live mounting":
hardening must operate on _what is mounted_, not on _where it is
mounted_.

A survey of how the platform and peer editors solve this —
allowlist sanitization, the spec-mandated secure static image mode,
sandboxed frames, and parse-into-model architectures — is maintained
separately as
[`research/untrusted-svg-rendering.md`](../research/untrusted-svg-rendering.md).
Its conclusion in this document's terms: neutralizing the live
projection is the only strategy that keeps both the verbatim model
and the obligations above. The per-strategy verdicts are argued in
§ Rejected alternatives.

## The execution inventory

The contract is an enumeration. The inert projection must neutralize
**every** class below; a projection that misses one is not compliant.
The classes are defined by construct kind — element kind, attribute
name family, URI scheme, content namespace — never by pattern-matching
serialized text.

| #   | Class                       | Constructs                                                                                                                                                                                  |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | Script elements             | `script`                                                                                                                                                                                    |
| V2  | Event-handler attributes    | the `on*` attribute name family, including the animation-timeline hooks (`onbegin`, `onend`, `onrepeat`)                                                                                    |
| V3  | Script-scheme URIs          | URI-bearing attribute values whose scheme is a script scheme (`javascript:`), after entity decoding and whitespace normalization                                                            |
| V4  | Declarative animation       | the animation element family (`animate`, `set`, `animateTransform`, `animateMotion`, `discard`) — both for its event hooks and for its ability to retarget URI-bearing attributes over time |
| V5  | Foreign content             | `foreignObject` and any subtree outside the SVG namespace — the embedded-HTML escape hatch to the full HTML execution surface                                                               |
| V6  | Document-pulling references | `use` (and equivalents) whose target is not a same-document fragment — importing a subtree that may itself carry V1–V5                                                                      |
| V7  | Style-borne vectors         | `@import` and non-local `url()` in style content; legacy script-bearing style constructs                                                                                                    |

Two cross-cutting hazards qualify the inventory:

- **Reparse mutation (mXSS).** Any scheme that sanitizes a _string_
  and then mounts that string through a different parser inherits the
  parser-differential bypass class. The requirements below address
  this structurally (R3) rather than by allowlist vigilance.
- **Network-bearing references that do not execute** — an external
  raster image reference is a fetch (a tracking beacon, an IP leak),
  not an execution. These are a privacy residual, named in
  § Residuals, governed by the host's content policy rather than by
  this projection. v1 draws the line at execution.

## Requirements

**R1 — The model is never mutated.** Hardening reads the model and
shapes the projection; nothing is written back. Load → serialize
remains byte-exact for any document, however hostile. The hardened
projection is never the source for file serialization, clipboard
payloads, or any export — those carry the verbatim bytes, always.

**R2 — Inert by default.** Every rendering surface that interprets
markup in a privileged context ships with the inert projection
**on**. Disabling it is a host decision, explicit, named, and scoped
(a host embedding only first-party content it already trusts at
script level may opt out); the package never defaults to executing
author content.

**R3 — Neutralize from the model, not through a second parse.** The
projection is computed from the parsed model the editor already
holds — neutralization keys on the model's own token classes
(element kind, attribute name, decoded URI scheme, namespace) — and
is emitted with the same disciplined encoding as every other
serialization. There is no separate sanitizer parse whose
disagreement with the mount parse could be exploited; the one
remaining parse (the host renderer reading the emitted projection)
is fed only output the emitter constructed. The residual — the host
parser reading emitted text differently than the emitter intended —
is bounded by the emitter's quoting/encoding discipline and is a
named review obligation on the implementation, with the inventory's
known mutation tricks as test vectors.

**R4 — Strict ingestion is load-bearing.** The editor refuses input
its parser cannot tokenize (it throws rather than guesses). This
property is part of the security design and must be preserved:
nothing reaches the projection that the model did not fully
tokenize, so there is no "content the sanitizer never saw."
Loosening the parser toward error-recovery is a change to this
specification, not a parser detail. The model's named fidelity
tolerances (entity-spelling canonicalization, value re-encoding) are
not loosenings of this property: they normalize values the tokenizer
fully consumed, never admit untokenized content.

**R5 — Appearance is preserved outside the named costs.** Beyond the
enumerated neutralizations (§ Named costs), the inert projection must
not alter the document's static rendered appearance. Hardening
suppresses _behavior_; it does not restyle, reflow, or reorder.

**R6 — The editing obligations survive.** Per-node geometry,
rendered-cascade resolution, hit-testing, and in-place editing work
identically under the inert projection. In particular, whatever
structural correspondence the surface maintains between model nodes
and rendered nodes must be preserved by neutralization — neutralize
in place rather than dropping nodes where the distinction matters.

**R7 — Neutralization is observable.** The surface can report that a
document contains neutralized content and which classes were present
(at minimum: a per-class count). Hosts surface this however they
like ("this document contains scripts — inactive"); silence about
suppressed content is not acceptable for an editor whose users
reason about their own files.

**R8 — Defense in depth is documented, never load-bearing.** Host
integration guidance recommends a strict content-security posture
(no inline-script allowances) as a second layer, with the explicit
statement of what it does and does not cover — notably that
declarative animation is not script and no script policy gates it.
The projection must be complete on its own with the host policy
absent.

## Named costs

The inert projection deliberately suppresses behavior; these are the
visible consequences, taken with eyes open:

- **Foreign content does not render.** A document whose visible
  appearance depends on embedded HTML loses that region (a visual
  loss, not a structural one — the model retains the subtree, and
  serialization is unaffected). This is the standing trade of every
  surveyed sanitizer.
- **Declarative animation does not play in the editing surface.**
  v1 neutralizes the whole animation family (V4): the retargeting
  vector means animation elements can rewrite URI attributes, and a
  per-target-attribute refinement (allowing purely geometric
  animation) is a future relaxation requiring its own review. An
  editing surface freezing animation at authoring time is an
  acceptable interim posture — and arguably desirable while
  measuring geometry.
- **Script-scheme links are dead.** They are dead in every editor
  surface surveyed; no loss in practice.
- **Non-fragment `use` targets do not resolve.** Cross-document
  composition does not render in the editing surface (v1).

None of these costs touch the file: open + save remains byte-exact,
and a copied selection carries the verbatim content, suppressed
regions included.

## Residuals and non-goals

- **Network fetches that do not execute** (external raster images,
  fonts) are a privacy channel, not an execution channel. v1 leaves
  them to the host's content policy; tightening them into the
  projection (e.g. a no-external-fetch mode) is a named future
  option, not a v1 requirement.
- **The host page's own security posture** — its CSP, its session
  model, what it does with documents outside the editor — is the
  host's.
- **Non-browser surfaces** (a native renderer, a headless geometry
  backend) have different interpreters and different exposures; each
  surface class owes its own hardening statement. This document
  binds surfaces that mount markup into a live web page.
- **Denial-of-service via pathological documents** (billion-laughs
  expansion, filter bombs, extreme node counts) is a robustness
  concern tracked separately; it is not an execution vector and not
  in this document's scope.

## Registration

This boundary follows the repository's prevented-vulnerability
registry convention —
[`GRIDA-SEC`](https://github.com/gridaco/grida/blob/main/SECURITY.md),
which owns the registration procedure. This specification is the
design half of that record; the registry entry is created when
enforcement ships, not before, and enforcement must not ship without
creating it.

## Rejected alternatives

- **Sanitize on ingestion (load or paste).** Argued and rejected in
  § Thesis and the clipboard FRD's trust model.
- **Image-context rendering for the editing surface.** The platform's
  secure static mode is the strongest guarantee available and costs
  nothing to adopt — but it forfeits the editing obligations
  (§ What the surface owes the editor) wholesale. It is the
  _right_ projection for non-interactive contexts (thumbnails,
  read-only previews, list assets), and host guidance should say so;
  it cannot carry the editing surface.
- **Sandboxed-frame isolation for the editing surface.** Structural
  for script, but the frame boundary severs the same obligations
  from the host side. Running the
  _entire editor_ inside the frame moves the boundary rather than
  solving it — the host application then needs its own bridge for
  every integration seam. Available to hosts as a deployment choice;
  not the package's projection.
- **A third-party sanitizer over the serialized string.** Imports
  the parser-differential (mXSS) bypass class this design
  structurally avoids (R3), adds an allowlist whose maintenance
  cadence the package does not control, and operates on a string
  when the editor already holds the parsed tree. The surveyed
  precedent confirms the allowlist _content_ is reusable knowledge;
  the _architecture_ (string in, string out, second parse) is the
  part to decline.
- **CSP as the primary control.** The embedding page's policy is not
  the package's to guarantee, and hosts legitimately relax it for
  unrelated reasons; what it does and does not cover is R8's subject.
  A second layer, never the first.

## Relationship to other documents

- [`clipboard.md`](./clipboard.md) — the trust model that created
  this document's obligation: paste is load-equivalent in trust, the
  model does not police content, and the honest boundary is the
  rendering surface. This specification is that boundary's contract.
- [`research/untrusted-svg-rendering.md`](../research/untrusted-svg-rendering.md)
  — the upstream survey (platform guarantees, peer sanitizers, CSP
  semantics) this specification draws on.
- [`element-ir.md`](./element-ir.md) — the model-side architecture;
  its round-trip invariants are the fidelity guarantees R1 protects.
