---
title: "Grida XML modules and static component reuse"
description: "Open RFD proposing multi-file Grida XML linking through boxed component definitions and SVG-like use references while preserving ordinary Grida scene semantics."
keywords:
  - grida xml
  - components
  - multi-file rendering
  - modules
  - component reuse
  - source linking
tags:
  - internal
  - wg
  - format-schema
  - canvas
  - authoring
  - architecture
  - resources
  - scene-graph
format: md
---

# Grida XML modules and static component reuse

**Status:** Open RFD — selected proposal with a proving implementation of the
static Version 1 entry-rendering kernel: source units, local and external
component references, cycle-safe linking, ordinary-scene materialization,
provenance, resource origins, and local-file rendering. Explicit export roots,
complete-library validation, canonical source writers, and a complete
processing-limit policy remain unimplemented. None of the module/component
vocabulary introduced by this RFD is valid Draft 0 syntax.

“Static” is deliberate: Version 1 links and repeats exact component definitions.
Typed scalar props are proposed separately as a Version 2 delta in [Grida XML
component parameters](./grida-xml-component-parameters). Named direct render
projection is proposed separately as a Version 3 delta in [Grida XML component
slots](./grida-xml-component-slots). Deep overrides require still-later design.
None of that later syntax is silently extensible Version 1 syntax.

[Grida XML durable addressing](./grida-xml-addressing) accepts the next exact
delta: Version 4 requires IDs on render members and uses and turns the retained
use chain into a durable occurrence path. It leaves this Version 1 grammar and
its span-based diagnostic provenance unchanged.

**Companion specifications:** [Grida XML](./grida-xml), [Grida XML component
parameters](./grida-xml-component-parameters), [Grida XML component
slots](./grida-xml-component-slots), and [Grida XML durable
addressing](./grida-xml-addressing).

## Decision summary

This RFD proposes one direct model:

```text
source unit
├─ named boxed component definition*
└─ render root?

component reference = canonical source identity + component ID
use                  = one authored instance of that reference
materialization      = ordinary Grida container tree
```

The corresponding source shape is:

```xml
<!-- components/badge.grida.xml -->
<grida version="1">
  <component id="status-badge" width="48" height="48">
    <ellipse x="span 0 0" y="span 0 0" fill="#22C55E">
      <text x="center" y="center" fill="#FFFFFF">OK</text>
    </ellipse>
  </component>
</grida>
```

```xml
<!-- dashboard.grida.xml -->
<grida version="1">
  <container width="960" height="540" layout="flex" gap="24" padding="48">
    <use href="./components/badge.grida.xml#status-badge"/>
    <use href="./components/badge.grida.xml#status-badge"/>
  </container>
</grida>
```

The proposal makes these choices:

| Question                | Proposed answer                                                  |
| ----------------------- | ---------------------------------------------------------------- |
| Reference syntax        | `<use href="./file.grida.xml#component-id">`                     |
| External import aliases | None in the first version                                        |
| Component exports       | Explicit named exports; no default export                        |
| Definitions per file    | Zero or more                                                     |
| Scene root per file     | Zero or one; required only for a render entry                    |
| Component shape         | Boxed definition with ordinary `container` semantics             |
| Runtime shape           | Equivalent to an independent ordinary container subtree per use  |
| Layout participation    | One child position, using the component's declared box           |
| Resource base           | The source unit where each resource-valued token was authored    |
| Recursive instantiation | Invalid                                                          |
| Scalar props            | Proposed Version 2 delta; invalid in static Version 1            |
| Render-valued inputs    | Proposed Version 3 named-slot delta; invalid in static Version 1 |
| Deep patches            | Deferred until durable component-local identity exists           |

## Why this belongs above rendering

Component reuse is source intent. A definition exists once, a use names it,
and editing the definition affects every use. A renderer ultimately needs a
concrete scene, but copied render nodes alone cannot recover which file or use
produced them.

The system therefore has two distinct products:

1. a linked source program that retains files, definitions, uses, authored
   resource strings, and provenance;
2. a materialized scene containing ordinary Grida nodes for layout and
   rendering.

The second is derived from the first. It is not a replacement for it and is
not the canonical source form.

This boundary lets component bodies continue to use the existing Grida
primitives, paints, text, and layout. The proposal does not introduce a
parallel widget renderer, a second layout system, or a new paint abstraction.

## Goals

The first multi-file contract must:

- keep every dependency and instance visible in source;
- use the same reference spelling for local and external components;
- preserve one ordinary scene tree after materialization;
- make every use one predictable boxed position in parent layout and painter
  order;
- resolve relative component and image locations against the file where they
  were authored, never the process working directory;
- reject missing components, recursive expansion, and invalid materialized
  geometry before rendering;
- retain enough provenance to report both the use site and definition site;
- permit implementations to share immutable definition data without changing
  observable instance semantics; and
- preserve component/use source when writing rather than serializing copied
  descendants as if they had been authored inline.

## Non-goals of the first slice

The first slice does not define:

- an expression language or general data binding;
- arbitrary attributes whose names are invented by each component;
- scalar props or named/default slots;
- deep descendant overrides;
- component variants, inheritance, private exports, or re-exports;
- dynamic component references;
- recursive components;
- package names, versions, remote-fetch policy, or dependency lockfiles;
- durable node or instance identifiers;
- component-aware animation or event state; or
- a packed archive representation that preserves live instances.

These are not prohibited forever. They require a later exact source version so
multi-file loading and static reuse can become correct without prematurely
choosing their identity, typing, or evaluation models.

The scalar subset now has a focused proposal in [Grida XML component
parameters](./grida-xml-component-parameters). That proposal does not alter
this Version 1 boundary. The [component-slot
RFD](./grida-xml-component-slots) separately proposes exact Version 3 named
direct projection. It likewise does not alter Version 1.

The [durable-addressing RFD](./grida-xml-addressing) separately defines exact
Version 4 owner/member identity and use-occurrence paths. Version 1 provenance
remains diagnostic and does not become a generated durable identity.

## Vocabulary

| Term                     | Meaning                                                                |
| ------------------------ | ---------------------------------------------------------------------- |
| **Source unit**          | One independently located `.grida.xml` source                          |
| **Source identity**      | The canonical identity supplied by the source-resolution environment   |
| **Component definition** | A named, non-painting source definition with `container` semantics     |
| **Component identity**   | The pair `(canonical source identity, component ID)`                   |
| **Use**                  | One authored instance site referring to a component identity           |
| **Link**                 | Resolve references and validate the transitive component graph         |
| **Materialize**          | Produce the concrete ordinary scene observed by layout and rendering   |
| **Provenance**           | The source and component/use chain from which materialized intent came |

A future local component alias, runtime node handle, human node label, and
component identity are different facts. This RFD does not use one as a
substitute for another.

## Source-unit grammar

The proposed Version 1 envelope contains zero or more component definitions,
followed by at most one scene root:

```text
source-unit := component* container?
```

Comments and formatting whitespace may appear between those elements.
Component definitions must precede the scene root. No component definition
may appear inside a render tree or another component.

Definition order is not painter order and does not control lookup. A component
may reference a component declared later in the same source unit; source order
is retained only for stable inspection and writing.

A source unit may serve one or both roles:

| Contents                        | Role                                                   |
| ------------------------------- | ------------------------------------------------------ |
| Components and one `container`  | Renderable entry that also exports reusable components |
| One or more components, no root | Component library                                      |
| One `container`, no components  | Ordinary single-file scene                             |
| Neither                         | Invalid; the source unit exports and renders nothing   |

A host asked to render a source unit requires its one scene root. Referencing
a component-library source is valid even though that source has no scene root.
A scene root is never an implicit component export.

Version 0 retains its exact one-container-child contract and rejects every
element introduced here. A Version 1 linker must not reinterpret a Version 0
scene root as an unnamed component. Apart from the Version 1 envelope,
component, and use vocabulary proposed here, ordinary render nodes and their
properties retain the Grida XML contract they already have. Version 1 remains
strict current-version syntax: unknown elements, attributes, and structural
children—including Version 2 parameter syntax—are errors rather than inert
extension data.

## Component definitions

A component definition has one required `id` and otherwise has the same
authored box, paint, stroke, clipping, layout, and child grammar as
`container`:

```xml
<component
  id="primary-button"
  name="Primary button"
  width="180"
  height="56"
  layout="flex"
  main="center"
  cross="center"
  corner-radius="14"
  fill="#7C3AED"
>
  <text font-size="18" fill="#FFFFFF">Continue</text>
</component>
```

At its definition site, `component` is non-rendering: it has no painter
position and contributes no scene bounds. At each use, it materializes as one
ordinary `container` carrying the definition's authored properties and
children. A component may contain nested `use` children wherever an ordinary
container may contain render children.

This boxed boundary is deliberate. It gives every instance the same known
layout kind, including well-defined flex growth and cross-axis alignment, and
avoids making use-site validity depend on choosing among the incompatible root
contracts of path, text, line, group, or lens. Reusable primitive content
remains straightforward: place the primitive inside the component box.

The definition has no visual parent, so `x`, `y`, `flow`, `grow`, and `align`
are invalid on `component`. A use supplies that caller relationship when the
definition is instantiated. All other attributes and structural children are
validated exactly as they would be on `container`; component does not acquire
a second layout or paint grammar.

Every top-level component is public to references that can resolve its source
unit. Version 1 has no private export, re-export, or component alias construct.

### Component IDs

`component id` is an exported symbol in one source unit. It is separate from
the human-readable `name` inherited from `container`, from future durable
render-node identity, and from materialized runtime handles.

The export `id` is definition metadata and is not copied into the materialized
container as a render-node ID. Repeated uses receive distinct runtime handles;
a future durable instance/root identity requires its own authored contract.

The proposed first grammar is a lowercase kebab-case identifier:

```text
component-id := [a-z][a-z0-9]*("-"[a-z0-9]+)*
```

IDs are case-sensitive and unique within one source unit. The same ID may
exist in unrelated source units because its qualified component identity also
contains the canonical source identity.

## Uses and references

`use` is valid wherever one render-node child is valid. It is invalid inside
`text`, `tspan`, `fill`, `stroke`, `gradient`, or any other typed property
subtree.

Every use requires one `href` whose fragment is a component ID:

```xml
<use href="#local-card"/>
<use href="./cards.grida.xml#metric-card"/>
```

The fragment is always required. These are invalid:

```xml
<use href="./cards.grida.xml"/>
<use component="metric-card"/>
<metric-card/>
```

Version 1 `use` is empty. Character data, render children, `arg`, `content`,
`fill`, `stroke`, and every other structural child are invalid.

Requiring an explicit component-ID fragment avoids an implicit default export and prevents a
file from gaining a second canonical reference merely because it happens to
contain one component today.

After XML entity decoding, the Version 1 lexical form is:

```text
href := "#" component-id | location "#" component-id
```

`location` is a non-empty URI reference without a literal fragment or ASCII
whitespace. A literal `#` in the location must be percent-encoded if the source
environment supports it; a backslash is invalid. A query may remain part of
`location` and is interpreted only by the source environment. The component
fragment itself is not percent-decoded: it must already match the exact ASCII
`component-id` grammar. Additional literal `#` characters are invalid.

### Reference resolution

For `href="location#id"`:

1. an empty `location` selects the source unit containing the use;
2. a non-empty relative location resolves against that source unit's base
   location;
3. the source-resolution environment returns one immutable link snapshot:
   bytes, a canonical source identity, and a canonical base location;
4. the selected source must declare exactly `version="1"` for a Version 1 link;
5. `id` is looked up only in that source's component-export namespace.

The parser itself performs no file, package, network, or decode operation.
Allowed schemes, filesystem roots, symlink policy, network access, source-size
limits, and caching belong to the explicit source-resolution environment. The
syntax grants none of those capabilities by itself.

Within one link operation, one canonical source identity must always denote
the same bytes and canonical base. Two lexical locations that map to that
identity therefore share one component namespace for caching and cycle
detection, and their nested relative references resolve from the same base.
An environment that cannot provide that stable tuple must report a source
resolution failure rather than reuse an ambiguous cache entry. The authored
`href` remains unchanged in source.

Future language versions may define explicit backward-link rules. Version 1
does not transitively acquire syntax from a newer component source and does
not treat a version-0 scene as a component library.

## Instance boundary

A use is a source-level instance boundary. It contributes one materialized
component container to the caller's child list but introduces no additional
painted wrapper around that container.

The first slice accepts only properties that belong to the relationship
between that component and its caller:

| Attribute | Meaning                                                        |
| --------- | -------------------------------------------------------------- |
| `href`    | Required qualified component reference                         |
| `name`    | Optional human-readable label for this use                     |
| `x`, `y`  | Non-span free-position binding of the component container      |
| `flow`    | Flex participation of the component container                  |
| `grow`    | Main-axis growth of the component container                    |
| `align`   | Cross-axis override of the component container                 |
| `hidden`  | Removes this one instance from layout and painting when `true` |

Applicability remains contextual: `flow`, `grow`, and `align` are valid only
when the use occupies the corresponding position under a flex container, and
an in-flow use omits `x` and `y` exactly like an ordinary in-flow node. The
`x` and `y` values accept start, end, and center pins but not `span`, because
the component definition owns authored size intent. Flex growth and stretch
may still assign a different resolved box through the ordinary container
layout contract without rewriting that intent.

The component definition owns its width, height, constraints, paints, strokes,
layout, opacity, rotation, flips, clipping, and all other internal intent.
Those values are not silently overwritten by same-named attributes on `use`.
Changing them requires editing the component or, after parameterization is
specified in a later version, using its declared API. Authors can wrap a use
in an ordinary `group`, `container`, or `lens` when they need additional
composition or visual transformation without changing the component.

During materialization, `x`, `y`, `flow`, `grow`, and `align` replace the
component definition's forbidden parent relationship with the values authored
on the use or their ordinary defaults. They do not replace any definition-owned
box or visual property.

`hidden="true"` is an instance gate. It suppresses the use even if the
definition container is active. Omission or `false` does not force a
definition container that is itself hidden to become visible.

Equivalently, materialized activity is definition activity logically AND the
inverse of use `hidden`. The relationship fields above are validated after
linking against the component's known container semantics, and diagnostics
identify both the use and definition when their combination is invalid.

`name` labels the retained use occurrence. It neither renames the component
definition nor replaces the materialized container's definition-owned node
label. A component-aware inspector reads the use label from retained
provenance; a rendering-only ordinary tree need not carry it in its one node
label field.

## Layout and painter order

Materialization places the referenced component container at the use's exact
position in its caller's ordered child list.

- The caller observes one layout child, not the component's children as
  independent siblings.
- Under flex layout, the use consumes one flex slot. Its `grow`, `align`, and
  `flow` values apply to that slot.
- Free `x` and `y` bindings place the component container in the caller's
  local box.
- The materialized container's box is the instance's effective box.
- The top-level definition paints nothing at its declaration site.
- The materialized container paints at the use's sibling painter position.
- Internal children preserve their component-source order and ordinary local
  coordinate semantics.

An implementation may physically clone each subtree, retain immutable shared
definition data, or cache a component-specific display result. It is
conforming only when the observable result is equivalent to each use owning
an independent ordinary subtree. State, visibility, layout assignment, and
resource resolution from one use must not leak into another.

The use occurrence remains an observable component boundary even when
rendering consumes an expanded ordinary tree. Materialized descendants retain
their containing use in provenance; flattening them without that map is a
rendering projection, not a complete component-aware model. Selection,
snapping, hit inspection, isolation, and definition-editing policy belong to
the consuming editor, which may expose either the instance or its descendants
without erasing that boundary.

## Linking and materialization

Multi-file rendering requires an explicit stage between parsing and ordinary
scene resolution:

```text
entry source + source environment
  → parse source units
  → resolve component references
  → validate the component-expansion graph
  → materialize one ordinary scene + provenance + resource manifest
  → resolve layout, text, paths, and paints
  → render
```

Every operation begins with the entry source as the same immutable snapshot
required for dependencies: bytes, canonical source identity, and canonical
base location. Local component identity and entry-relative `href` and `src`
values use that entry snapshot rather than an ambient working directory.

Parsing one source unit preserves its component definitions, uses, raw
resource strings, and local source locations. It does not immediately erase
them into a concrete scene.

Linking resolves the requested reference closure and validates the qualified
graph. Materialization then produces the ordinary tree consumed by scene
resolution. Every materialized node remains attributable to:

- its authored source unit and source location;
- the component definition, if any, that contains it; and
- the ordered use chain through which it entered the entry scene.

That provenance is diagnostic and source-preservation data. It is not an
authored transform, layout property, or globally stable node identifier in
Versions 1 through 3. Version 4 adds explicit IDs and derives its durable
address from those authored facts rather than promoting spans or traversal
positions.

### Validation closures

Three closures remain distinct:

1. **Source validation** checks the complete syntax and local invariants of
   every source unit loaded for the operation.
2. **Link validation** starts from the requested scene root or explicitly
   requested component exports and traverses every syntactically contained
   `use`, including uses under hidden nodes or with `hidden="true"`. It resolves
   references, validates placement, and rejects cycles. An entry render need
   not resolve an unused export; a complete library-validation operation uses
   every exported component in that library as a root.
3. **Render-resource preflight** inspects the materialized scene for the
   requested render environment and applies the base Grida XML image-resource
   contract. The module layer changes lexical origin and collision behavior;
   it does not weaken which authored image paints a strict materializer must
   resolve.

These distinctions prevent hidden recursion from escaping link checks while
keeping module traversal separate from image-resource resolution.

## Resource provenance

Relative resources retain lexical origin across component expansion.

```text
components/button.grida.xml  owns  <image src="./texture.png"/>
scenes/dashboard.grida.xml   owns  <use href="../components/button.grida.xml#button"/>
```

The image resolves relative to `components/button.grida.xml`, not the
dashboard, not the current working directory, and not the location of a use.

This rule is required even when two source units author the same string:

```text
components/button.grida.xml → ./texture.png
cards/card.grida.xml        → ./texture.png
```

Those references may name different resources. A materializer must therefore
retain the pair `(source origin, authored resource identifier)` until resource
resolution, or lower it to an equivalent collision-free runtime key while
preserving the authored string separately. Keying both resources by the raw
string alone is non-conforming.

All image resources in the render-resource closure must be resolved or
reported before a strict render claims success. Linking a component must not
cause resource I/O during the painter's execution.

Version 2 property arguments retain the origin of their supplying literal,
while definition-authored defaults retain the definition's origin, as defined
by the [component-parameter RFD](./grida-xml-component-parameters). Version 3
assignment roots retain their caller source origin as defined by the
[component-slot RFD](./grida-xml-component-slots). Substitution and projection
must never make a relative resource silently change bases.

## Cycles and finite expansion

The semantic dependency graph is the component-expansion graph. Its vertices
are qualified component identities, and an edge exists when one component's
container subtree syntactically contains a use of another component in the
link-validation closure. Hidden state does not remove this edge.

Direct and indirect cycles are invalid:

```text
a.grida.xml#button
  → b.grida.xml#icon
  → a.grida.xml#button
```

A diagnostic reports the complete qualified chain and the use location for
each edge. A mere source-reference loop that creates no component-expansion
cycle need not be rejected, although a host may still limit the number of
loaded source units.

Acyclic graphs can still expand rapidly when definitions contain many uses.
A processing environment may impose declared limits on source count, link
depth, materialized nodes, text bytes, image bytes, or total expansion work.
Exceeding a limit is a typed resource-limit failure. It must not produce a
silently truncated scene.

## Identity and editing

The proposal distinguishes four identities:

| Identity                     | Scope and purpose                                         |
| ---------------------------- | --------------------------------------------------------- |
| Component ID                 | Unique export symbol inside one source unit               |
| Qualified component identity | Canonical source identity plus component ID               |
| Use occurrence               | One authored instance position in a caller's source tree  |
| Materialized runtime handle  | Temporary identity used by one concrete scene realization |

Repeated uses of one component are distinct instances. Their materialized
descendants must not collide merely because they share definition content.

Version 1 adds only the component-export ID defined above; it still has no
durable render-node or use-occurrence identity. This proposal therefore does
not pretend a `name`, child index, XML path, or runtime handle can support
stable deep overrides. If durable IDs are later admitted inside definitions, a
descendant instance identity can be formed from an instance path plus a
component-local durable ID. It must not be created by concatenating strings
that can collide after nesting or renaming.

A component-aware editor must retain the observable use boundary and may
choose how instance selection, definition editing, or descendant isolation are
presented. Editing the definition changes every linked use; editing the use
changes only its instance-boundary intent. Detaching or flattening an instance
is an explicit conversion that severs the reference.

## Source preservation and conversion

Three writer domains are distinct:

1. **Source-preserving same-location write-back** operates on parsed source
   units and may follow only an entry-relative link. It preserves each unit's
   declared version, component-definition order, authored references,
   argument order, resource strings, canonical base association, and
   unresolved uses outside the requested link closure. It performs no
   normalization that requires an unresolved target interface.
2. **Canonical source-unit writing** is defined only when every target
   interface needed for target-dependent normalization in that unit has
   linked successfully. It applies the canonical rules belonging to that
   unit's declared version.
3. **Canonical multi-file writing** requires the complete library-validation
   closure: every scene root, export, and syntactically contained use in the
   program being written must link and validate. It canonicalizes each source
   unit independently under that unit's declared version.

Every writer writes source units, component definitions, and uses rather than
the materialized clone tree. A partial-link write may be source-preserving,
but it must not claim complete canonicalization. Failure to obtain a target
interface required for canonical ordering is a canonical-write failure; it is
not permission to drop the use, guess its interface, or rewrite it under
another version.

Writing the program to a different source/base mapping is relocation, not
ordinary canonical write-back. A relocation operation must either rebase every
affected component and resource reference while preserving its target or keep
the original base mapping available. It must report any reference it cannot
preserve. Full library validation remains a separate operation that starts
from every export and therefore resolves references that an entry-only link
may leave untouched.

Flattening a linked program into a single Draft 0 scene or into a target that
has no component/instance model is a conversion with declared loss:

- component definitions become copied descendants;
- uses cease to be linked;
- definition edits no longer propagate;
- instance and definition provenance may be discarded; and
- source-relative resources must be rebased or packaged without changing the
  referenced bytes.

A converter must either complete that flattening correctly and report that
reuse intent was lost, or reject the target. It must not emit an archive that
appears to preserve live instances when it stores only copies.

## Validation and diagnostics

Failures are separated by phase:

| Phase               | Representative failures                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| Source parsing      | malformed XML, duplicate component ID, invalid top-level order            |
| Source resolution   | missing file, disallowed scheme, unreadable source, unsupported version   |
| Linking             | missing component fragment, unknown component, expansion cycle            |
| Materialization     | illegal use placement, invalid component/use relationship, limits         |
| Resource resolution | missing or undecodable image with its lexical source origin               |
| Scene resolution    | ordinary layout, text, path, or numeric failure with component provenance |

Useful diagnostics include:

- `component reference requires an ID fragment; use ./button.grida.xml#button`;
- `component "button" is not defined in ./controls.grida.xml; available: icon-button, menu-button`;
- `duplicate component "button" in the same source unit`;
- `<component> requires id="…" using lowercase kebab-case`;
- `<component> cannot declare x; place the instance with x on <use>`;
- `x="span 0 0" is invalid on <use>; component definitions own authored size`;
- `unknown attribute width on <use>; component sizing is not an implicit root override`;
- `static Version 1 <use> cannot contain children; arg requires Version 2 and render assignments require Version 3`;
- `unknown attribute label on <use>; Version 1 components do not define dynamic attributes`;
- `component cycle: a.grida.xml#button → b.grida.xml#icon → a.grida.xml#button`;
- `image "./texture.png" authored in components/button.grida.xml resolved to … and could not be decoded`.

A cross-file diagnostic should identify the immediate use, the referenced
definition when relevant, and the transitive reference chain. A failure in a
materialized descendant should not be reported only with a transient runtime
handle.

## Current model compatibility

The current canonical scene and packed archive contracts do not define live
component or instance values. Their scene shape is an ordinary single-parent
tree. The proposal does not conceal that incompatibility.

Initial layout and raster rendering can conform by retaining the linked source
program and materializing each use into an ordinary container subtree before
scene resolution. This does not require components to become a new geometry,
paint, or layout primitive. Component-aware querying and editing additionally
require the retained atomic use/provenance boundary and cannot be reconstructed
from the ordinary rendering tree alone.

The ordinary materialized scene alone is insufficient for:

- canonical multi-file source writing;
- linked definition editing;
- durable instance or descendant identity;
- deep overrides;
- preserving instances through the packed archive; or
- attributing relative resources and diagnostics after source provenance is
  discarded.

Those capabilities require the retained source program described here or a
later explicit definition/instance model in the canonical scene and archive.
An unsupported target must flatten explicitly or reject; it must not store
component syntax in an XML-only side table while claiming full scene-model
round-trip.

## Later exact component versions

### Version 2 scalar parameterization

Static reuse is intentionally the complete Version 1 language boundary.
Strict exact-version parsing means parameterization cannot be added silently
to `version="1"`.

The [Grida XML component parameters](./grida-xml-component-parameters) RFD
proposes the Version 2 delta: leading typed `prop` declarations, explicit
`arg` children, exact scalar bindings, literal defaults, forwarding, lexical
resource origins, and source-preserving materialization. Version 1 continues
to reject all of that syntax.

That later RFD also defines the one backward-link exception: a Version 2
operation accepts a Version 1 component as an empty-interface static
definition. It does not permit a Version 1 operation to link a Version 2
source, so this RFD's exact-Version-1 rule remains unchanged for Version 1
operations.

### Version 3 named slot projection

The [Grida XML component slots](./grida-xml-component-slots) RFD proposes the
Version 3 delta: empty inline `<slot name="…"/>` declarations and direct render
roots under `use` carrying the contextual `slot="…"` assignment relationship.
Zero roots erase the marker; one or more roots splice directly in caller order.
Version 3 defines no wrapper, unnamed/default slot, fallback, requiredness, or
explicit-empty form. Version 1 and Version 2 continue to reject that syntax.

Arbitrary deep patches remain deferred until durable component-local identity
and stale-target behavior exist. Dynamic `href`, element-name substitution,
loops, conditions, and a general expression language remain outside static
parameterization and projection.

## Considered alternatives

### Direct `href` on `use` — accepted

`<use href="./ui.grida.xml#button">` is self-contained, familiar from SVG,
copy/pasteable with its dependency visible, and uses one spelling for local
and external references. Switching a component is one surgical attribute
edit.

### Import aliases — deferred

```xml
<import href="./ui.grida.xml" as="ui"/>
<use component="ui.button"/>
```

Aliases shorten heavily repeated paths, but add an alias namespace, an import
declaration that must move with copied content, and a second layer to diagnose.
Supporting both alias and direct forms would create two canonical references.
Aliases should be reconsidered only if real authored files demonstrate that
reference repetition is materially harmful.

### One unnamed/default component per file — rejected for the first version

An implicit default makes a one-component file short, but it conflicts with an
optional scene root, cannot be referenced locally by ID, and becomes
ambiguous when a second component is added. Requiring a fragment keeps every
reference explicit and stable.

### Custom element names — rejected

```xml
<ui:button/>
<metric-card/>
```

Custom tags make unknown built-in syntax indistinguishable from a missing
component binding, introduce namespace and case rules, and make a component's
source location invisible at the use site. The fixed `use` element produces
better diagnostics and more predictable LLM output.

### Textual include — rejected

An include copies bytes or nodes but does not define component identity,
instance ownership, editing propagation, cycle behavior, or caller-versus-
definition resource provenance. It solves file concatenation, not reuse.

### Engine-native shared subgraphs as the source model — deferred

Sharing one definition subtree internally can be an optimization, but the
observable scene remains equivalent to independent instances. Requiring a
shared render graph in the source contract would force a scene-model and
archive change before basic multi-file rendering needs one.

### Arbitrary render-root definitions — rejected for Version 1

Wrapping any one path, text, line, group, lens, or container as a component is
compact, but makes caller-layout behavior depend on a hidden root kind. Span
bindings, flex growth, cross-axis stretch, and derived-box geometry do not
share one applicability contract across those kinds. Version 1 gives every
component an explicit container box instead; primitive content remains a
child of that box.

### Arbitrary component-property overrides on `use` — rejected from the core

Letting every component property appear on `use` couples callers to definition
internals and creates replacement-versus-composition questions for paint,
opacity, transforms, clipping, and layout. The core keeps only the caller
relationship on `use`; the [component-parameter
RFD](./grida-xml-component-parameters) proposes intentional customization
through declared props and explicit arguments in Version 2.

## Proposed conformance requirements

A conforming implementation of this proposal:

1. **MUST** preserve every loaded source unit, component definition, use,
   authored reference, and lexical resource origin in its source program.
2. **MUST** require explicit component-ID fragments and reject missing or
   duplicate component IDs.
3. **MUST** resolve relative component references against the containing
   source unit through an explicit source environment whose link snapshot
   supplies stable bytes, canonical identity, and canonical base.
4. **MUST** reject direct or indirect component-expansion cycles before scene
   resolution, including cycles through hidden uses.
5. **MUST** require every linked Version 1 component source to declare exactly
   `version="1"` unless a later specification defines cross-version linking.
6. **MUST** make each use observably equivalent to an independent ordinary
   container subtree at the use's one caller position.
7. **MUST** preserve ordinary layout, painter order, local coordinates,
   fills, strokes, text, and resource semantics inside the component.
8. **MUST** distinguish a source/link failure from an ordinary scene or
   resource-resolution failure and report cross-file provenance.
9. **MUST NOT** resolve relative images against the entry source merely
   because the materialized scene is flat.
10. **MUST NOT** serialize materialized copies as canonical component/use
    source.
11. **MUST** preserve each source unit's declared version and every unresolved
    use outside the available link closure during source-preserving
    same-location write-back.
12. **MUST NOT** claim canonical multi-file output without completing the full
    library-validation closure required by target-dependent normalization.
13. **MUST NOT** claim live-instance archive round-trip when the target stores
    only flattened nodes.
14. **MUST** retain each use as an observable component/provenance boundary,
    even when rendering consumes an expanded tree; interaction policy remains
    a consumer concern.
15. **MAY** cache, intern, or share immutable definition data when that does
    not change instance behavior or diagnostics.
16. **MAY** expose declared processing limits, but exceeding them must fail
    explicitly rather than truncate the scene.
