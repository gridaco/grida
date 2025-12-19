---
title: Grida document schema naming conventions
---

# `.grida` Naming Conventions

| feature id                    | status | description                                                | PRs                                                                                                                                                     |
| ----------------------------- | ------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.grida (naming conventions)` | draft  | Naming conventions internals for the `.grida` file format. | [#456](https://github.com/gridaco/grida/pull/456), [#462](https://github.com/gridaco/grida/pull/462), [#474](https://github.com/gridaco/grida/pull/474) |

## Purpose

This document establishes the canonical naming rules for all Grida data schemas and serialized formats.  
These rules apply universally to archive formats, messaging protocols, and public/private REST APIs.  
SDKs may follow their host‑language idioms for _methods_, but all _data fields_ must follow the canonical format.

---

## Canonical Format: `snake_case`

All schema properties and serialized identifiers must use `snake_case`.

Rationale:

- Cross‑language neutrality
- Predictable mapping to JSON and binary formats
- Long‑term stability and compatibility across the ecosystem

This is the single authoritative casing for all data exchanged within Grida.

---

## Boundary Exceptions

SDK and language-facing APIs may use idiomatic method and parameter names:

- TypeScript / JS → `camelCase`
- C# → `PascalCase`
- Rust → `snake_case`

These exceptions apply **only to API method surfaces**, never to schema field names or serialized output.

---

## Pattern Examples

### Geometry

```
corner_radius
corner_smoothing
```

### Rectangular Geometry

```
rectangular_corner_radius_top_left
rectangular_corner_radius_top_right
rectangular_corner_radius_bottom_left
rectangular_corner_radius_bottom_right
rectangular_stroke_width_top
rectangular_stroke_width_right
rectangular_stroke_width_bottom
rectangular_stroke_width_left
```

### Stroke

```
stroke_width
stroke_align
stroke_join
stroke_cap
stroke_miter_limit
```

### Paints

```
fill_paints
stroke_paints
```

### Typography

```
font_size
font_family
line_height
```

### Layout

```
padding_top
padding_right
padding_bottom
padding_left
main_axis_alignment
cross_axis_gap
```

### Effects

```
fe_blur
fe_backdrop_blur
```

### Vector

```
vector_network
fill_rule
```

---

## Backward Compatibility

Legacy formats using other casing styles may be supported through deserialization aliases:

```rust
#[serde(rename = "corner_radius", alias = "cornerRadius")]
corner_radius: Option<f32>,
```

Aliases are for migration only and should not introduce new variants.

---

## Principles

1. All schema fields use `snake_case`.
2. Names are stable once published.
3. Aliases are permitted only for migration.
4. SDK method names follow language conventions.
5. Additions must remain consistent, descriptive, and durable.

---

## Summary

- **Canonical:** `snake_case` for all schema and serialized fields
- **Applies to:** archive formats, messaging protocols, public/private REST APIs
- **Exceptions:** SDK method names only
- **Goal:** clarity, neutrality, and long‑term compatibility

This serves as the foundation for consistent schema evolution across the Grida ecosystem.

## Notes

- regexp for searching non-snake_case fields:`\b(?=[a-z]*[A-Z])[a-z][a-zA-Z0-9]*\??\s*:` (finds `fieldName: T` / `fieldName:? T`)
