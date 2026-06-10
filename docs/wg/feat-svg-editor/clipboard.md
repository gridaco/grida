---
title: "Clipboard — copy, cut, paste"
description: "FRD for clipboard support in the SVG editor: the payload is a standalone SVG document, not a private format. Specifies the two extraction operations (standalone payload vs in-document clone), the five kinds of context a lifted subtree leaves behind and the policy for each, command and history semantics, placement, transport ownership, and the paste-is-load trust model."
keywords:
  - svg
  - svg-editor
  - clipboard
  - copy
  - paste
  - cut
  - fragment
  - interop
tags:
  - internal
  - svg
  - wg
format: md
---

# Clipboard — copy, cut, paste

**Status:** Draft — pre-implementation. Revised after pedantic review
(three independent passes: logical probes, bedrock verification, design
probes); the review's blocking findings are folded in below as explicit
policy rather than left implicit.

This document specifies clipboard support for the SVG editor: what a
copied selection becomes, what pasting accepts, how the payload moves
between the editor and its host, and which guarantees survive the trip.
It is written so a second implementer could honor the contract without
reading the current implementation; where the contract deliberately
leaves something open, the openness is named.

## Thesis: the payload is the file format

The editor's foundational stance is that the SVG file is sovereign — the
bytes are the source of truth, and the editor maintains no private model
the file is projected from. The clipboard inherits that stance directly:

> **A clipboard payload is a standalone SVG document.**

Not a JSON envelope, not a base64-encoded internal snapshot, not a
versioned proprietary schema. The markup the user copies is the same kind
of artifact as the file they are editing.

This single decision does most of the design's work:

- **No format to maintain.** A private envelope needs versioning,
  migration, and documentation forever. SVG already has all three.
- **Interop through the one channel peers actually share.** Plain SVG
  markup as clipboard text is the only vector-interchange channel any
  web-reachable peer reads. Concretely: Figma accepts pasted SVG markup
  as editable vectors (with documented import losses — `marker` and
  `pattern` are dropped) and emits markup via its explicit "Copy as
  SVG" action; Inkscape reads SVG text from the clipboard. Acceptance
  is not universal — Illustrator's clipboard interchange is PDF/AICB
  and it does not ingest plain-text SVG — and almost no tool emits
  markup on its _ordinary_ copy gesture. The honest claim is therefore:
  this is the channel several peers read and the only one any of them
  read; pasting our payload into a code editor always yields readable
  source; pasting a peer's SVG export into us is indistinguishable from
  pasting our own payload.
- **Self-describing.** Any consumer that understands SVG understands the
  payload — including consumers that do not exist yet, and including
  machine authors (AI agents) for whom SVG markup is a native dialect.
- **Honest fidelity.** For an editor whose in-memory model _is_ the
  parsed file, markup-as-payload is lossless by construction. Editors
  with private scene graphs cannot make this choice cheaply; this one
  can, and not making it would quietly betray the editor's thesis.

The cost of the decision is borne where it belongs: extraction. A subtree
lifted out of a document leaves context behind, and the copy operation —
not the payload format — must account for that. That contract is the
heart of this document.

## Vocabulary

- **Payload** — the standalone SVG document produced by copy. Parses as
  a complete, namespace-well-formed document in any SVG consumer.
- **Fragment** — one or more sibling element subtrees expressed as
  markup. A payload's content is a fragment; the payload adds the shell
  that makes the fragment standalone.
- **Context** — everything outside a subtree that affects its rendered
  meaning. This document identifies five kinds (§ Extraction) plus one
  inbound direction; the enumeration is the policy surface.
- **Closure** — the set of elements, outside the copied subtrees, that
  the subtrees reference and that the payload carries so it renders
  standalone.
- **Transport** — a channel that moves payload text between the editor
  and the host or operating system clipboard. Transport moves text; it
  never inspects or transforms it.
- **In-place** — a paste placement policy where content lands at its
  authored coordinates, unmodified.

## Two extraction operations, not one

Review surfaced that "the extraction contract" is two contracts wearing
one name. This document names both and specifies the first:

- **Payload extraction** — selection → standalone document. Carries the
  closure and the namespace shell, because the destination is unknown
  and must be assumed to share nothing with the source. This is what
  copy produces. Specified here.
- **Subtree clone** — selection → sibling subtrees within the _same_
  document. Carries **no** closure and no shell: the destination is the
  source, every reference still resolves, and carrying definitions
  would deposit duplicates. This is what duplicate and clone-drag
  gestures consume. Out of scope here; to be specified with those
  gestures. The two operations share selection normalization and
  verbatim subtree serialization — nothing else.

Copy cannot know its destination, so it always performs payload
extraction. The consequence — a payload pasted back into its own source
document re-imports a closure the document already has — is specified,
not hidden, in § Command semantics.

## Requirements

- **R1 — Copy always succeeds, with a defined floor.** Any non-empty
  selection can be copied. There is no refusal path: unlike structural
  operations (e.g. ungrouping a group that carries visual state), where
  refusal is the honest answer, the copy gesture's contract with the
  user is unconditional. "Succeeds" means, normatively: the payload is
  assembled and written to the editor's internal buffer — that write
  cannot fail. Delivery to external channels (native event data, the
  host provider) is attempted per § Transport and MAY fail; such
  failures are reportable to the host but do not constitute copy
  failure. Where context cannot be carried faithfully, copy degrades by
  the documented policies of § Extraction rather than refusing.
- **R2 — Paste accepts markup, not just our markup.** Paste consumes any
  parseable SVG input — a bare fragment or a full document. The editor's
  own payloads are an ordinary case of this rule, not a privileged one.
  There is no sniffing step that treats "our" content differently, and
  therefore no paste-side behavior that depends on recognizing the
  payload's origin.
- **R3 — Same-document round-trip is exact, with a stated delta.**
  Copying a selection and pasting it back into the same document
  reproduces each selected subtree **byte-equal**. Trivia _within each
  copied subtree_ — whitespace, attribute order, quoting, comments —
  survives, because subtrees are serialized under the editor's
  round-trip rules. Two things are deliberately outside this guarantee
  and are stated rather than implied: (a) trivia _between_ selected
  roots (a comment between two copied siblings) belongs to no selected
  subtree and is not part of the selection; (b) the post-paste document
  delta is the subtrees **plus the payload's carried closure block**,
  and the insertion point follows § Placement — paste-back is byte-exact
  per subtree, not diff-silent for the document.
- **R4 — Authored ids are never rewritten.** Pasting content whose `id`
  attributes collide with existing ones inserts them verbatim.
  Duplicate ids are non-conforming SVG/XML, but their resolution is
  well-defined and universal in practice: references resolve to the
  first matching element in document order, in every host renderer.
  Deduplication is the explicit cleanup command's job (Tidy), never a
  silent side effect of paste. This extends the rule already
  established for fragment insertion.
- **R5 — History discipline.** Each user gesture is one undo step. Copy
  touches no history. Cut's mutation is one step. Paste's insertion is
  one step. Undo after cut restores the document; the clipboard is not
  history-managed state and is unaffected by undo.
- **R6 — Headless completeness and determinism.** Everything except
  external transport delivery works without a rendering surface:
  extraction, payload assembly, paste parsing, history. The payload is
  a **pure function of (document, selection)** — the same selection
  yields the same bytes headless or surface-attached. The clipboard's
  correctness must be demonstrable in a unit test with no host
  environment.
- **R7 — The clipboard transport is a host seam; the payload is not.**
  How payload text reaches the operating system clipboard is the
  embedding product's concern, customizable by provider. What the
  payload _is_ — its content, its assembly rules — is core: the editor
  offers no payload-shaping configuration, because shaping options are
  exactly the surface through which round-trip fidelity erodes. This is
  a statement about the editor's option surface, not a tamper
  guarantee: a host provider can mutate text in transit, and doing so
  is the host's explicit act, outside the editor's guarantees
  (§ Trust model).

## Extraction: what leaks when a subtree leaves its document

A subtree's rendered meaning depends on five kinds of context, plus one
inbound direction. Each has a stated policy; "we didn't think about it"
is the only wrong answer. Policies 1–2 carry context; 3–5 deliberately
do not, by argument; the inbound direction cannot be carried at all.

### 1. Referenced resources — carried, by a closed carrier list

SVG externalizes paint servers, filters, clips, masks, and markers into
referenced definitions (`url(#…)` in presentation values; `href` on
referencing elements). A copied subtree that references a gradient
renders unfilled without it.

**Policy: copy includes the closure of referenced definitions, walked
from a closed, enumerated carrier list.** The carriers walked in v1:

- Presentation values carrying `url(#…)`: the paint channels (`fill`,
  `stroke`), `filter`, `clip-path`, `mask`, and the marker properties
  (`marker-start`, `marker-mid`, `marker-end`, and the `marker`
  shorthand) — whether authored as a presentation attribute or as an
  inline `style` declaration on the element.
- Element references: `href` / `xlink:href` on referencing elements
  (`use`, `textPath`, `mpath`, `feImage`, `pattern`, the gradient
  elements' inheritance chains, and their kin).

The walk is recursive (a gradient may reference another gradient; a
filter may reference an image), resolves targets within the source
document, and **excludes targets that already lie within the copied
forest** — a referenced element that is itself a copied root or a
descendant of one is already content, and carrying it again would
duplicate it. The resulting set, deduplicated, is emitted verbatim into
a single `defs` element in the payload. References that do not resolve
in the source document are left as authored — the payload is no more
broken than the source was.

**Not walked in v1, named as documented degradations:** references
carried inside `style` _elements_ (stylesheet rules within the copied
subtree — walking them requires CSS parsing, which is the deliberately
deferred cascade capability of policy 4, and entangling a solid layer
with a deferred one is exactly what this document refuses to do); SMIL
timing and value references (`begin="other.click"`, animated values
naming `url(#…)`); `cursor`; SVG 2 text-layout properties
(`shape-inside`, `shape-subtract`). A copied subtree depending on one of
these carries the reference verbatim but not its target. The list of
non-walked carriers is part of the contract: extending it is a spec
change, not a bug fix.

**The id-collision consequence, named.** When a carried definition's id
collides with an id already present in the destination, document order
decides which definition _all_ references — pasted and pre-existing —
resolve to (R4). Under v1 placement (append at document top level,
§ Placement), the destination's definition precedes the carried one and
wins: the pasted content adopts the destination's same-named definition,
and the carried copy is inert markup. This is accepted; Tidy is the
recovery. A future placement that inserts _before_ existing content
would invert the consequence (the carried definition would capture the
destination's existing references) — any such placement design must
re-confront this, by name.

### 2. Namespace declarations — carried, including a deliberate repair

Fragment serialization is honest about namespaces: a subtree using a
prefixed attribute (`xlink:href`) does not invent the declaration its
ancestor held. A standalone payload, however, must parse on its own —
and an undeclared prefix is a namespace well-formedness _error_, not a
degradation: leaving it unbound would break the payload's defining
property.

**Policy: the payload shell declares what the fragment uses.** For each
copied root, prefixes used but not declared within the subtree are
resolved against the source document's in-scope declarations, and — when
the source itself never declared the prefix — against the well-known
prefix table (`xlink` and kin). The latter is a **deliberate repair**:
the payload can be _more_ well-formed than a broken source, because
standalone parseability is constitutive of the payload where it is not
constitutive of the source. Consequences, named: pasting such a payload
back into its broken source document hoists the repaired declaration
onto the destination root — a root-level diff produced by a content
gesture; and pasting into a destination that binds the same prefix to a
_different_ namespace leaves the destination's binding in authority
(authored declarations are never rebound), silently re-meaning the
pasted prefixed content. Both are edges of honest behavior, not bugs.

This is the inverse of the hoisting that fragment insertion performs on
paste — declarations harvested from a discarded shell are hoisted onto
the destination root — so the two sides form a designed round-trip.

### 3. Ancestor transforms — not carried, by argument

A subtree under a scaled or rotated ancestor group has a world
appearance its own markup does not encode. Two candidate policies:

- **Verbatim:** copy the subtree as authored. Exactly right whenever
  the paste destination supplies equivalent context — pasting back
  under the same ancestor. Note honestly: v1 placement inserts at the
  document top level, so v1's own same-document paste supplies
  equivalent context only when the source already sat at top level; a
  nested-context copy pasted in the same document _does_ shift
  visually under v1.
- **Materialize:** wrap the fragment in a synthesized group carrying
  the accumulated ancestor transform. Correct for cross-context paste;
  **double-applies** the moment content is pasted back under its
  original ancestor (the flow a future scoped paste serves); and it
  fabricates markup the user never authored.

**Policy: verbatim — the lesser evil, not a free win.** Materialization
breaks the paste-under-same-ancestor flow irreparably and violates the
no-synthesized-noise principle; verbatim mis-places only the
nested-source case and is exactly recoverable by the user (the content
is selected after paste; a nudge or drag corrects it).
Materialization remains a candidate _option_ for a future scoped-paste
design, where the destination context is known and the correction is
computable; it must not become a silent default.

### 4. Inherited presentation and cascade — not carried, by argument

A child of a group declaring `fill="red"` copied alone loses its red; an
element styled by a stylesheet rule in the document loses the rule.
Candidate policies mirror the transform case: verbatim, or materialize
the inherited values onto the payload.

**Policy: verbatim, with materialization as a designed future
enhancement.** The same-context argument applies with equal force:
pasting back under the same ancestor must not find inherited values
duplicated onto the child, where they would shadow future edits to the
ancestor. Materialization is _derivable_ when designed: the editor's
property model reports, per property, whether the winning value was
inherited rather than authored on the element — and at a copied root,
"inherited" necessarily means "from outside the copied subtree," which
is exactly the predicate a materializing copy needs. Stylesheet-derived
values are **not** covered by that derivation (the cascade engine
deliberately defers stylesheet matching), which is one reason
materialization is out of v1 rather than in it.

### 5. The viewport — not carried

Percentage lengths (`width="50%"`), and anything else that resolves
against the nearest SVG viewport, take their meaning from a context that
is none of the above: the viewport established by the ancestor `svg`
element's `viewBox` and sizing. **Policy: not carried.** The payload
shell declares no viewport in v1 (see § Payload), so viewport-relative
values in a pasted fragment resolve against the _destination's_
viewport — same-document paste preserves meaning exactly; cross-document
paste re-resolves, which is the nature of relative units. A
viewport-bearing shell is a named enhancement (§ Placement names its
sibling), and any future design must confront that a synthesized
`viewBox` _changes_ viewport-relative meaning rather than preserving it.

### Inbound references — cannot be carried

The closure walk is outbound: it follows references _from_ the copied
subtrees. References pointing _into_ the selection from outside — most
concretely a SMIL animation element elsewhere in the document targeting
a copied node by id — are not part of the copied subtrees, not carried,
and the pasted copy is therefore inert with respect to them. This is a
documented degradation, not an oversight: carrying inbound referents
would drag arbitrary unrelated document content into the payload.

## The payload, normatively

A payload is assembled as follows. The assembly is deterministic (R6):
no step consults the rendering surface, geometry, or the environment.

1. **Normalize the selection.** If a selected node is a descendant of
   another selected node, the ancestor's subtree subsumes it (the same
   rule deletion uses). Roots are emitted in **document order**,
   regardless of selection order — sibling order is paint order, and
   paint order is meaning.
2. **Serialize each root subtree verbatim** under the editor's
   trivia-preserving serialization rules.
3. **Collect the closure** (§ Extraction 1) and emit it, deduplicated
   and verbatim, in one `defs` element preceding the content. If the
   closure is empty, no `defs` element is emitted.
4. **Assemble the shell:** a root `svg` element declaring the SVG
   namespace and every resolved prefix the fragment requires
   (§ Extraction 2), and nothing else — no viewport, no sizing, no
   editor metadata. Roots are emitted contiguously in document order;
   any byte sequence between them is insignificant (a consuming parser
   treats top-level inter-element trivia as outside every subtree, and
   the editor's own paste drops it).

The result parses as a complete, namespace-well-formed SVG document in
any conforming consumer. Pasting it back through the editor discards the
shell, harvests its namespace declarations, and adopts the content — by
the already-specified contract of fragment insertion.

## Command semantics

Three commands, with the identifiers the keybinding surface already
reserves: `clipboard.copy`, `clipboard.cut`, `clipboard.paste`.

- **Copy** — pure read. Assembles the payload from the current selection
  and hands it to transport (§ Transport). No document mutation, no
  history entry. A no-op (not an error) on empty selection. Success per
  R1: the buffer write is the unconditional floor; external delivery is
  best-effort and reportable.
- **Cut** — copy, then delete. The deletion is the existing removal
  semantics (ancestor-subsumption, exact restoration on undo) recorded
  as one history step attributed to the cut gesture. The deletion
  proceeds once the payload is secured in the internal buffer — which
  cannot fail — so a failed _external_ write never strands the user
  with deleted content and no copy: the buffer holds it, undo restores
  it, and the failure is reportable. The clipboard write is not part of
  the history step: undoing a cut restores the document and leaves the
  clipboard holding the payload — the universal convention, and the
  reason "cut, undo, paste" works as a move idiom.
- **Paste** — a **synchronous** command over delivered text. The core
  command takes payload text as input; _acquisition_ of that text —
  from native event data, from an awaited provider read, or from the
  internal buffer — is the invoking channel's job and completes before
  the command runs. The core never holds in-flight transport state;
  concurrency of acquisition is the invoking channel's concern. The
  command parses and inserts as one atomic fragment insertion: one
  history step, roots adopted verbatim, namespace hoisting included.
  The inserted roots become the new selection — the user's next gesture
  (nudge, drag, delete) targets what they just pasted.

  **Paste's refusal table is its own, not fragment insertion's.**
  Fragment insertion is an API whose caller authored the input —
  malformed markup there is a caller bug and throws. Paste's input is
  _environment-supplied_: prose, URLs, and JSON are what clipboards
  hold most of the day. Normatively: input with no parseable top-level
  element is a **no-op refusal** — no mutation, no history, observable
  to the host as a refusal, never a thrown error — matching the
  editor's command doctrine that commands which can't apply are no-ops.
  Text explicitly delivered through the programmatic API keeps error
  semantics, because there the caller authored the call.

### Same-document paste: the carried closure, named

Because copy performs payload extraction (it cannot know its
destination) and paste adopts content verbatim (R2/R4 forbid recognizing
or rewriting "our" payloads), pasting a def-referencing selection back
into its source document **re-imports the closure**: the document gains
a `defs` block duplicating definitions it already has, with colliding
ids, of which the pre-existing one wins (§ Extraction 1). Cut-then-paste
— the move idiom — does the same when the cut content referenced
definitions that were not themselves selected. This is the accepted cost
of one uniform paste rule and an unconditional copy; the alternatives
were each worse, and are recorded in § Rejected alternatives. Tidy is
the recovery: deduplicating defs is precisely its mandate. The
in-document gestures that _should not_ pay this cost — duplicate,
clone-drag — are exactly the consumers of the subtree-clone operation,
which carries no closure (§ Two extraction operations).

### Placement: in-place, appended (v1)

Pasted content lands at its authored coordinates, inserted **at the
document top level, appended after existing content, contiguously, in
payload order**. The insertion point is normative because two
consequences hang on it: which colliding definition wins (§ Extraction
1), and paint order. In-place is exact in _coordinates_; in _paint
order_, appended content renders on top — copying the bottom-most shape
of an overlapping stack and pasting in place produces a byte-equal
subtree at the same coordinates that now paints last. This is the
behavior of every append-on-paste editor, and it is named here rather
than absorbed into "exact."

In-place is the only placement policy that is simultaneously: noise-free
(no synthesized wrapper or rewritten coordinates), geometry-independent
(works headless, R6), and coordinate-exact for the same-document
round-trip (R3). Selection of the pasted roots makes the landing site
visible even when it coincides with the source.

Named enhancements, each requiring its own design pass: paste at pointer
position and scoped paste (into the active isolation scope) — both must
confront that landing content at a point requires either a synthesized
wrapper group or rewritten coordinates, the two noises v1's policy
exists to avoid; _which noise is acceptable is the open design
question_, and "compose insertion with a position adjustment in one
history step" is the mechanism, not the answer. Likewise collision
offset for repeated paste, and a viewport-bearing shell (§ Extraction
5). Nothing in the v1 contract forecloses any of them; none of them is
implied to be free.

## Transport

Ownership is the contract here; the review found the draft left it
ambiguous, so it is stated as a table:

- **Core owns:** payload assembly (R7), the **internal buffer**, and
  the **precedence rule** below. These are not customizable.
- **The rendering surface owns:** wiring the host environment's native
  clipboard events, and the gating discipline for them (below).
- **The host owns:** the optional provider — an async text read and an
  async text write, the seam the construction options already reserve —
  and everything behind it (permission models, gesture-window
  constraints, platform quirks).
- **Channels are dumb pipes** (Vocabulary): no channel inspects or
  transforms payload text. Precedence and fallback are core policy
  _about_ channels, decided in exactly one place.

**Write rule (copy/cut):** the internal buffer is always written. In
addition, exactly **one** external channel is written per gesture: the
native event's data transfer when the gesture arrived as a native
clipboard event, else the provider when one is configured, else nothing.
"Available" means exactly that order. (Dual-writing event data _and_ an
async provider would race the OS clipboard against itself outside the
gesture window; one gesture, one external write.)

**Read rule (paste):** explicitly delivered text first (native event
data, or a programmatic argument), else the provider when configured,
else the internal buffer. **The buffer can be stale** relative to the OS
clipboard: a host with no provider whose user copies in the editor, then
copies elsewhere in the OS, then invokes paste from a menu (no native
event) receives the editor's older buffer content, not the OS clipboard.
This divergence is the documented cost of having no provider; hosts that
expose menu-driven paste SHOULD configure one. The keystroke path is
immune (the native event always delivers fresh text).

**The native event path, with its real engine floor.** In a browser
host, the user's copy/cut/paste keystrokes dispatch clipboard events in
which the gesture itself is the permission — no prompts in any engine.
Whether the events _fire at all_ over a canvas with no text selection is
engine-dependent bedrock, checked: Chromium fires them against the
focused element regardless of selection; Firefox has dispatched them
unconditionally on the keystroke since ~2017 (Mozilla bug 846674, via
1208217); WebKit derived copy from the text selection and fired nothing
without one until **January 2025** (WebKit bug 156529, fixed) — the
installed Safari base below that fix does not deliver copy/cut events to
a selectionless canvas. The surface therefore treats the event path as
primary _where it fires_ and MUST NOT treat it as the sole path; the
provider and buffer are not conveniences but the working channel on
older WebKit. (Implementations may also ensure a focusable element
inside the surface holds focus, the established mitigation in canvas
editors.)

**Gating the native events.** Clipboard events are gated by a stricter
predicate than the keyboard attention gate, because the cost asymmetry
is different: a wrongly claimed keystroke costs a scroll; a wrongly
claimed clipboard gesture destroys what the user believed they copied,
or routes a paste meant for a host text field into the document.
Normatively: the surface claims **copy/cut** only when focus is inside
its container subtree AND no host text input is active AND the host
document's text selection is empty; it claims **paste** only when focus
is inside its container subtree AND the active element is not editable.
Pointer-over-canvas alone — sufficient for the keyboard gate — does
**not** claim clipboard gestures: a user with text selected in a sibling
panel and the pointer idly over the canvas must get their text copy.
While the editor's inline text editing is active, all three are inert
(the text session owns the clipboard).

**Host control over the native path.** Because native-event wiring is
surface-owned, a host cannot interpose on it the way it can on the
provider. The surface therefore exposes an option to **disable native
clipboard transport**, routing all clipboard traffic through the
provider seam — the configuration under which a host's paste-time
screening (§ Trust model) governs every path, not just the secondary
one.

**Deliberate non-adoptions (v1).** A dedicated SVG media type on the
asynchronous clipboard channel — single-engine support today
(Chromium-line, since 124), and that engine sanitizes the channel,
making it _lossy_ for a fidelity-first editor. An HTML-carrier envelope
embedding an opaque payload — unnecessary where plain text is already
lossless; that technique exists to smuggle private formats, which this
design has none of. Pickled web-custom clipboard formats — single-engine
and invisible to unmodified native applications. Each has a clean
adoption path later if a concrete need arrives; none is load-bearing
now.

## Trust model

**Paste is load-equivalent in trust, not in fidelity.** Pasting markup
admits exactly what loading a file admits: the editor parses into its
own model and preserves element content verbatim; nothing is executed by
parsing. (The fidelity scope differs — load preserves a whole document
including top-level prolog, comments, and processing instructions, while
paste adopts top-level _elements_ only — but the _trust_ surface is
identical.) The editor does not sanitize on paste — silently deleting or
rewriting user content on the way in is a fidelity violation, and the
clipboard is not a trust boundary the _document model_ can meaningfully
police.

The honest boundary is the rendering surface: a surface that interprets
document markup in a privileged interpreter (mounting it into a live web
page, where event-handler attributes and embedded foreign content can
execute) has that exposure for _loaded_ documents already; paste changes
the likelihood of hostile input — a keystroke now suffices where a file
open was required — not the mechanism. **No rendering-surface hardening
specification exists today; this paragraph is the tracking obligation.**
Before clipboard ships in a surface that interprets markup in a
privileged context, that surface's hardening posture must be specified
and reviewed — inert rendering of execution-bearing constructs is a
_projection_ choice, compatible with document fidelity (the model keeps
the bytes; the surface declines to execute them), and is the expected
shape of that work. A host that wants paste-time screening applies it on
its side of the provider seam — made meaningful for _all_ paths by the
native-transport opt-out (§ Transport) — where mutating text in transit
is an explicit host choice rather than a silent editor behavior.

## Rejected alternatives

- **A private envelope format** (structured payload embedded in a rich
  clipboard type, with markup as a downgraded fallback) — the standard
  design for editors with private scene graphs. Rejected: this editor
  has no private model to preserve, so the envelope would carry nothing
  the markup doesn't, while costing a format contract, version
  migrations, and the self-describing property.
- **Id rewriting on paste** — rejected by R4. Collision-freedom is not
  the editor's invariant to enforce silently; duplicate-id resolution
  is well-defined in every host renderer, and explicit cleanup exists
  for users who want uniqueness.
- **Paste-side closure deduplication** (skipping carried definitions
  whose id already resolves in the destination) — rejected: it is
  content-sensitive mutation on ingest, requires recognizing "our"
  payloads or second-guessing everyone's (violating R2's uniformity),
  and silently drops elements the payload author shipped. The
  duplicated-defs cost of § Command semantics is taken with eyes open
  instead.
- **Sanitize-on-paste as default** — rejected by the trust model.
  Fidelity-preserving and silently-content-mutating are not
  simultaneously satisfiable.
- **Refusal on context loss** (refusing to copy selections whose
  appearance depends on uncarried context) — rejected by R1. Refusal is
  the right shape for operations that would otherwise _corrupt the
  document_ (ungrouping a stateful group); copy corrupts nothing — its
  degraded cases mis-render the _payload_, and the residual
  destination-side costs (closure duplication, paint-order change) are
  named in § Command semantics and § Placement rather than refused
  away.

## Out of scope (v1)

Adjacent work this design deliberately enables but does not include: the
**subtree-clone operation** and its consumers — duplicate and clone-drag
gestures (§ Two extraction operations; they must not pay the closure
cost, which is why they are a different operation, not a clipboard
client); ingestion of peer tools' proprietary clipboard formats; pasting
non-SVG content (plain text as a new text element, raster images);
additional system-clipboard representations beyond plain text; the
materializing variants of extraction policies 3 and 4; the
viewport-bearing shell of policy 5; pointer-relative, scoped, and
offset placement.
