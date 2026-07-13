---
title: "Grida XML component slots"
description: "Open RFD proposing exact Version 3 named render-slot projection for Grida XML components while preserving caller lexical ownership and an ordinary materialized scene."
keywords:
  - grida xml
  - component slots
  - named slots
  - content projection
  - static materialization
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

# Grida XML component slots

**Status:** Open RFD — selected Version 3 named direct-slot projection delta
with a proving implementation of exact source parsing, linking, direct
projection, projection provenance, ordinary-scene materialization, and
local-file rendering. Canonical source writers and complete-library validation
remain unimplemented. None of the slot vocabulary introduced by this RFD is
valid Version 0, Version 1, or Version 2 syntax.

**Companion specifications:** [Grida XML](./grida-xml) owns ordinary authored
scene values. [Grida XML modules and static component
reuse](./grida-xml-modules) owns source units, boxed component definitions,
`use`, linking, materialization, and component provenance. [Grida XML component
parameters](./grida-xml-component-parameters) owns Version 2 scalar props,
arguments, bindings, and lexical scalar scope. This RFD specifies only the
Version 3 render-slot delta. [Grida XML durable
addressing](./grida-xml-addressing) owns the later Version 4 member/use
identity and occurrence-path delta.

## Decision summary

Version 3 components declare named insertion points inline. A Version 3 use
supplies zero or more direct render roots to those names:

```xml
<grida version="3">
  <component
    id="button"
    width="120"
    height="40"
    layout="flex"
    main="center"
    cross="center"
    fill="#7C3AED"
  >
    <prop name="label" type="string"/>
    <text fill="#FFFFFF">{label}</text>
  </component>

  <component
    id="card"
    width="320"
    height="220"
    layout="flex"
    direction="column"
    gap="16"
    padding="20"
  >
    <prop name="title" type="string"/>

    <container name="media-frame" width="280" height="112">
      <slot name="media"/>
    </container>

    <text font-size="24">{title}</text>

    <container width="280" height="40" layout="flex" gap="8">
      <slot name="actions"/>
    </container>
  </component>

  <container width="960" height="540">
    <use href="#card">
      <arg name="title" value="Direct named projection"/>

      <rect slot="media" width="280" height="112" fill="#2563EB"/>

      <use href="#button" slot="actions">
        <arg name="label" value="Back"/>
      </use>
      <use href="#button" slot="actions">
        <arg name="label" value="Continue"/>
      </use>
    </use>
  </container>
</grida>
```

The proposal makes these choices:

| Question                 | Version 3 answer                                   |
| ------------------------ | -------------------------------------------------- |
| Declaration              | Empty inline `<slot name="media"/>`                |
| Assignment               | Direct render root under `use` with `slot="media"` |
| Names                    | Required, case-sensitive lowercase kebab-case      |
| Cardinality              | Zero, one, or many roots per declared slot         |
| Absence                  | Zero roots erase the marker                        |
| Topology                 | Direct splicing; no implicit wrapper               |
| Default slot             | None                                               |
| Fallback or requiredness | None                                               |
| Explicit empty           | None; omission is the empty projection             |
| Lexical ownership        | Caller source                                      |
| Structural placement     | Slot declaration site                              |
| Rendering representation | Existing ordinary scene nodes only                 |

“Static” means the target component, declared slot interface, supplied roots,
and resulting topology are determined during linking and materialization.
Version 3 slots do not add runtime-changing selection, conditions, or
reactivity.

## Why Grida owns projection above rendering

Scalar props specialize values but cannot carry typed render trees. Encoding a
subtree as a string would require a second parse, erase node typing and source
locations, and make resource and binding ownership ambiguous. Copying the
component shell at every call site would instead discard the reusable
definition.

Slot projection is therefore retained component-source intent. The linked
source program preserves declarations, assignments, lexical owners, and use
boundaries. Materialization removes that vocabulary and produces the ordinary
scene already consumed by layout and rendering. A slot is not a new geometry,
box, paint, or runtime node kind.

## Goals

Version 3 projection must:

- accept caller-authored typed render roots without parsing strings as XML;
- make every destination explicit and named;
- preserve caller resource bases, scalar scope, nested references, and source
  provenance;
- give projected roots the exact parent layout, local coordinate space,
  clipping ancestry, and painter position selected by the definition;
- preserve one ordinary materialized scene with no slot vocabulary;
- reject unknown destinations and invalid projected relationships before
  ordinary scene resolution;
- include assigned content in finite-expansion and cycle validation; and
- remain predictable for direct human and language-model authoring.

## Non-goals

Version 3 does not define:

- unnamed or default slots;
- fallback children, required slots, or an explicit-empty sentinel;
- a slot assignment wrapper or boxed slot node;
- render nodes as scalar prop values;
- deep descendant overrides or patches;
- conditions, loops, reactive content, or dynamic component references;
- durable use, assignment-root, or projected-descendant identity;
- component variants or inheritance; or
- live-component persistence in the packed archive.

An author may deliberately assign an ordinary `group` or `container`, but that
node retains its ordinary scene meaning. It is not an implicit slot wrapper.

## Vocabulary

| Term                      | Meaning                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| **Slot declaration**      | One named, non-rendering insertion marker in a component body                              |
| **Assignment root**       | One caller-authored direct render child of `use` carrying `slot`                           |
| **Projection**            | Replacement of one slot marker by its matching assignment roots                            |
| **Slot identity**         | Qualified component identity plus component-local slot name                                |
| **Projection occurrence** | One declared slot as observed through one concrete use occurrence                          |
| **Lexical owner**         | Source context that owns parsing, bindings, resources, references, and authored provenance |
| **Structural parent**     | Definition-owned ordinary node that receives projected roots                               |

Component identity, use occurrence, slot identity, assignment root,
materialized root occurrence, and runtime node handle are different facts.
This RFD does not substitute one for another.

## Version relationship

Version 3 inherits the complete Version 2 component-parameter model and adds
only the syntax and semantics in this RFD.

| Caller source | Version 1 target | Version 2 target | Version 3 target                       |
| ------------- | ---------------- | ---------------- | -------------------------------------- |
| Version 1     | Static use       | Rejected         | Rejected                               |
| Version 2     | Static use       | Scalar arguments | Rejected                               |
| Version 3     | Static use       | Scalar arguments | Scalar arguments and named assignments |

Direct render assignments are valid only on a Version 3 caller-to-Version 3
target edge. Older callers reject a Version 3 target even when that target
happens to declare no props or slots. A Version 3 caller may link a Version 1
component only as an empty-interface static definition and a Version 2
component only through its declared scalar interface; neither older target
may receive render assignments.

Version semantics are selected per source unit and reference edge. Reachability
from a Version 3 entry does not upgrade, reparse, or reinterpret an older
source. A Version 2 component that references a Version 3 component still
fails on that Version 2 edge.

## Grammar delta

The Version 3 delta is:

```text
component-render-item := existing-render-root | slot
slot                  := empty `slot` element with exactly `name`
use                   := empty-use | use-start arg* assignment-root* use-end
assignment-root       := render-root carrying contextual `slot`
slot-name             := [a-z][a-z0-9]*("-"[a-z0-9]+)*
```

Comments and formatting whitespace do not affect the grammar. An existing
render root includes an ordinary render element or a nested component `use`.
A slot declaration is a source marker, not a render root, and therefore cannot
itself be supplied as an assignment root.

Every `arg` remains the Version 2 typed property child. All arguments precede
all assignment roots. Once the first assignment root begins, a later `arg` is
invalid. Non-whitespace character data and every other structural child remain
invalid inside `use`.

## Slot declarations

`slot` is an empty element with exactly one attribute:

| Attribute | Requirement | Meaning                          |
| --------- | ----------- | -------------------------------- |
| `name`    | Required    | Component-local destination name |

The name is case-sensitive and uses the same lowercase kebab-case lexical
grammar as component IDs and prop names. Slot names are unique across one
complete lexical component body. The scan does not enter a referenced
component definition. Slot names and prop names occupy distinct namespaces;
the same spelling does not alias one to the other.

A slot declaration is valid only when:

- its containing source declares `version="3"`;
- it is lexically enclosed by one component definition; and
- it occupies a position where an ordinary render child would be valid.

It may therefore appear directly in the component's container-like child list
or under a render descendant that accepts children. It is invalid in a scene
root, `text`, `tspan`, `fill`, `stroke`, `gradient`, or any other typed property
subtree. It is also invalid as a direct child of `use`, whose render roots are
assignments rather than declaration sites.

The declaration accepts no fallback children, character data, relationship
attributes, visual properties, or `required` state. Declaring a slot does not
make supplying it mandatory.

## Assignment roots

Every direct render root under a Version 3 `use` requires one `slot` attribute:

```xml
<use href="#card">
  <rect slot="media" width="280" height="112"/>
  <use href="#button" slot="actions"/>
</use>
```

The `slot` attribute is contextual source relationship metadata. It selects a
declaration on the linked target. It is not an ordinary render property and is
invalid on a node merely because that node appears elsewhere. A nested node
may carry `slot` only when it is itself a direct assignment root of a nested
Version 3 `use`.

One root assigns to exactly one name. Repeated roots naming the same slot are
valid and are not duplicate assignments. Their direct-child order is their
projection order. A missing, empty, malformed, or misplaced `slot` attribute
is a source error. A syntactically valid name not declared by the linked target
is a link error.

A use may supply no roots even when its target declares slots. Omission is the
only empty-projection spelling. A hidden assigned root is still an assignment:
it is retained, linked, validated, and materialized under the ordinary hidden
contract rather than treated as absence.

## Projection semantics

For a slot named `s`, take the subsequence of the use's direct assignment roots
whose `slot` value is `s`, preserving caller order. Replace the declaration at
its exact position in the definition parent's ordered child list:

| Matching roots | Replacement at the marker                           |
| -------------- | --------------------------------------------------- |
| Zero           | Nothing; the marker disappears                      |
| One            | That ordinary root                                  |
| Many           | All matching roots as consecutive ordinary siblings |

The marker contributes no box, layout position, flex position, gap, clipping
boundary, painter operation, or materialized node. The assignment `slot`
attribute is consumed by projection and does not appear on the ordinary root.

Each projected root participates independently in the destination parent's
ordinary child contract. Under flex layout, multiple roots consume multiple
flex positions and zero roots consume none. In free placement, each root's
bindings resolve in the destination parent's local box. The slot does not
reserve space when empty and does not group several roots into one layout
child.

Definition order determines order across distinct slot declarations. Caller
order determines order among roots assigned to one slot. Assignment roots for
different names have no cross-slot painter ordering effect because the
definition owns their destination positions. Their authored direct-child order
is nevertheless retained for inspection and source writing.

The destination parent and declaration position determine:

- the local coordinate space;
- flex or free-position relationship rules;
- ordinary ancestor transforms, opacity, and clipping; and
- painter position relative to definition-owned siblings.

Parent-dependent relationship validation occurs after the target and slot
parent are known. For example, a projected root carrying `grow` requires an
in-flow position under a flex destination parent; a root projected elsewhere
cannot retain `grow` as dormant state.

## Lexical ownership

Projection changes structural parenthood without changing lexical ownership:

| Fact                                                    | Owner after projection                       |
| ------------------------------------------------------- | -------------------------------------------- |
| Element grammar and source version                      | Caller source unit                           |
| Scalar binding scope                                    | Lexically enclosing caller component, if any |
| Resource base                                           | Source containing the supplying literal      |
| Nested `use href` base                                  | Caller source unit                           |
| Authored node provenance                                | Caller assignment site                       |
| Destination parent and insertion index                  | Slot declaration                             |
| Parent layout, local coordinates, and clipping ancestry | Definition structure                         |
| Callee prop environment                                 | Definition-owned content only                |

Assigned content inside an outer component binds to that outer component's
props. It never captures a same-named prop declared by the slot-owning callee.
At top-level scene scope it has no prop environment. A scalar string remains a
scalar string and is never reparsed as assigned XML.

The assignment root and every literal in its subtree retain the source unit in
which they were authored. Projection never rebases a relative image or nested
component reference to the callee source. A nested use resolves its `href`
against the caller source exactly as it did before projection.

## Linking, cycles, and finite expansion

Version 3 extends component-expansion validation to the assigned subtrees that
become reachable through projection. Expansion follows:

- every definition-owned nested use in the ordinary component body; and
- every nested use in each supplied assignment subtree at its projected
  position.

Cycle ownership follows lexical component definitions, not the temporary
structural parent created by projection. A nested use in assigned content
contributes an edge from the component definition that lexically owns that
assignment, when one exists. If that edge returns to a component already being
expanded through the caller's definition chain, the program is recursive and
invalid.

A top-level scene is not a component definition. It may therefore explicitly
nest a second use of the same component in an outer use's assignment when the
authored tree is finite—for example, an outer card whose assigned content is
one inner card with no further assignment. By contrast, component `outer`
cannot use `card` and assign a use of `outer` into `card`; that assignment is
lexically owned by `outer` and closes a recursive definition cycle. A useful
diagnostic reports the lexical owner, component/use chain, and projection edge
through which recursion was reached.

Hidden definitions, uses, slot parents, and assignment roots remain in link
and cycle validation. Visibility cannot make an otherwise recursive source
finite. Unused exported components remain governed by the module RFD's entry
closure versus complete-library-validation distinction.

Acyclic projected content may still expand rapidly. Declared processing limits
may account for assignment roots, projected nodes, reference depth, and total
expansion work. Exceeding a limit is an explicit resource-limit failure, never
permission to truncate a slot or keep only some assigned roots.

## Provenance and editing

For every declared slot observed through every materialized component use, the
retained component-aware product records:

- the target component identity and containing use chain;
- the slot name and declaration source location;
- the receiving use occurrence;
- every assignment root and its caller source location in order; and
- the resulting ordinary root occurrence for each assignment.

This projection occurrence exists even when the ordered assignment and
materialized-root lists are empty. Absence of ordinary roots cannot reconstruct
which empty slot declaration was observed or where it came from.

The ordinary scene contains neither slot declarations nor assignment
attributes, so it cannot reconstruct this map by itself. Component-aware
inspection and editing require the retained source and provenance. Editing a
slot declaration changes definition topology for every use; editing an
assignment root changes only that caller's supplied content.

Version 3 introduces no durable use, slot-occurrence, assignment-root, or
projected-descendant ID. Source locations, child indices, and transient runtime
handles must not be presented as durable authored identity.

Version 4 subsequently requires explicit render-member and use IDs. During
slot projection it retains the assignment root's caller owner and appends the
receiving use to its durable occurrence path; it does not promote a Version 3
source location or child index into identity. See [Grida XML durable
addressing](./grida-xml-addressing).

## Source preservation and canonical writing

A source-preserving writer writes slot declarations and assignment roots rather
than their projected ordinary copies. It preserves each source unit's declared
version, lexical resource association, slot declaration position, use
boundary, and assignment-root order.

A canonical writer for a Version 3 source unit requires every target interface
needed to validate and normalize that unit's uses. It:

- emits `grida version="3"` for that source unit;
- writes each empty declaration as `<slot name="…"/>` at its definition-tree
  position;
- writes Version 2 `arg` children before assignment roots and retains the
  established target-declaration ordering for args;
- writes every assignment root directly under its use with exactly one `slot`
  relationship attribute;
- preserves the complete authored order of assignment roots, including roots
  naming different slots;
- represents an empty projection only by omitting assignment roots for that
  name;
- preserves caller-authored references and resources with their caller source
  association; and
- writes component/use source, never the materialized clone tree.

If a target interface is outside the available link closure, source-preserving
same-location write-back may retain the unresolved use, but complete canonical
writing fails. It must not guess slot names, drop assignments, or insert a
wrapper. A mixed-version writer canonicalizes each unit under its own declared
version and never upgrades an older dependency because it was reached from
Version 3.

Flattening into Draft 0 or another ordinary-only target is an explicit lossy
conversion. It removes declarations, assignment relationships, component
editing propagation, and projection provenance. Such a converter must complete
the ordinary tree and correctly preserve or rebase caller-owned resources, or
reject the target.

## Validation and diagnostics

Slot failures remain distinct from ordinary rendering failures:

| Failure                                                   | Category                     |
| --------------------------------------------------------- | ---------------------------- |
| Malformed, misplaced, or duplicate declaration            | Source validation            |
| Missing or misplaced assignment `slot` attribute          | Source validation            |
| `arg` after an assignment root                            | Source validation            |
| Unknown slot name                                         | Link validation              |
| Assignment supplied to a Version 1 or Version 2 target    | Link validation              |
| Invalid projected parent relationship                     | Projection validation        |
| Recursive lexical component edge through assigned content | Link validation              |
| Ordinary geometry, layout, paint, or resource failure     | Existing downstream category |

Useful diagnostics include:

- `<slot> requires exactly name="…" using lowercase kebab-case`;
- `duplicate slot "media" in component "card"`;
- `<slot> is valid only at a render-child position inside a Version 3 component`;
- `direct render child of <use> requires slot="…"`;
- `arg must precede every render assignment inside <use>`;
- `slot attribute is contextual to a direct Version 3 use assignment; it is not an ordinary rect property`;
- `slot "thumbnail" is not declared by component "card"; available: actions, media`;
- `render assignments require a Version 3 target; component "card" declares version 2`;
- `projected root uses grow, but slot "media" is not under an in-flow flex position`; and
- `component cycle through slot "body": a#outer → b#card → a#outer`.

A projected descendant failure identifies the caller assignment root, slot
declaration, receiving use, referenced component, and transitive use chain. It
must not be reported only against a transient materialized node.

## Current model compatibility

The ordinary scene and renderer require no component, slot, or assignment node
variant. Projection produces ordinary child sequences before layout, text,
path, paint, and resource resolution. The renderer remains component-blind.

The retained source program and projection provenance are nevertheless
required for canonical source writing, linked editing, lexical resource
attribution, and an observable empty projection. A packed target without a
live source-program or definition/instance layer must flatten with declared
loss or reject; an XML-only side table cannot make copied ordinary nodes a
lossless live-component round-trip.

## Considered alternatives

### Direct named assignment — accepted

`<slot name="media"/>` makes the destination visible at the definition site,
while `slot="media"` keeps each supplied root self-describing. Direct roots
preserve their actual node kinds and avoid a collection-only envelope.

### Scalar XML or string props — rejected

Strings cannot carry typed render trees without reparsing. Reparsing would
erase source boundaries and make resource bases, scalar scope, and diagnostics
ambiguous.

### A `<content>` assignment wrapper — rejected

A wrapper would add structure with no independent scene meaning and obscure
the actual assigned root. Authors who need one real grouping node can assign an
ordinary `group` or `container` explicitly.

### Unnamed or default children — rejected for Version 3

Implicit children create an implicit destination and a second assignment
spelling once named slots exist. Version 3 requires every marker and every root
to name the relationship.

### Fallback, required, or explicit-empty slots — deferred

These are absence-policy features independent from the initial topology.
Version 3 has one rule: omission yields an empty projection.

### A boxed slot node in the ordinary scene — rejected

A box would change layout, coordinate, clipping, and painter semantics. Direct
splicing lets the existing destination parent own those rules without adding a
renderer concept.

### Callee-scoped assigned content — rejected

Capturing callee props or rebasing resources to the definition would change
the meaning of caller-authored content merely because it was projected.
Lexical ownership remains with the caller.

## Proposed conformance requirements

A conforming implementation of this proposal:

1. **MUST** implement Version 3 only as Version 2 plus the named-slot delta in
   this RFD.
2. **MUST** require empty, uniquely named slot declarations at valid
   render-child positions inside Version 3 components.
3. **MUST** require Version 3 `use` content to be leading `arg*` followed by
   direct assignment roots, each carrying exactly one contextual `slot`.
4. **MUST** treat the assignment `slot` attribute as a source relationship and
   **MUST NOT** accept it as an ordinary render property.
5. **MUST** reject unknown slot names and render assignments to Version 1 or
   Version 2 targets.
6. **MUST** permit zero, one, or many assignments per declared slot.
7. **MUST** replace each marker by its matching roots in caller order and
   preserve definition order across markers.
8. **MUST NOT** create a wrapper, default slot, fallback subtree, requiredness
   rule, or explicit-empty representation.
9. **MUST** validate every projected root against the ordinary relationship
   rules of the slot's actual parent.
10. **MUST** preserve caller source version, scalar scope, resource origin,
    nested-reference base, and authored provenance.
11. **MUST NOT** expose callee props implicitly to caller-authored assigned
    content.
12. **MUST** attribute nested uses in assigned content to their lexical caller
    component for cycle validation, including hidden content; it **MUST** allow
    finite same-component nesting authored at top-level scene scope and
    **MUST** reject a projected edge that returns to an active lexical caller
    definition.
13. **MUST** materialize an ordinary scene containing no slot declarations or
    assignment attributes.
14. **MUST** retain one projection-provenance occurrence per declared slot and
    component use, including empty projections.
15. **MUST** preserve slot declarations, assignment roots, and assignment order
    during source-preserving writing.
16. **MUST NOT** serialize expanded ordinary copies as canonical Version 3
    component source.
17. **MUST** preserve exact Version 0, Version 1, and Version 2 parsing and link
    behavior and reject links from older callers to Version 3 definitions.
18. **MUST** distinguish source, link, projection, scene, and resource failures
    with both caller and definition provenance.
19. **MUST NOT** parse a scalar string as XML or render content.
20. **MAY** impose declared processing limits, but exceeding them must fail
    explicitly rather than truncate a projection.
