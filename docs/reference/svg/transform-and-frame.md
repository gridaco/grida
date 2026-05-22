---
title: "SVG Transforms and Coordinate Frames"
description: "Reference for SVG transform-attribute syntax, viewport / viewBox, and use-instance coordinate frames — feeds an IR redesign that must refuse-vs-normalize rotation and pivot."
keywords:
  - svg
  - transforms
  - coordinate-frames
  - viewbox
  - use
  - svg-editor
tags:
  - internal
  - research
  - svg
format: md
---

# SVG Transforms and Coordinate Frames

Reference notes feeding an IR redesign for `@grida/svg-editor`. The IR has to make a refuse-vs-normalize policy decision for rotation and pivot handling, so this doc enumerates exactly which `transform=` shapes carry observably distinct information that a faithful editor must preserve on round-trip. Spec quotes are taken from SVG 1.1 §7, SVG 2 §5/§8, and CSS Transforms Level 1.

All matrices below are written in the column-vector convention the SVG spec uses: a 3×3 affine matrix acts on the column vector `[x y 1]ᵀ`, so `M · [x y 1]ᵀ` gives the transformed point. The conventional six-tuple `(a b c d e f)` corresponds to:

```
[a c e]
[b d f]
[0 0 1]
```

## 1. The seven transform functions

SVG 1.1 §7.6 ("The `transform` attribute", https://www.w3.org/TR/SVG11/coords.html#TransformAttribute) gives the BNF for the attribute and defines six function names: `matrix`, `translate`, `scale`, `rotate`, `skewX`, `skewY`. The `rotate` function has both a 1-argument and a 3-argument form, giving seven distinct shapes a parser must recognize. SVG 2 §8.5 ("The `transform` property", https://www.w3.org/TR/SVG2/coords.html#TransformProperty) defers the CSS property's syntax to CSS Transforms Level 1; the SVG `transform=` _attribute_ keeps the SVG 1.1 grammar for compatibility (CSS Transforms 1 §10.5, https://www.w3.org/TR/css-transforms-1/#svg-transform: "For backwards compatibility reasons, the syntax of the transform, patternTransform, gradientTransform attributes differ from the syntax of the transform CSS property").

### `matrix(a b c d e f)`

Six numbers, in column-major order over the first two columns of a 3×3 matrix. SVG 1.1 §7.6 describes it as "a transformation in the form of a transformation matrix of six values":

```
[a c e]
[b d f]
[0 0 1]
```

This is the most general 2D affine; every other form below is a special case.

### `translate(tx [ty])`

`ty` defaults to 0 when omitted ("If `<ty>` is not provided, it is assumed to be zero", SVG 1.1 §7.6).

```
[1  0  tx]
[0  1  ty]
[0  0   1]
```

### `scale(sx [sy])`

`sy` defaults to `sx` when omitted ("it is assumed to be equal to `<sx>`", SVG 1.1 §7.6). One unit along an axis after the transform corresponds to `sx` (resp. `sy`) units before it.

```
[sx  0  0]
[ 0 sy  0]
[ 0  0  1]
```

### `rotate(angle)` — 1-argument

Rotation about the origin of the current coordinate system. SVG 1.1 §7.6 says it "rotates the coordinate system axes by angle a". `a` is in degrees.

```
[cos(a)  -sin(a)  0]
[sin(a)   cos(a)  0]
[0        0       1]
```

(SVG 1.1 §7.6 prints this matrix with the sign convention shown above when read column-vector style; the spec listing in §7.6 uses the transposed row-vector layout. Either way, a positive angle rotates the +x axis toward the +y axis, which under SVG's y-down screen frame is the visually clockwise direction.)

### `rotate(angle cx cy)` — 3-argument

Rotation about an explicit pivot `(cx, cy)` expressed in the **current** coordinate system. SVG 1.1 §7.6 defines this _by reduction_, not by an independent matrix:

> "The operation represents the equivalent of the following specification: `translate(<cx>, <cy>) rotate(<rotate-angle>) translate(-<cx>, -<cy>)`."

This identity is load-bearing for section 3 below.

### `skewX(angle)` and `skewY(angle)`

Single-axis shears. SVG 1.1 §7.6 says `skewX` "has the effect of skewing X coordinates by angle a" and symmetrically for `skewY`.

```
skewX(a):                     skewY(a):
[1  tan(a)  0]                [1       0  0]
[0  1       0]                [tan(a)  1  0]
[0  0       1]                [0       0  1]
```

## 2. Composition order

SVG 1.1 §7.6 specifies the per-attribute composition: "the net effect is as if each transform had been specified separately in the order provided". The matrix-level rule is post-multiplication (SVG 1.1 §7.5, "Nested transformations", https://www.w3.org/TR/SVG11/coords.html#NestedTransformations):

> "The effect of nested transformations is to post-multiply (i.e., concatenate) the subsequent transformation matrices onto previously defined transformations."

Concretely, if the attribute reads `transform="T1 T2 T3"` and each `Ti` is a matrix, the matrix the user agent assembles is `T1 · T2 · T3`, and a local point `p` is mapped to viewport coordinates as `T1 · T2 · T3 · p`. Read left-to-right, each function modifies the _coordinate system_ the rest of the list (and the geometry) lives in; read right-to-left, each function modifies the _coordinates_ of the geometry. Both readings give the same answer; SVG's prose uses the coordinate-system reading.

### Worked example: `translate(10 20) rotate(30)` on (0, 0)

Let `T = translate(10, 20)` and `R = rotate(30°)`. The combined matrix is `T · R`. Applied to the origin:

```
T · R · [0 0 1]ᵀ
  = T · [0 0 1]ᵀ          (R fixes the origin)
  = [10 20 1]ᵀ
```

So the origin maps to (10, 20). The rotation happened "first" in matrix-product order (rightmost factor applied first to the point), but visually the entire rotated coordinate system was _then_ translated by (10, 20) — so the rotation pivot, viewed from the parent frame, is (10, 20), not (0, 0).

Swapping the order, `rotate(30) translate(10 20)` applied to (0, 0):

```
R · T · [0 0 1]ᵀ
  = R · [10 20 1]ᵀ
  = [10·cos30 − 20·sin30,  10·sin30 + 20·cos30, 1]ᵀ
  ≈ [−1.34, 22.32, 1]ᵀ
```

Same two functions, different result. Order is observable.

## 3. `rotate(θ cx cy)` desugaring

SVG 1.1 §7.6 gives the identity directly:

> "`rotate(<rotate-angle> <cx> <cy>)` … represents the equivalent of the following specification: `translate(<cx>, <cy>) rotate(<rotate-angle>) translate(-<cx>, -<cy>)`."

So as a matrix:

```
rotate(θ, cx, cy)
  = translate(cx, cy) · rotate(θ) · translate(−cx, −cy)
```

This is exactly the matrix that rotates by θ about the point `(cx, cy)` in the current coordinate system.

**Round-trip caveat.** Because the three-argument form is _defined_ as equivalent to a three-step composition, a parser that flattens each `transform=` entry into a normalized list (e.g. one whose nodes carry only `{kind: rotate, angle, cx, cy}` or, worse, one that desugars eagerly into matrix or into the translate/rotate/translate triple) cannot distinguish on re-serialization between:

- `rotate(30)` vs `rotate(30 0 0)` — observationally identical matrices, distinct source spellings.
- `rotate(30 90 110)` vs `translate(90 110) rotate(30) translate(-90 -110)` — also observationally identical, distinct source spellings.
- `rotate(30 90 110)` vs the single 6-tuple `matrix(...)` produced by multiplying it out.

A faithful editor that wants to round-trip the original spelling has to retain the syntactic form, not just the matrix. An editor that promises only matrix-equivalence can normalize freely.

## 4. CSS `transform` property vs `transform=` attribute

SVG 2 §8.5 (https://www.w3.org/TR/SVG2/coords.html#TransformProperty) states that user agents "must support the transform property and presentation attribute as defined in css-transforms-1". The `transform=` attribute is treated as a _presentation attribute_ — it feeds the cascade at low specificity.

CSS Transforms Level 1 §10 ("SVG and the transform Property", https://www.w3.org/TR/css-transforms-1/#svg-transform) resolves the conflict explicitly:

> "Because of the participation to the CSS cascade, the transform style property overrides the transform attribute."

So when both are set on the same element — `transform="rotate(30)"` plus an inline `style="transform: rotate(45deg)"`, or a stylesheet rule — the CSS property wins and the attribute is effectively ignored for rendering.

**Function-set mismatch.** The CSS `transform` property and the SVG `transform=` attribute do _not_ share a grammar. CSS Transforms 1 §10.5:

> "For backwards compatibility reasons, the syntax of the transform, patternTransform, gradientTransform attributes differ from the syntax of the transform CSS property. For the attributes, there is no support for additional transform-functions defined for the CSS transform property."

Practical consequences:

- CSS-side `rotate` is single-argument and uses angle units (`rotate(30deg)`); it has no `rotate(θ cx cy)` three-argument form. The CSS equivalent of an explicit pivot is `transform-origin`, which moves the origin around which `transform` operates (CSS Transforms 1 §3.3). Default `transform-origin` is `50% 50%` on most elements, but **for SVG elements without an associated CSS layout box, the used value of `transform-origin` is `0 0`** (CSS Transforms 1 §6.2 / §3.3 SVG note), which restores the SVG-attribute convention.
- CSS `translate(...)` accepts percentages; SVG-attribute `translate(...)` does not.
- The attribute accepts unitless numbers for angles (interpreted as degrees); the CSS property requires `<angle>` units.

**Editor emit behavior in the wild.** Figma's SVG export, Illustrator's SVG export, and Inkscape default to writing `transform="..."` on `<g>` and shape elements. Recent browsers (and svg-edit-style tools) sometimes emit inline `style="transform: ..."`. A few generators emit both, in which case rendering follows the CSS rule above and the attribute is dead weight — but the attribute may still be the only thing that other tools (older Illustrator, headless rasterizers, server-side librsvg builds) consult, so the practical "what does this file look like" answer depends on the consumer.

## 5. `<g>` inheritance and composition

SVG 2 §5 ("Document structure") treats `<g>` as a grouping container whose `transform=` applies to its descendants by being prepended to their CTM accumulation. SVG 1.1 §7.5 (linked above): the descendant's CTM is "the accumulation of all transformations … up to and including the element that established the current viewport".

`<g>` does **not** establish a new viewport. Only `<svg>` (outer and nested) and `<symbol>` (when instantiated via `<use>`) do. From SVG 2 §8.2 (https://www.w3.org/TR/SVG2/coords.html#Introduction), an "SVG viewport" is established by the outermost `<svg>` and re-established by inner `<svg>` and by `<symbol>` instances; `<g>` is purely a transform-cascade node and does not reset `viewBox` semantics or clip to a viewport.

Consequence for an editor: any `transform=` on a `<g>` is _composed with_ descendant transforms — the matrix on a leaf is `T_outer · T_g · T_leaf`. Lifting transforms up and down the tree is allowed only when no sibling or stylesheet relies on the intermediate frame (e.g. clip-paths, masks, or `transform-origin: 50% 50%` resolved against an element's bounding box can all break).

## 6. `<use>` shadow trees

SVG 2 §5.6 ("The `<use>` element", https://www.w3.org/TR/SVG2/struct.html#UseElement) defines `<use>` as cloning a referenced subtree into a "use-element shadow tree". From §5.6.1:

> "the user agent must create a use-element shadow tree whose host is the 'use' element itself"

and

> "Each node in the shadow tree is an instance of a corresponding node from the referenced document subtree."

The shadow tree is a live, styled clone — the originals stay in the document, the clones inherit `<use>`'s computed style, and event targeting/CSS specificity follow shadow-tree rules.

### `x` and `y` as implicit translate

SVG 2 §5.6.2 ("Layout of re-used graphics", https://www.w3.org/TR/SVG2/struct.html#UseLayout):

> "The x and y properties define an additional transformation (translate(x,y), where x and y represent the computed value of the corresponding property) to be applied to the 'use' element, after any transformations specified with other properties (i.e., appended to the right-side of the transformation list)."

So `<use href="#a" x="10" y="20" transform="rotate(30)"/>` has an effective transform of `rotate(30) · translate(10, 20)`. The implicit translate sits at the **end** of the list (right-multiplied), so it acts on the referenced geometry _before_ the explicit transform list does — which means `(x, y)` is positioned in the parent frame _after_ rotation. This is the opposite of the order most authors intuit, and any editor that round-trips `<use>` has to either honor it or normalize `(x, y)` into an explicit `translate(...)` in the correct place.

### `<use>` of a `<symbol>` with a `viewBox`

When `<use>` references a `<symbol>`, the symbol is rendered "very similarly to a nested 'svg' element" (SVG 2 §5.5). The symbol's `viewBox` and `preserveAspectRatio` then establish a viewport transform inside the shadow tree, using the `width` and `height` on the `<use>` (or on the symbol, if `<use>` doesn't override). Putting it together, a single `<use width="100" height="100" x="10" y="20" transform="rotate(30)" href="#sym"/>` where `<sym>` has `viewBox="0 0 50 50"` composes:

1. parent CTM,
2. then `rotate(30)`,
3. then `translate(10, 20)` (from `x`/`y`),
4. then the symbol's viewport transform (scale 2× from viewBox 50→100, plus any aspect-ratio padding),
5. then the symbol's descendant geometry.

Three of those five layers are implicit and don't appear in the `transform=` attribute string.

## 7. Nested viewports

SVG 2 §8.2 establishes that nested `<svg>` elements create new viewports. The combination of `x`/`y`/`width`/`height` on the inner `<svg>` (positioning the new viewport within the parent's coordinate system) and `viewBox`/`preserveAspectRatio` (mapping the inner content into that viewport) produces an implicit affine that is composed onto the CTM before any descendant `transform=` runs.

SVG 2 §8.6 ("The viewBox attribute", https://www.w3.org/TR/SVG2/coords.html#ViewBoxAttribute):

> "The presence of the viewBox attribute results in a transformation being applied to the viewport coordinate system."

The exact transform is computed by the 14-step algorithm in SVG 2 §8.2 ("Establishing a new viewport" / "Computing a viewport transform"). The upshot for an editor: a nested `<svg>` is _not_ equivalent to a `<g transform="...">` with the same matrix, because the viewport also clips by default (`overflow: hidden` on `<svg>`) and resets `preserveAspectRatio` semantics. Normalizing `<svg>` to `<g>` is lossy.

## 8. Forms a faithful editor must distinguish

This is the synthesis section the IR uses. For each shape an author or upstream tool might write into `transform=`, the question is: what is the natural read, and what does an editor lose if it normalizes this shape into a different one?

### 8.1 Empty / absent

`transform=""` and a missing attribute are equivalent to the identity for rendering. They are still _syntactically_ distinct, and some downstream tools (linters, diff tools) care. Round-trip-faithful normalization is "drop the attribute on identity"; otherwise indistinguishable.

### 8.2 `translate(tx ty)` alone

Pure translation. Natural read: the element's local origin sits at `(tx, ty)` in the parent frame. Resize anchored anywhere on the element does not move this point. Round-trip cost of normalizing into `matrix(1 0 0 1 tx ty)`: lossless for rendering, but readability drops sharply, and many downstream tools (Illustrator, some plotter pipelines) prefer the symbolic form. Inexpensive to preserve as `{translate, tx, ty}`.

### 8.3 `rotate(θ)` alone (implicit pivot at origin)

Rotation about the element's local origin (the parent frame's `(0, 0)` of the current CTM, _not_ the geometry's bounding box center). Natural read: "this subtree is rotated by θ, and its origin is unchanged". The pivot is the local origin — usually the same as the parent's coordinate origin for the subtree.

Cost of normalizing to `rotate(θ 0 0)`: matrix-identical, but a tool that round-trips by re-serializing the IR will now write three numbers where one was written, and downstream diffs become noisy. Cost of normalizing to `matrix(...)`: same as 8.2 — lossless, ugly.

### 8.4 `rotate(θ cx cy)` alone (explicit pivot)

Rotation about an explicit pivot expressed in the _current_ (parent) coordinate system. Natural read: "rotate this subtree by θ around the point `(cx, cy)` of the parent frame, regardless of where the geometry happens to sit". This is the form Inkscape and Illustrator emit for rotated objects, with `(cx, cy)` typically chosen as the geometry's bounding-box center.

Cost of normalizing to `translate(cx cy) rotate(θ) translate(-cx -cy)`: matrix-identical (this is _literally_ the spec's defining identity), but the IR has now committed to a three-op chain where the author wrote one, and on serialization either round-trips three ops (noisy) or has to recognize the pattern and re-fold it (mechanical but easy to get wrong on edits). Cost of normalizing to a single `matrix(...)`: same as above plus the original pivot is no longer recoverable without decomposition.

The **load-bearing case for the IR policy decision**: when the geometry resizes (section 9), `cx` and `cy` may or may not be intended to track. If the IR has eagerly desugared, it has lost the author's intent ("rotate around the geometry's center") and can only see the post-image ("rotate around point `(90, 110)`").

### 8.5 `translate(tx ty) rotate(θ)`

The classic two-op form. Natural read: "place the local origin at `(tx, ty)`, then rotate the subtree around that placed origin by θ". This is what most editors emit when the rotation pivot _is_ the element's own local origin and the element has been moved. Matrix-equivalent to `rotate(θ ?, ?)` with `(?, ?) = (tx, ty)` — but only because rotation about `(tx, ty)` after translation by `(tx, ty)` is the same as translation by `(tx, ty)` after rotation about the origin, _and_ because `(0, 0)` happens to be the local origin of the un-translated geometry.

Cost of normalizing to `rotate(θ tx ty)`: matrix-identical (in the present), but breaks an authorial invariant: the author said "the pivot follows the translation", and the normalized form says "the pivot is fixed at world point `(tx, ty)`". These diverge under subsequent edits to either `tx`/`ty` or to the geometry.

### 8.6 `translate(tx ty) rotate(θ cx cy)`

Translation plus rotation about an explicit pivot. Natural read: the subtree is translated, then rotated about `(cx, cy)` _expressed in the post-translation frame_. Cost of normalizing to a single `rotate(θ cx' cy')` with `(cx', cy') = (cx + tx, cy + ty)`: matrix-identical, but the IR has now lost the translation as a separately editable axis — moving the object becomes "change `cx'`, `cy'`, and `e/f` in lockstep". Likely undesirable for an editor.

### 8.7 `matrix(a b c d e f)`

The general affine. Some generators (font-glyph exporters, SVG-from-PDF tools, librsvg's clipboard export) emit raw matrices because they don't track which user operation produced the matrix. Natural read: "this is the affine; the decomposition is unspecified".

Cost of normalizing to `translate + rotate + scale + skew`: requires polar / QR / SVD-style decomposition, which is non-unique (sign ambiguity, axis swap, scale-vs-rotation-by-180° ambiguity) and chooses one decomposition out of many. Preserving as a literal `matrix(...)` IR node is honest about the uncertainty.

### 8.8 Anything else ("mixed")

Multi-op lists that don't match the canonical shapes above: `scale(...) skewX(...) rotate(...)`, repeated `rotate(...)` calls, lists that include `skewX`/`skewY`. Natural read: this is exactly the sequence the author or upstream tool wrote, and there is no shorter equivalent that preserves the per-op decomposition. Normalizing to a single `matrix(...)` is lossless for rendering but throws away any chance of round-tripping the source.

### Summary table

| shape                                | matrix-faithful normalization | what's lost on normalization                       |
| ------------------------------------ | ----------------------------- | -------------------------------------------------- |
| empty / absent                       | identity                      | attribute presence (rarely matters)                |
| `translate(tx ty)`                   | → `matrix(1 0 0 1 tx ty)`     | readability; symbolic edit axes                    |
| `rotate(θ)`                          | → `rotate(θ 0 0)` or `matrix` | spelling; "pivot is the origin" semantic           |
| `rotate(θ cx cy)`                    | → translate/rotate/translate  | "pivot is `(cx, cy)`" as an editable axis (see §9) |
| `translate(tx ty) rotate(θ)`         | → `rotate(θ tx ty)`           | "pivot follows translation" semantic               |
| `translate(tx ty) rotate(θ cx cy)`   | → `rotate(θ cx+tx cy+ty)`     | translation as a separate axis                     |
| `matrix(a b c d e f)`                | (already general)             | nothing for rendering; decomposition is ambiguous  |
| mixed (scale/skew/repeated rotate/…) | → `matrix(...)`               | per-op editability and source round-trip           |

## 9. The pivot-on-resize problem

Take a concrete element:

```xml
<rect x="60" y="80" width="60" height="60"
      transform="rotate(30 90 110)" />
```

Before any edit, the local bounding box (in the rect's own frame, ignoring the rotation) has its center at `(60 + 60/2, 80 + 60/2) = (90, 110)`. The `transform` rotates by 30° about exactly that point, so the rotated rect is visibly rotated about its own center. Good.

Now resize SE-anchored to width 80 (height stays 60). The author's edit changed `width="60"` to `width="80"`. The new local bounding-box center is `(60 + 80/2, 80 + 60/2) = (100, 110)`.

### Case A: IR preserves the `rotate(θ cx cy)` form as authored, doesn't touch `cx`/`cy` on resize

The serialized output is:

```xml
<rect x="60" y="80" width="80" height="60"
      transform="rotate(30 90 110)" />
```

Pivot is still `(90, 110)` — the _old_ center. The rotated rect now spins around a point that is `10` units west of its new center. Visually, the rect appears to have rotated _and_ shifted: the SE corner the user dragged is no longer where their cursor was when they released.

Walking the math: in the un-rotated local frame the rect occupies `[60, 140] × [80, 140]`. After `rotate(30° around (90, 110))`:

- corner `(60, 80)` (NW) maps to roughly `(53.04, 84.02)`
- corner `(140, 80)` (NE) — note this is the _new_ east edge — maps to `(122.32, 124.02)`
- corner `(140, 140)` (SE) maps to `(92.32, 175.96)`
- corner `(60, 140)` (SW) maps to `(23.04, 135.96)`

The intended SE corner (which the user dragged) is no longer at the cursor.

### Case B: IR updates `cx`, `cy` to track the new local center

The serialized output is:

```xml
<rect x="60" y="80" width="80" height="60"
      transform="rotate(30 100 110)" />
```

Pivot is now `(100, 110)` — the new center. Re-doing the math for the same four corners under `rotate(30° around (100, 110))`:

- `(60, 80)` → `(58.04, 79.02)` _(NW shifts ~5 NW)_
- `(140, 80)` → `(127.32, 119.02)` _(NE shifts ~5 NW)_
- `(140, 140)` → `(97.32, 170.96)` _(SE shifts ~5 NW)_
- `(60, 140)` → `(28.04, 130.96)` _(SW shifts ~5 NW)_

All four corners translate uniformly by approximately `(+5·cos30 − 0, +5·sin30) − (?)` ≈ `(+5, 0)` from their case-A positions, because we moved the pivot east by 10 units which, under a 30° rotation, induces an offset of roughly `(10·(1 − cos30), 10·sin30) ≈ (1.34, 5)` on every point (the spec identity in §3 makes this exact: changing `(cx, cy)` by `Δ` adds `(I − R) · Δ` to every output point).

The rect is now rotated about its new center, which is the WYSIWYG behavior for an SE-resize handle — _but_ the rectangle has visibly shifted across the canvas relative to case A, because changing the pivot of a rotation is not a no-op.

### What the IR has to decide

Both cases are matrix-faithful to _some_ legal SVG file. The author's intent is not recoverable from the rendered geometry alone — the IR has to pick a policy, and the policy is only well-defined if the IR retained enough structure to know which form the author used:

- If the original transform was `rotate(30 90 110)` with `(90, 110)` happening to equal the bounding-box center, the editor probably wants case B (track the center).
- If the original transform was `rotate(30 90 110)` with `(90, 110)` being a deliberate world-space anchor (e.g. the corner of a parent group), the editor probably wants case A (preserve the pivot).
- If the original transform was `translate(...) rotate(30)` — pivot at the local origin — the editor wants neither: resize doesn't change the pivot, and the pivot was never `(90, 110)` to begin with.

An IR that eagerly normalizes all three of those into the same internal representation (say, `{translate, rotate, scale}` or a single matrix) cannot tell them apart at edit time, which is the motivating constraint for the refuse-vs-normalize decision.

---

### Citation index

Spec sections cited above, in order of appearance:

- SVG 1.1 §7.6, "The transform attribute" — https://www.w3.org/TR/SVG11/coords.html#TransformAttribute
- SVG 1.1 §7.5, "Nested transformations" — https://www.w3.org/TR/SVG11/coords.html#NestedTransformations
- SVG 2 §8.2, "The initial viewport" / "Establishing a new viewport" — https://www.w3.org/TR/SVG2/coords.html#Introduction
- SVG 2 §8.5, "The transform property" — https://www.w3.org/TR/SVG2/coords.html#TransformProperty
- SVG 2 §8.6, "The viewBox attribute" — https://www.w3.org/TR/SVG2/coords.html#ViewBoxAttribute
- SVG 2 §5.5, "The symbol element" — https://www.w3.org/TR/SVG2/struct.html#SymbolElement
- SVG 2 §5.6, "The use element" — https://www.w3.org/TR/SVG2/struct.html#UseElement
- SVG 2 §5.6.1, "The use-element shadow tree" — https://www.w3.org/TR/SVG2/struct.html#UseShadowTree
- SVG 2 §5.6.2, "Layout of re-used graphics" — https://www.w3.org/TR/SVG2/struct.html#UseLayout
- CSS Transforms 1 §3.3, "The transform-origin property" — https://www.w3.org/TR/css-transforms-1/#transform-origin-property
- CSS Transforms 1 §10, "SVG and the transform Property" — https://www.w3.org/TR/css-transforms-1/#svg-transform
- CSS Transforms 1 §10.5 — https://www.w3.org/TR/css-transforms-1/#svg-transform
