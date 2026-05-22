---
name: sdk-design
description: >
  Doctrine for designing and evolving any **SDK** Grida ships —
  TypeScript, Rust, or otherwise. "SDK" here means a surface that
  crosses a foreign-or-foreign-treated boundary: published packages,
  separately-versioned consumers, FFI bindings, public-by-design
  modules. An SDK's job is to refuse; a strict, honest surface
  rejects the wrong contents and keeps the package testable in
  isolation. Default is "core, not customizable"; customization is
  the exception, defended by a deciding table. Use when authoring or
  evolving any such surface — `@grida/*` published packages,
  `crates/*` published or FFI-exported, intent/message vocabularies,
  any contract a second author will compile against. Internal-only
  helper packages are welcome to follow, not forced. Companion skill
  for two-sided contract work: $sdk-seam. Critique partners:
  $pedantic, $etiology. Related: $naming.
---

# sdk-design

This is **not** a style guide. Style and language-specific code
shape are downstream (see $code-ts, $code-react for the TS sides).
This is about what an SDK refuses to do — the discipline that keeps
a package small, legible, and replaceable, regardless of language.

## The thesis

An SDK lives or dies by what it refuses to expose. **Default is
core; customization is the exception.** Every public knob is a
contract you cannot retract without a semver break and a coordinated
migration across every downstream call site.

A library with too few knobs is easy to grow. A library with too
many is impossible to retire. The asymmetry is brutal — design from
it.

This doctrine applies whether the package ships as an npm scope, a
crate, a header-only library, a WASM module, a Python wheel, a
hosted service with an SDK, or a pair of microservices defining a
shared message vocabulary. The mechanics of "publish" differ; the
discipline of "refuse the wrong contents" does not.

## Scope: what counts as an SDK

This is the gate. The skill says "SDK," not "package," because the
two are different. An SDK is:

- **A surface that crosses a foreign-or-foreign-treated boundary.** Published to a registry (`npm`, `crates.io`, `PyPI`); linked by a separately-versioned consumer (a desktop binary against a crate, a generated WASM/FFI binding); or authored as if a foreign consumer existed even if one doesn't yet (any package whose README documents it as a public surface, anything tagged for publication, anything in a `*-hosted` suffix family).
- **Versioned independently of its callers**, even if today every caller lives in the same monorepo and ships on the same commit. The intent to be replaceable is what counts.

What this excludes — where the doctrine is **welcome but not
load-bearing**:

- A package with exactly one internal caller, shipping on the same commit, where if the caller's needs changed the package would be rewritten freely. That's not an SDK; that's a refactored module that happens to live in `packages/`. Adopt the parts of this skill that pay; skip the rest without apology.
- One-off helper crates pulled in by a single binary in `crates/`. Same logic.

Don't extend the doctrine to internal-only utilities just because
the file structure looks like an SDK. The discipline costs
something — designed views over raw streams, anti-goals as
perimeters, promotion-on-dogfooding — and that cost is paid by the
foreign-callers it protects. If there are no foreign callers (now
or planned), the strictness doesn't pay back.

`sdk-seam` triggers on the same gate from the other angle: any
boundary that meets the SDK bar above, where the same author
writes both sides. Include FFI bindings to internal crates here —
binding regeneration cost makes the boundary foreign-treated even
when the crate is same-repo.

## The deciding table

When a new decision lands — "should this be a provider hook? a
built-in toggle? a sibling package? a public type or an internal
seam?" — walk these in order. **First match wins.**

| Question                                                                                  | If yes →                                | Why                          |
| ----------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------- |
| Would customization let a consumer break the invariant this package exists to protect?    | **Core**, non-customizable              | Sovereignty                  |
| Is this genuinely a host-owned concern (I/O, locale, surface, credentials, clock)?        | **Provider** at construction            | Host knows what you can't    |
| Is this per-variant edit/parse/render semantics, complex but bounded by a spec or schema? | **Internal seam**, no public API        | Code organization, not API   |
| Does the candidate have ≥2 internal consumers AND can be tested without mounting the SDK? | **Separate layer** (own module/package) | Earned its separation        |
| Have ≥2 internal consumers shaped the contract already?                                   | **Eligible for public**                 | Public only after dogfooding |
| Otherwise                                                                                 | **Core, internally modular**            | Default-in, not default-out  |

The third rung — "complex but internal" — is where most
"extension-point" mistakes get caught. A real spec or schema (SVG
element table, MIDI event types, OpenType tables, USB device
classes) is the registry; the SDK implements against it. Don't
re-invite the spec to be re-implemented at runtime by consumers.

## Five disciplines

### D1. Subscribe to outcomes, not events

The public observation surface is **designed**, not raw. It exposes
purpose-built views — selection, mode, dirty/version, computed
property — each handling multi-target, capability variance, and
bookkeeping internally. Consumers never receive raw input events,
reducer actions, or internal state frames.

If a needed view doesn't exist, that's an **API gap to close, not
an internals hatch to open.** Exposing the internal stream because
"the consumer can compose it themselves" is how you wake up six
months later unable to refactor the core.

The same rule applies to the other direction: emit named outcomes
(intents, commands, requests), not "the user moved their pointer."
If your outputs carry phase markers (`preview` / `commit`, `begin` /
`progress` / `end`), the consumer wraps history/transactions without
guessing internal state.

### D2. Pure-logic core, thin adapter shell

One-directional dependency, layered:

```text
primitives / math  ←  logic core  ←  adapter shell  ←  host
```

The math/logic core has no I/O, no DOM, no canvas, no UI runtime,
no global clock. Plain function over plain inputs returns plain
output. **Runnable under the language's basic test runner with zero
mocks.** A Rust crate's core compiles under `no_std` where feasible;
a TS package's core has no `window` / `document` import; a Python
package's core does not touch the filesystem.

The shell is a thin wire: lifecycle, draw loop, host wiring. Its
own logic should be trivial enough to verify by inspection, because
**it's the part you can't test headlessly.**

Why this matters: when a shell grows logic, that logic ships
unguarded. Common failure: the shell holds a switch (`render`,
`dispatch`, `route`) and a new core variant is added without
updating the switch — the core's tests pass; the shell silently
drops the variant; downstreams hit it in production. **Push logic
into the core. Tests follow.**

### D3. Outputs that satisfy different constraints stay separate

Don't conflate outputs that exist to satisfy different constraints.
Every paired-but-asymmetric surface — render vs. hit-test, read vs.
write, declared vs. computed, preview vs. commit, encode vs. decode
— earns its asymmetry from a real disagreement in requirements.
When you find yourself unifying them "for elegance," you're about
to break one.

Concrete pattern: a UI surface that draws and hit-tests as two
separate outputs. Drawing optimizes for legibility at any zoom;
hit-testing optimizes for Fitts'-reach (fat targets, virtual regions
that extend past the visible shape). Collapsing them — sizing the
visual to match the hit AABB, or shrinking the hit region to match
the visual — breaks one of the two; each side has to compromise to
satisfy the other.

The generalization: tests assert each side separately, and — where
they intentionally differ — assert the direction of difference
(e.g., the hit region strictly contains the rendered bbox).

### D4. Anti-goals as defensive perimeters

Every published SDK ships an explicit **Anti-goals** section in its
README. It is not aspirational; it is the perimeter that lets the
package stay small. Examples that have already prevented bloat
across various Grida packages:

- "Not a host of plugins." — kills every PR that wants to add a widget registry.
- "Not undo-aware." — host owns history; SDK emits phase markers.
- "Not a private IR." — file bytes are the source of truth; the parsed view is rebuilt on load.
- "Not a renderer." — the surface backend is intentionally minimal.

When a feature request arrives, **the first question is which
anti-goal it would violate.** If it violates one, the right answer
is "this is the wrong tool." If it threatens one without crossing
it, write the anti-goal sharper.

Adding an anti-goal is the cheapest design work an SDK author does.

### D5. Names commit you

See $naming for the full treatment. The SDK-specific corollary:

- **Public identifier costs ≫ directory cost.** Directory rename is `git mv`; published-name rename is a coordinated downstream migration. Invest heavily before a name escapes its file.
- **Terseness is a uniqueness claim.** A bare `Surface`, `Encoder`, `Intent`, `Paint` in a package asserts "nothing else competes for this slot here." If a peer could be added later, qualify now.
- **Suffix siblings over nested folders.** Keep the parent's scope tight; new subdirectories quietly widen it.
- **Avoid leaking consumer concerns into the producer's names.** A type field documented as "used by `<consumer>` for `<feature>`" is leaking the consumer's problem into the contract. The field name should justify itself in producer-only terms.

## The promotion contract

Internal seams stay internal until **≥2 internal consumers** have
shaped the contract. This is not a bureaucratic gate — it's the
only way to avoid public APIs designed against one use case.

Promoting too early produces:

- The shape ossifies around the first caller's quirks.
- The second caller can't use it and writes a parallel API.
- Now you have two surfaces that drift, and you can't kill either.

Promoting too late costs little. Internal callers reach into
internals; you tighten when the second consumer arrives. **Default
direction of pressure is inward, not outward.**

When you do promote, the contract test is: "could a stranger build
the next caller against this API alone, without reading the SDK's
source?" If no, it's not promoted; it's exposed.

For very new packages without a second internal consumer yet, the
honest move is to mark the surface as unstable in its README
("v0.x.y — no compatibility guarantees") and let the second
consumer's needs shape the contract before locking it.

## Three extension paths, in order of preference

For any extensibility request, walk this ladder. **Reach down only
when the rung above doesn't fit.**

1. **Named built-in.** Things every consumer of this SDK will want
   live inside the package as first-class features with their own
   toggles. New canonical needs land here; open a PR against the SDK.
2. **Host-fed extras.** Transient, host-computed inputs/outputs passed
   through a designed slot (per-frame draw, per-event hook, per-message
   middleware). Best for things the host already computes and just
   wants threaded through.
3. **Escape hatch.** The host owns some boundary (container element,
   raw socket, file descriptor) and can splice its own logic in
   around the SDK. **Deliberate escape hatch — reach for it only
   when (1) and (2) don't fit, and prefer pushing canonical needs
   into (1) over keeping them at (3).**

What's absent from this ladder is a generic plugin / widget /
middleware registry. That's the point. A registry is the path that
turns small packages into god-classes — the lesson is repeated
across the industry (jQuery plugins, Babel plugins of the early era,
Webpack loaders) and locally (the Grida main editor's 6,800-line
god-class grew partly from this).

## Tests are spec

For an SDK, tests carry double weight:

- The SDK is configurable — hosts pass styles, providers, callbacks. Small refactors land all the time.
- There's no visible behavior to inspect from outside the package; one regression can ship silently across every downstream.

**Discipline: every default behavior is locked by a test whose
description names the behavior in plain language.** The test name
is the spec. The body proves the code obeys it. A comment above
explains _why_ — the design intent that the code itself can't carry.

Where applicable, embed scenario names verbatim in test text so
"did we drop a rule?" is grep-able across implementations and
ports. This matters most for SDKs that ship parallel implementations
(TS + Rust + WASM bindings) of the same contract.

A PR that touches a public behavior without touching the matching
test is a smell; a PR that flips a test's assertion without
changing the test name is a near-certain regression.

## Critique partners

- **`$pedantic`** — before drafting a public API, run the design through pedantic. The probes for unfalsifiability, vague quantifiers, and assumed-bedrock catch the "this feels finished but isn't grounded" failure mode that produces APIs you can't retract.
- **`$etiology`** — before patching across an SDK boundary, walk the diagnostic ladder. Most "quick fixes" at a boundary are API-contract bugs (rung 3), not call-site bugs (rung 2). Treating one as the other is how contracts rot.

## Cross-package work — the seam

Work that touches more than one SDK — your producer and its
consumer, two sibling packages, a published surface and its tests,
two crates on either side of an FFI boundary — has a specific
failure mode of its own: when you control both sides, you shotgun
changes across them in a single edit and the contract silently
degrades. The joint between the two sides is a **seam**; keeping
seams clean has its own discipline. See **`$sdk-seam`**.

## The short version

- Default is **core, not customizable.** Customization is the exception, defended by the deciding table.
- **Subscribe to outcomes, not events.** Designed views, not raw streams. Missing view = API gap, not internals hatch.
- **Pure core, thin shell.** The logic is testable headlessly; the shell is boring on purpose. Logic in the shell is logic you can't defend.
- **Asymmetric outputs stay separate.** Render vs. hit, read vs. write, declared vs. computed — different constraints earn different surfaces.
- **Anti-goals are defensive perimeters.** Every SDK ships them. Sharpen them before adding features.
- **Promote on dogfooding.** ≥2 internal consumers shape the contract before it escapes the package.
- **Three extension paths, in order: built-in → host-fed extra → escape hatch.** Generic plugin registries are the road to god-classes.
- **Tests are spec.** Every default behavior pinned by a test whose name is the rule and whose comment is the why.
- **The seam between two SDKs has its own discipline** — see `$sdk-seam`.
