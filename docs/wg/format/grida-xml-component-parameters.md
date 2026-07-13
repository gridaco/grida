---
title: "Grida XML component parameters"
description: "Open RFD proposing statically evaluated typed scalar props and arguments for Grida XML components while keeping the rendering scene component-blind."
keywords:
  - grida xml
  - component props
  - component arguments
  - typed parameters
  - static materialization
  - slots
tags:
  - internal
  - wg
  - format-schema
  - canvas
  - authoring
  - architecture
  - resources
  - scene-graph
  - text
format: md
---

# Grida XML component parameters

**Status:** Open RFD — selected Version 2 scalar-parameterization delta with a
proving implementation of all six scalar types, defaults and required
arguments, bindings, brace escaping, forwarding, resource origins,
specialization provenance, ordinary-scene materialization, and local-file
rendering. Canonical source writers and complete-library validation remain
unimplemented. None of the parameter vocabulary introduced by this RFD is
valid Version 0 or Version 1 syntax.

**Companion specifications:** [Grida XML](./grida-xml) owns ordinary authored
scene values. [Grida XML modules and static component
reuse](./grida-xml-modules) owns source units, boxed component definitions,
`use`, linking, materialization, and component provenance. This RFD specifies
only the parameterization delta. [Grida XML component
slots](./grida-xml-component-slots) separately owns the Version 3 named render
projection delta. [Grida XML durable addressing](./grida-xml-addressing) owns
the later Version 4 member/use identity delta.

## Decision summary

Grida XML components may declare a small, typed scalar interface. A use
supplies explicit arguments to that interface. Parameter evaluation completes
during linking and materialization; layout and rendering receive only an
ordinary concrete Grida scene.

```xml
<!-- components/card.grida.xml -->
<grida version="2">
  <component
    id="feature-card"
    width="320"
    height="180"
    corner-radius="20"
    clips="true"
  >
    <prop name="title" type="string"/>
    <prop name="accent" type="color" default="#7C3AED"/>
    <prop name="texture" type="resource"/>
    <prop
      name="texture-fit"
      type="enum"
      values="contain cover"
      default="cover"
    />

    <fill>
      <solid color="#101828"/>
      <image src="{texture}" fit="{texture-fit}" opacity="0.18"/>
    </fill>

    <text x="24" y="24" font-size="28" fill="{accent}">{title}</text>
  </component>
</grida>
```

```xml
<!-- presentation.grida.xml -->
<grida version="2">
  <container width="960" height="540" layout="flex" gap="24" padding="48">
    <use href="./components/card.grida.xml#feature-card">
      <arg name="title" value="Inspectable by default"/>
      <arg name="texture" value="./images/noise.png"/>
    </use>

    <use href="./components/card.grida.xml#feature-card">
      <arg name="title" value="Independent instance"/>
      <arg name="accent" value="#2563EB"/>
      <arg name="texture" value="./images/grid.png"/>
      <arg name="texture-fit" value="contain"/>
    </use>
  </container>
</grida>
```

The proposal makes these choices:

| Question                   | Proposed answer                                                       |
| -------------------------- | --------------------------------------------------------------------- |
| Ownership                  | Grida XML source linker and materializer                              |
| Rendering representation   | Existing ordinary scene nodes only                                    |
| Declaration                | Leading direct `<prop>` child of `component`                          |
| Argument                   | Direct `<arg>` child of `use`                                         |
| Binding                    | Exact `{prop-name}` reference in an established scalar value position |
| Value model                | Closed typed scalar set; no generic value or XML fragment             |
| Missing argument           | Declaration default, otherwise an error                               |
| Null                       | Not a Version 2 value                                                 |
| Forwarding                 | Exact outer-prop reference as a nested argument value                 |
| Expressions and reactivity | Outside Grida XML parameterization                                    |
| Render-valued input        | Proposed Version 3 named-slot delta; invalid in Version 2             |

## Why Grida owns this above rendering

A component parameter is authored intent. It states that several concrete
values come from one declared component API and that omitted callers continue
to track the definition's default. Flattened render nodes cannot recover that
relationship.

Leaving even static parameters entirely to a secondary runtime would make
that runtime—not Grida XML—the source of truth for defaults, resource origin,
diagnostics, linked editing, and canonical writing. Grida XML would become a
generated render interchange rather than a complete file-first authored
language.

Parameterization is nevertheless not a paint, geometry, layout, or runtime
node concept. Its boundary is:

```text
entry source + source environment
  → parse and link source units
  → resolve typed component arguments
  → substitute scalar bindings
  → validate and materialize ordinary scene + provenance + resources
  → resolve layout, text, paths, and paints
  → render
```

No prop declaration, argument, binding token, default state, or unresolved
value enters ordinary scene resolution. A low-level consumer may continue to
supply an already concrete scene without using components. A higher-level
runtime may generate Grida XML or concrete scenes, but one is not required for
static component customization.

## Goals

Version 2 scalar parameterization must:

- let a component expose a deliberate, inspectable API rather than its entire
  internal property tree;
- keep call sites independently parseable through explicit `arg` elements;
- type values before they enter ordinary property validation;
- distinguish an omitted argument from an explicit value equal to the
  current default;
- support exact forwarding through nested components without introducing an
  expression language;
- retain the lexical origin of resource-valued defaults and arguments;
- produce a finite, fully concrete ordinary scene before layout or rendering;
- preserve declarations, arguments, bindings, and their provenance during
  source writing; and
- remain predictable for direct human and language-model authoring.

## Non-goals

This proposal does not define:

- conditions, loops, arithmetic, functions, property paths, or a general
  expression language;
- state, events, async values, data fetching, or reactive updates;
- dynamic component references or parameterized `href`;
- implicit conversion through a generic string type;
- nullable values or parameterized attribute presence;
- whole paints, stroke lists, paths, transforms, collections, or render nodes
  as prop values;
- arbitrary component attributes directly on `use`;
- deep descendant overrides or patches;
- component variants or inheritance;
- durable instance or component-descendant identity;
- live-component persistence in the packed archive; or
- render-valued slots, children, or fallback subtrees.

The named direct-projection subset now has a focused Version 3 proposal in
[Grida XML component slots](./grida-xml-component-slots). It does not alter
this Version 2 boundary. Fallback subtrees and other absence policies remain
deferred.

## Vocabulary

| Term                    | Meaning                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| **Prop**                | One named typed scalar member declared by a component                  |
| **Argument**            | One explicit value supplied by a use for a declared prop               |
| **Default**             | Definition-owned literal selected when a use omits that prop           |
| **Binding**             | One authored scalar sink whose complete value comes from a prop        |
| **Prop environment**    | The complete effective prop values for one component use               |
| **Forwarding**          | Supplying an outer effective prop as an argument to a nested use       |
| **Value origin**        | The source unit and source location where a literal value was authored |
| **Specialization**      | Resolving one use's prop environment and substituting its bindings     |
| **Render-valued input** | Caller-authored scene content supplied to a component                  |

Component ID, prop name, use occurrence, argument, binding target,
materialized node handle, and slot identity are different facts. This RFD does
not substitute one for another.

## Version relationship

Version 2 inherits the complete Version 1 module and boxed-component model,
then adds only the syntax and semantics in this RFD.

| Source relationship                         | Result                                            |
| ------------------------------------------- | ------------------------------------------------- |
| Version 0 source                            | Has no component vocabulary                       |
| Version 1 component used by Version 1       | Static use; `use` remains empty                   |
| Version 2 component used by Version 2       | Scalar props and arguments are available          |
| Version 1 component used by Version 2       | Accepted as an empty-interface static component   |
| Version 2 component referenced by Version 1 | Rejected as an unsupported newer component source |

Version semantics are selected per source unit and reference edge, not from
the entry source or overall link operation. The source unit containing a
`use` determines that use's grammar; the source unit containing a component
definition determines that definition body's grammar. Accepting a Version 1
component from Version 2 does not upgrade, reparse, or reinterpret the Version
1 source as Version 2. A Version 1 source likewise cannot reference Version 2
merely because it is reachable from a Version 2 entry.

For example, `<text>{price}</text>` in a Version 1 component remains the
literal characters `{price}` when used from Version 2, and
`<text>{{price}}</text>` retains both pairs of braces. The same single-brace
form inside a Version 2 component is a binding and fails when `price` is not a
declared prop.

A Version 2 use of a Version 1 component cannot contain arguments because the
target declares no props. A Version 2 source may itself declare components
with no props and use them statically.

Unknown Version 2 syntax remains an error. Version 2 does not silently accept
future parameter kinds, value types, or render-valued inputs.

## Grammar delta

The Version 2 delta is:

```text
component := component-start prop* existing-component-body component-end
prop      := empty `prop` element
use       := empty `use` element | use-start arg* use-end
arg       := empty `arg` element
```

Comments and formatting whitespace do not affect the grammar.

Every `prop` is a leading direct child of its `component`. All prop
declarations must precede the component's `fill`, `stroke`, and render
children. A `prop` is non-rendering and occupies no layout or painter
position. A component with no declarations omits `prop` entirely; there is no
`props` collection wrapper.

Every `arg` is a direct child of `use`. Arguments are typed property children,
not render children, and occupy no layout or painter position. A use may still
be self-closing when it supplies no arguments. Non-whitespace character data,
render children, and every other structural child remain invalid inside
Version 2 `use`.

The complete list of leading declarations is indexed before bindings on the
component's own start tag are validated. A component may therefore bind its
own box or visual attributes to a prop declared immediately inside it.

## Prop names and scope

Prop names use the same compact grammar as component IDs:

```text
prop-name := [a-z][a-z0-9]*("-"[a-z0-9]+)*
```

Names are case-sensitive and unique within one component. These names are
reserved because they belong to component identity or the fixed relationship
between a use and its caller:

```text
id href name x y flow grow align hidden
```

Other ordinary property names, including `width`, `height`, and `fill`, remain
available as prop names. Explicit `arg` elements keep those component-local
names separate from the fixed `use` attribute grammar.

A prop's lexical scope is exactly one component definition:

- the component's own scalar attributes;
- scalar attributes in its paint, stroke, text, and render descendants;
- direct `text` and `tspan` character content; and
- argument values on nested uses.

The scope does not enter the referenced component definition. Values cross
that boundary only through explicit nested arguments. A prop declaration in
one component never shadows, captures, or implicitly supplies a same-named
prop in another component.

Bindings are invalid in a scene root outside a component because no prop
environment exists there.

## Scalar value types

Each prop requires one explicit `type` from this closed initial set:

| Type       | Value domain and purpose                                                  |
| ---------- | ------------------------------------------------------------------------- |
| `string`   | XML-decoded Unicode string; the empty string is valid                     |
| `boolean`  | Exactly `true` or `false`                                                 |
| `number`   | Finite Grida XML decimal number                                           |
| `color`    | One value from the existing Grida XML authored-color domain               |
| `enum`     | One member of the declaration's explicit `values` set                     |
| `resource` | Non-empty authored resource identifier carrying lexical source provenance |

These are value categories, not parallel scene properties. The established
target property still owns applicability, range, defaults, contradictions,
and materialization. For example, `number` admits a finite value, while an
`opacity` binding additionally requires that value to be in `[0, 1]` and a
`font-size` binding requires it to be positive.

The complete initial injection relation is:

| Prop type  | Admissible established scalar sink                          |
| ---------- | ----------------------------------------------------------- |
| `string`   | Free-string attribute or direct text-character segment      |
| `boolean`  | Boolean-valued attribute                                    |
| `number`   | Numeric branch of a property grammar                        |
| `color`    | Color-valued attribute, including compact one-solid `fill`  |
| `enum`     | Keyword branch of a property grammar accepting every member |
| `resource` | Resource-identifier attribute                               |

This table defines category compatibility only. The ordinary target still
validates the supplied value and cross-property state. A `number` may, for
example, enter the numeric branch of `width` or `font-weight`; `width` then
applies its non-negative rule, while `font-weight` requires an integer from 1
through 1000.

An `enum values="auto"` prop may enter the keyword branch of `width`, and an
enum whose members are accepted position keywords may enter that branch of
`x` or `y`. The same prop still cannot represent both a keyword and a number;
Version 2 defines no number-or-keyword union prop.

There are no implicit string conversions. A `string` cannot supply a number,
color, enum, resource, path, transform, paint stack, or list merely because
all XML source is textual. No cross-type conversion is defined.

`enum` requires a non-empty `values` attribute containing unique
space-separated lowercase kebab-case tokens. Every declared enum member must
be valid at every binding target of that prop. Its default and every explicit
argument must be one declared member.

“Valid at a binding target” means the member belongs to that target's lexical
keyword domain. Constraints involving other authored properties are checked
after specialization, when the complete ordinary target state is known.

`resource` is distinct from `string` because its lexical source origin affects
resolution. It may bind only to an established resource-valued property such
as image `src`.

Compound authored values such as position bindings, corner lists, insets,
dash arrays, path data, transform programs, ordered paints, and node subtrees
are not coerced through `string`. Later versions may add explicit types only
after their value and canonicalization contracts are defined.

This initial type set cannot expose every ordinary property domain. For
example, `number` may supply the numeric branch of `width`, but it cannot also
supply `auto`; no initial prop type represents that union. Authors keep such a
property literal or use a higher-level runtime until a dedicated typed domain
is specified. A processor must diagnose that limit rather than recommend
`string` as an escape hatch.

## Prop declarations

`prop` is an empty element with this attribute contract:

| Attribute | Requirement | Meaning                                     |
| --------- | ----------- | ------------------------------------------- |
| `name`    | Required    | Unique component-local prop name            |
| `type`    | Required    | One scalar type from the closed set above   |
| `default` | Optional    | Literal selected when a use omits this prop |
| `values`  | `enum` only | Non-empty set of accepted enum tokens       |

A declaration without `default` is required at every use. A declaration with
`default`, including `default=""` for a string, may be omitted by a caller.
There is no separate `required` attribute and no implicit default.

Defaults are literals owned by the definition source. They cannot reference
another prop. This removes declaration-order evaluation, default dependency,
and default-cycle semantics.

The default is parsed according to the declared type and validated against
every known binding target. `values` is required for `enum` and invalid for
every other type. Unknown attributes are errors.

Declaration order is not evaluation order, but it is retained for inspection,
documentation, and canonical argument ordering. Every declaration must have
at least one syntactic consumption site in its component: either a scalar
binding target or a nested `arg value` forwarding binding. A declaration
default, an argument supplied by an external caller, and the declaration's
mere presence do not count. Consumption under a hidden node still counts
because visibility does not change source validity. A prop with no consumption
site is a source error; accepting it would admit no-op arguments that are
especially difficult to detect in directly authored or generated source.

## Requiredness, omission, and nullability

Version 2 deliberately has no universal `null` value.

Each effective value records two independent facts:

| Fact at this use      | States                                                 |
| --------------------- | ------------------------------------------------------ |
| Selection             | `CalleeDefault` or `Supplied(argument site)`           |
| Ultimate value source | Literal argument or declaration default, plus forwards |

The selection rule is:

```text
omitted argument + declared default → CalleeDefault
explicit literal or forwarded arg   → Supplied(argument site)
omitted argument + no default        → error
```

A forwarded outer default is therefore `Supplied` at the callee while its
ultimate value source remains the outer declaration default. It does not begin
tracking the callee's default merely because its original literal came from a
default.

Empty string, `0`, and `false` are ordinary explicit typed values. `auto` and
`none`, where admitted through an enum and accepted by a target, are domain
values rather than null.

An explicit argument remains `Supplied` even when its value equals the current
component default. Removing it would change future behavior if the definition
default changes. A source-aware processor therefore retains both selection
and ultimate value source even when materialized scalar values compare equal.

The string `null` is an ordinary string value for a `string` prop. It is
invalid for the other initial types unless it is explicitly declared as an
`enum` member; neither case has null semantics.

Version 2 cannot parameterize the presence of an attribute. A binding supplies
the complete value of an authored scalar occurrence; it cannot remove that
occurrence. Future nullable props, if justified, must declare nullability and
use one structural spelling rather than a magic string sentinel. This RFD
selects no nullable syntax.

## Arguments

`arg` is an empty element with exactly two attributes:

| Attribute | Requirement | Meaning                                             |
| --------- | ----------- | --------------------------------------------------- |
| `name`    | Required    | One prop declared by the referenced component       |
| `value`   | Required    | A literal or an exact outer-prop forwarding binding |

Argument names are unique within one use. Argument order is not semantic. An
argument replaces the declaration default; values do not merge.

After the referenced component is known, each literal argument is parsed as
the target prop's declared type. Unknown arguments, duplicate arguments,
missing required arguments, and invalid typed literals are errors. No
best-effort coercion occurs.

At top-level scene scope, `value` must be literal. Inside a component, an exact
binding forwards an effective outer value. This complete fragment declares
both the callee and caller interfaces:

```xml
<component id="primary-button" width="180" height="56" fill="{accent}">
  <prop name="label" type="string"/>
  <prop name="accent" type="color" default="#7C3AED"/>

  <text x="center" y="center" fill="#FFFFFF">{label}</text>
</component>

<component id="toolbar" width="480" height="80">
  <prop name="cta-label" type="string"/>
  <prop name="cta-color" type="color" default="#7C3AED"/>

  <use href="#primary-button">
    <arg name="label" value="{cta-label}"/>
    <arg name="accent" value="{cta-color}"/>
  </use>
</component>
```

Forwarding resolves in the lexically containing component. It never captures
a callee prop of the same name. Source and target prop types must match. For
`enum`, every possible source member must belong to the target prop's `values`
set. The forwarded value retains its ultimate literal or default origin
through every hop.

## Binding syntax

After XML decoding, `{prop-name}` denotes a prop binding. The binding replaces
one complete scalar value:

```xml
<component id="button" width="{button-width}" height="56" fill="{accent}">
  <prop name="button-width" type="number" default="180"/>
  <prop name="accent" type="color" default="#7C3AED"/>
  <prop name="label" type="string"/>

  <text x="center" y="center" fill="#FFFFFF">{label}</text>
</component>
```

In an XML attribute, the complete decoded value is either literal or exactly
one binding. Attribute interpolation and concatenation are invalid:

```xml
<component id="themed-surface" width="320" height="180">
  <prop name="theme" type="resource"/>

  <fill>
    <!-- Invalid: bindings do not construct resource strings. -->
    <image src="./themes/{theme}/noise.png"/>
  </fill>
</component>
```

Direct `text` and `tspan` character content may contain literal character
segments and string-prop binding segments in document order:

```xml
<component id="greeting" width="240" height="64">
  <prop name="person" type="string"/>
  <text>Hello, {person}.</text>
</component>
```

Only `string` props may bind into character content. Inserted strings become
characters; they are never reparsed as XML, `tspan`, entities, bindings, or
render nodes. An argument whose string value contains `{other}` therefore
cannot trigger second-order substitution.

Literal braces use doubling after XML decoding:

```xml
<component id="binding-help" width="320" height="64">
  <prop name="label" type="string"/>
  <text>Use {{label}} literally; this value is {label}.</text>
</component>
```

In this example the first occurrence materializes as literal `{label}` and
the second is a binding. An unmatched single brace, an empty binding, or a
binding whose content is not a prop name is an error. Canonical writers double
literal braces where binding parsing is active.

Brace-heavy text remains direct to author because each literal brace is
doubled independently:

```xml
<component id="code-example" width="520" height="80">
  <prop name="label" type="string"/>
  <text>{label}: function demo() {{ return {{ ok: true }}; }}</text>
</component>
```

Given `label="Example"`, the text materializes as
`Example: function demo() { return { ok: true }; }`.

Where binding parsing is active, scanning proceeds left to right with this
precedence:

1. `{{` emits one literal `{`.
2. `}}` emits one literal `}`.
3. `{prop-name}` emits one binding token.
4. Every other single `{` or `}` is invalid.

Substituted characters are appended after this scan and are never scanned
again. A canonical encoder is the inverse: it doubles every literal brace and
emits each binding once as `{prop-name}`. This makes adjacent escaped and bound
segments deterministic.

Binding recognition is controlled exclusively by the declared version of the
source unit containing the lexical occurrence. The following rules apply only
inside Version 2 source units. In Version 0 and Version 1 source, braces retain
their ordinary Grida XML character meaning: `{name}` is not a binding,
doubled braces have no escape semantics, and a Version 2 linker or writer must
not scan, collapse, double, or otherwise reinterpret them. Substitution never
changes the grammar version applied to copied component content.

Within a Version 2 source unit, binding recognition is contextual:

| Version 2 source position                               | Brace behavior                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| Scalar attribute in a component body or start tag       | Exact `{name}` binds; a binding-shaped literal doubles braces    |
| `text` or `tspan` character content in a component      | String bindings and doubled literal braces are recognized        |
| Nested `arg value` inside a component                   | Exact `{name}` forwards; a binding-shaped literal doubles braces |
| Top-level `arg value` with no enclosing prop scope      | Exact `{name}` is an invalid forwarding attempt                  |
| Prop `default` and all binding-forbidden metadata       | Braces are literal and use only the position's ordinary grammar  |
| Ordinary scene content outside any component definition | Braces are literal                                               |

For example, `default="{label}"` on a `string` prop is the literal string
`{label}` because defaults never bind. A top-level string argument that must
literally contain `{label}` uses `value="{{label}}"`; the single-brace form is
rejected as a forwarding reference with no enclosing prop scope.

Binding recognition applies to parsed XML source, not to already-decoded
literal values supplied by an authoring operation. When plain text or an
existing literal scene value is inserted into a binding-active component
position, the authoring operation must encode every literal `{` as `{{` and
every literal `}` as `}}` before writing source. It must not infer a prop
binding from literal characters.

Extracting an ordinary scene subtree into a component follows the same rule
and preserves its decoded literal values. Copying structured source that
already contains prop bindings is different: the operation must preserve a
compatible component scope, explicitly rebind the references, or specialize
them to concrete literals. Raw XML paste remains source and is parsed
normally.

Consequently, moving literal `<text>{status}</text>` into a Version 2
component canonically writes `<text>{{status}}</text>`, while deliberately
authoring `{status}` inside that component creates a binding.

Binding is permitted only at an established scalar value sink whose value
category accepts the prop type. It may customize ordinary attributes and
scalar leaves inside structured paint, stroke, gradient, and text properties.
It cannot replace an element name, property subtree, ordered list, or render
subtree.

Bindings are forbidden in:

- `grida version`;
- component `id`;
- prop `name`, `type`, `values`, or `default`;
- argument `name`;
- use `href`;
- element and attribute names; and
- any unrecognized or non-scalar value position.

A prop may bind several compatible sinks. A sink may have either its ordinary
literal attribute/value or one binding, never both representations at once.
After substitution, every sink undergoes its ordinary target-specific
validation. A value that makes another authored property inapplicable is an
error; the materializer does not drop or repair the conflicting state.

If string substitution makes a `tspan` empty, ordinary `tspan` validation
fails with argument and binding provenance. An empty `text` remains valid
according to the ordinary text contract.

## Evaluation and materialization

Parameter evaluation is deterministic and staged:

1. Parse every loaded source unit under its declared exact version.
2. Index prop declarations and validate names, types, literal defaults,
   binding references, and static sink compatibility.
3. Resolve each reachable component reference under the module-linking rules.
4. For one use, reject duplicate and unknown arguments.
5. Resolve every explicit literal or forwarded argument to its declared type.
6. Select the declaration default for each omitted optional prop and report
   each omitted required prop.
7. Substitute every binding with its concrete effective typed value.
8. Validate the resulting ordinary authored properties and their
   cross-property constraints.
9. Materialize the existing ordinary container subtree plus provenance and
   resource manifest.
10. Resolve layout, text, paths, paints, and resources through the ordinary
    scene contract.

There is no prop evaluation order because defaults are literals and sibling
props cannot reference one another. The complete effective environment is
immutable for one specialization.

Hidden uses and bindings under hidden nodes are still linked, typed, and
validated. Visibility does not suppress component API, resource-type,
lexical-origin, or cycle errors. Actual resource lookup and decode follow the
ordinary render-resource preflight contract; this RFD does not create a
different visibility rule for resources.

## Resource-valued props

Every resource value retains the origin of the literal that created it:

| Value source              | Lexical origin                        |
| ------------------------- | ------------------------------------- |
| Declaration default       | Component-definition source           |
| Explicit literal argument | Source containing that use            |
| Forwarded resource value  | Original supplying literal, unchanged |

Two identical relative strings from different origins may resolve to
different resources. Forwarding through an intermediate component never
rebases the value to that component's source.

For the primary example, `./images/noise.png` resolves relative to
`presentation.grida.xml` because the caller authored the argument. Had
`texture` declared a relative default, that default would resolve relative to
`components/card.grida.xml`.

Materialization retains `(source origin, authored identifier)` until resource
resolution or lowers it to an equivalent collision-free runtime key while
preserving the authored string. Only materialized resource occurrences enter
the resource manifest; a value that is merely forwarded has no additional
resource occurrence at the forwarding site. Resource I/O does not occur in
the painter.

## Provenance and editing

The retained source program distinguishes:

- prop declaration and declared type;
- declaration default, when present;
- `CalleeDefault` versus `Supplied` selection at each use;
- argument site, when supplied;
- ultimate literal or declaration-default value source;
- forwarding chain, when forwarded;
- literal lexical origin;
- every binding target;
- containing component and ordered use chain; and
- materialized node occurrence, when applicable.

Materialization may erase those distinctions from the ordinary render tree,
but a component-aware model and canonical source writer must not. Changing a
declaration default affects uses that omit the argument. An explicit argument
equal to the former default remains pinned and unchanged.

This RFD adds no durable source-node, use-occurrence, or descendant identity.
Prop provenance uses the source and use boundaries already required by the
module contract; it does not pretend a runtime node handle is durable authored
identity.

Version 4 subsequently adds explicit render-member and use IDs through the
[durable-addressing RFD](./grida-xml-addressing). It does not reinterpret a
Version 2 binding, source span, or materialized occurrence as identity.

## Cycles and processing limits

Scalar props cannot change `href`, element names, or structure. They therefore
add no edges to the Version 1 component-expansion graph and do not alter its
cycle rule. A cycle is rejected before materialized node allocation even when
the uses or bindings involved are hidden.

Scalar forwarding may increase specialization work but cannot make an
acyclic definition graph recursive. Processing environments may extend their
declared expansion limits to include argument bytes, prop count, binding
count, and specialization work. Exceeding a limit is an explicit resource
failure, never permission to truncate or drop arguments.

## Source preservation and canonical writing

A source-preserving writer writes props, args, and bindings rather than their
materialized values or expanded node copies.

A canonical writer for a Version 2 source unit is defined only after every
`use` whose arguments it normalizes has a successfully linked target
interface. The following rules apply to that Version 2 unit only; they do not
upgrade or rewrite linked Version 0 or Version 1 units:

- emits `grida version="2"` for that Version 2 source unit;
- writes direct leading `prop` elements with attribute order `name`, `type`,
  `values`, then `default` where applicable;
- preserves prop declaration order;
- emits `enum values` members in ascending ASCII lexical order; a
  source-preserving same-location writeback may retain authored member order;
- writes explicit args in the linked target declaration order; if that target
  interface is outside the available link closure, canonical writing fails,
  while source-preserving write-back retains authored argument order;
- does not emit an argument for a `CalleeDefault`-selected prop;
- preserves an explicit argument even when it equals the declaration default;
- preserves forwarding bindings rather than replacing them with effective
  literals;
- emits canonical lexical forms for typed literals;
- emits exact `{name}` bindings and doubles literal braces where binding
  parsing is active;
- XML-escapes strings normally and uses character references when tabs or
  line breaks must survive XML attribute normalization;
- preserves authored resource identifiers and their source association; and
- writes the component/use source program, never materialized clone trees.

A canonical multi-file writer applies the appropriate version-specific writer
to each source unit. It requires the complete library-validation closure for
the program being written. In a mixed program, every Version 2 source and
Version 1 dependency retains its declared version. A partial-link operation
may perform source-preserving write-back, but it must not claim complete
canonicalization.

Canonical print, parse, link, and materialize must be a semantic fixpoint for
selection, ultimate value source, forwarding, binding targets, resource
origins, and the resulting ordinary scene.

A conversion to a target without live component source must flatten with
declared loss or reject, following the module RFD. A concrete materialized
scene without the retained source program cannot reconstruct prop declarations
or determine the selection and ultimate value source of effective values.

## Validation and diagnostics

Parameter failures are source, link, or specialization errors rather than
render fallbacks. Useful diagnostics include:

- `duplicate prop "accent" in component "button"`;
- `prop name "x" is reserved by the use instance boundary; choose a component-local API name`;
- `<prop> declarations must precede fill, stroke, and render children`;
- `prop "accent" in component "button" has no binding or forwarding site`;
- `prop "fit" type="enum" requires a non-empty values attribute`;
- `default "purple" is not a valid color for prop "accent"`;
- `binding "accent" is not declared by component "button"`;
- `binding "lable" is not declared by component "button"; available: label`;
- `prop "label" has type string and cannot bind to opacity`;
- `argument "label" is required by component "button"`;
- `unknown argument "tone" for component "button"; available: accent, label`;
- `duplicate argument "label" for component "button"`;
- `enum prop "fit" cannot forward to "image-fit"; source member "fill" is not accepted by the target`;
- `argument "opacity" is 1.4; bound target opacity requires a value in [0, 1]`;
- `href is not parameterizable; component references must remain statically linkable`;
- `attribute bindings must replace the complete value; interpolation in src is invalid`;
- `unescaped "{" in component text; write "{{" for a literal brace or "{prop-name}" for a binding`;
- `prop binding "label" has no enclosing component scope`;
- `"{label}" in top-level arg value cannot forward without an enclosing component scope; write "{{label}}" for literal text`;
- `version 1 use cannot contain arg; component parameters require version 2`;
- `version 2 use accepts only arg children; render assignments require version 3`;
- `resource "./noise.png" was supplied at presentation.grida.xml:18 and could not be resolved`.

A nested failure identifies the declaration, argument or default that supplied
the value, binding target, immediate use, referenced definition, and transitive
use chain. It must not be reported only against a transient materialized node.

## Version 3 named slot projection

The [Grida XML component slots](./grida-xml-component-slots) RFD proposes the
next exact language delta. Version 3 declares empty named insertion markers as
`<slot name="…"/>` and supplies direct render roots under `use` with the
contextual `slot="…"` relationship. Matching roots splice directly at the
marker while retaining caller lexical ownership. That RFD owns layout,
painter order, clipping, resource origin, cycles, provenance, and
source-writing behavior for projection.

Version 2 `use` children nevertheless remain exactly `arg*`. A Version 2
reader rejects slot declarations, assignment attributes, and render children;
it never reparses a scalar string as XML or render content. Version 3 inherits
the scalar contract in this RFD rather than changing its types, binding syntax,
or evaluation rules.

## Runtime boundary

The following remain appropriate for a separate runtime or higher-level
language:

- computed and derived values;
- conditions and repetition;
- state and event handling;
- asynchronous data and resource discovery;
- functions and user code; and
- runtime-changing component selection.

Such a runtime may produce versioned Grida XML source or a concrete ordinary
scene. The Grida renderer continues to accept the latter without requiring
component support. Conversely, static props and slots do not require that
runtime merely to render or edit an authored `.grida.xml` program.

## Current model compatibility

The existing ordinary scene and renderer need no component, prop, or argument
node variants to materialize this proposal. Each use still produces distinct
ordinary node occurrences and the renderer remains component-blind.

Component-aware inspection and editing require the retained linked source,
use boundary, prop provenance, and materialized occurrence map. The packed
archive cannot claim live parameterized-component round-trip until it gains an
explicit source-program or definition/instance layer. Until then, a converter
must flatten with declared loss or reject; it must not store parameter source
in an XML-only side table while claiming complete archive support.

An implementation may cache typed defaults, linked definitions, or equivalent
specializations. Caching is conforming only when distinct uses retain distinct
observable occurrence identity, source provenance, resource resolution, and
diagnostics.

## Considered alternatives

### External runtime owns all component parameters — rejected as canonical

External producers remain supported, but requiring one for static defaults and
arguments would make Grida XML unable to preserve or edit its own component
API. Basic deterministic parameterization belongs to the source linker.

### Component, prop, or use nodes in the render scene — rejected

The renderer needs concrete geometry, text, layout, and paint values. Adding
unresolved source constructs to that scene would spread component identity and
evaluation through layout, querying, caching, and painting without changing
the final visual model.

### Arbitrary attributes directly on `use` — rejected

```xml
<use href="#button" label="Save" width="240"/>
```

Component-dependent attributes collide with fixed instance relationship
attributes and make the grammar impossible to validate without resolving the
component. Explicit `arg` children keep the fixed `use` vocabulary stable.

### Untyped lexical props — rejected

Treating every prop as a string would create a parallel coercion layer and
weaken diagnostics, especially for colors, numbers, booleans, enums, and
resource origins. The small type set identifies value categories while
ordinary target properties retain their existing constraints.

### `<props>` and `<args>` collection wrappers — rejected

Direct leading `prop` and direct `arg` children already have unambiguous
context, match the language's existing leading typed-property topology, and
avoid collection-only tags.

### Generic `<bind property="…">` elements — rejected

Binding elements are verbose, interfere with established property-child and
render-child order, and cannot naturally represent text segments. Exact brace
bindings use one reference form across scalar attributes, text, and nested
argument forwarding.

### General interpolation or expression attributes — rejected

Attribute bindings replace one complete value. Functions, paths, arithmetic,
fallback operators, and concatenated attributes would create an expression
runtime and make static target validation weaker. Text alone permits ordered
literal and string-binding segments because its authored value is already a
character sequence.

### Defaults that reference other props — rejected

Dependent defaults introduce evaluation order, a second dependency graph, and
cycles without being necessary for initial static customization. Higher-level
runtimes may compute related values explicitly.

### Nullable props in Version 2 — deferred

Requiredness and defaults cover the initial authoring need without confusing
omission, null, empty, and target defaults. A later nullable design must prove
that its target model has a real absent state and define structural syntax;
`value="null"` will not become a universal sentinel.

### Scalar props and render-valued slots in one version — deferred

Scalar substitution does not change tree topology. Render-valued input does,
and therefore requires independent decisions about layout, painter order,
fallback, identity, ownership, cycles, and canonical writing. Combining them
would make the small scalar contract depend on the independent structural
policy now owned by the Version 3 component-slot RFD.

## Proposed conformance requirements

A conforming implementation of this proposal:

1. **MUST** implement Version 2 only as the Version 1 module model plus the
   parameterization delta defined here.
2. **MUST** require leading direct prop declarations with unique valid names
   and one declared scalar type.
3. **MUST** retain `CalleeDefault` versus `Supplied` selection independently
   from ultimate value source, including forwarded defaults and an explicit
   argument equal to the callee default.
4. **MUST** reject unknown, duplicate, missing, mistyped, and target-invalid
   arguments with component and use provenance.
5. **MUST** permit bindings only in compatible established scalar sinks and
   validate the resulting ordinary target properties after substitution.
6. **MUST NOT** interpret brace bindings as expressions, rescan substituted
   strings, or parse strings as XML or render content.
7. **MUST** resolve forwarding in the lexical outer component and preserve the
   original value origin through every hop.
8. **MUST** resolve relative resource values from the source of their supplying
   literal, not the binding target or final entry source.
9. **MUST** materialize a fully concrete ordinary scene before layout, text,
   path, paint, or render resolution.
10. **MUST NOT** add component, prop, argument, binding, or null variants to
    the observable render-scene contract merely to support this source syntax.
11. **MUST** preserve prop, argument, binding, forwarding, and use provenance
    in the linked source program and canonical writer.
12. **MUST NOT** remove an explicit argument because it currently equals a
    declaration default.
13. **MUST** keep Version 2 use content restricted to typed args and reject
    render children or Version 3 slot syntax.
14. **MUST** retain the Version 1 cycle, expansion, instance-independence, and
    source-preservation contracts.
15. **MUST** accept Version 1 components as empty-interface static definitions
    during a Version 2 operation, but **MUST NOT** permit arguments on such
    uses.
16. **MUST** select brace and binding grammar from the containing source unit's
    declared version. A Version 2 operation that links a Version 1 component
    **MUST** preserve Version 1 braces literally and **MUST NOT** manufacture
    bindings or Version 2 escaping inside that source.
17. **MUST** preserve authored argument order and declared source versions
    during source-preserving write-back when target interfaces are outside the
    link closure.
18. **MUST NOT** claim canonical multi-file output without completing the full
    library-validation closure required for target-dependent normalization.
19. **MUST** canonicalize each source unit under its own declared version and
    **MUST NOT** upgrade a Version 1 dependency because it was reached from
    Version 2.
20. **MUST** reject a prop declaration that has no scalar binding or argument
    forwarding site in its component.
21. **MAY** cache immutable declarations or specializations when observable
    instance behavior, provenance, and diagnostics remain unchanged.
