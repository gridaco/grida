---
title: "css_properties.json5"
description: "Chromium Blink's single source of truth for CSS property metadata, used as a reference for browser-grade CSS cascade implementation"
---

# About `css_properties.json5`

When you build your own browser or rendering engine that supports HTML, CSS, or SVG, you'll inevitably face the challenge of resolving computed styles. Which properties inherit from their parent elements? What are the initial values for each property? How do shorthand properties expand into their longhand components? These questions aren't just academic—they're fundamental to rendering content correctly, and getting them wrong means your engine will produce visual artifacts, layout bugs, and style inconsistencies.

The CSS specification is comprehensive, but it's also sprawling across multiple documents, with edge cases and implementation details scattered throughout. You could spend months reading through W3C drafts, browser compatibility tables, and test suites, trying to piece together the exact behavior for each of the hundreds of CSS properties.

Or, you could look at what the world's most widely-used browser engine actually does.

`css_properties.json5` is Chromium Blink's **single source of truth** for all CSS property metadata. This file is the exact database that Chrome uses to generate its CSS cascade and computed style infrastructure—the same code that resolves styles for billions of web pages every day. It's the most reliable, well-aligned reference you can trust, and quite possibly the only place where you can see the complete, authoritative specification for every CSS property in a single, machine-readable format.

## Source

This file is a direct extract from Chromium Blink's CSS property database:

**Upstream source:** [`third_party/blink/renderer/core/css/css_properties.json5`](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/css/css_properties.json5)

Blink uses this file to generate:

- `ComputedStyleBase` fields
- `ComputedStyleInitialValues`
- CSS parser logic
- Style builder code
- Property metadata and type information

This means the file embeds the **actual behavior used by Chrome** when resolving CSS cascade and computed style, making it an authoritative reference for browser-grade CSS implementation.

## Purpose in Grida

Grida uses this file as a reference to implement spec-accurate CSS cascade behavior, particularly for:

- **Initial values** — Every property's default value as used by Chrome
- **Inheritance behavior** — Which properties inherit from parent elements
- **Property relationships** — Longhand/shorthand mappings, aliases, and surrogates
- **Type information** — Value types, keywords, and parsing behavior
- **Computed style metadata** — Flags for animation, layout dependency, and style resolution

## Key Metadata Fields

The file defines a comprehensive set of metadata parameters for each CSS property. Notable patterns include:

### Core Behavior

- **`inherited`** — Whether the property inherits from parent elements (e.g., `color: true`, `display: false`)
- **`default_value`** — The initial value used when no value is specified (e.g., `color` defaults to `StyleColor(Color::kBlack)`)
- **`type_name`** — The C++ type used in `ComputedStyle` (e.g., `StyleColor`, `Length`, `Keyword`)

### Property Relationships

- **`longhands`** — For shorthand properties, lists the longhand properties they expand to (e.g., `margin` → `["margin-top", "margin-right", "margin-bottom", "margin-left"]`)
- **`alias_for`** — Properties that are aliases of other properties (resolved at parse time)
- **`surrogate_for`** — Properties that act like another property but exist alongside it in the cascade (e.g., logical properties like `inline-size` for `width`/`height`)

### Style Resolution

- **`independent`** — Properties that affect only one `ComputedStyle` field and can be set directly during inheritance without forcing a full recalc
- **`priority`** — Computation priority level (high-priority properties like `line-height` are computed before operations like font updates)
- **`layout_dependent`** — Properties whose resolved value depends on layout (requires layout update for `getComputedStyle()`)

### Animation & Interpolation

- **`interpolable`** — Whether the property can be smoothly animated
- **`compositable`** — Whether the property can be animated by the compositor
- **`is_animation_property`** — Whether the property is a longhand of `animation` or `transition` shorthands

### Code Generation

- **`property_methods`** — Methods implemented for the property (e.g., `ParseSingleValue`, `ParseShorthand`, `CSSValueFromComputedStyleInternal`)
- **`style_builder_template`** — Template used for style builder code generation (e.g., `"color"`, `"animation"`, `"background_layer"`)
- **`style_builder_custom_functions`** — Custom functions that suppress code generation (allows hand-written implementations)

### Context & Validation

- **`valid_for_marker`** — Whether the property is valid for `::marker` pseudo-elements
- **`valid_for_cue`** — Whether the property is valid for WebVTT cue pseudo-elements
- **`valid_for_page_context`** — Whether the property is valid in `@page` rules
- **`affected_by_all`** — Whether the property is affected by the `all` shorthand

## Example Property Definitions

### Simple Inherited Property

```json5
{
  name: "color",
  property_methods: [
    "ParseSingleValue",
    "CSSValueFromComputedStyleInternal",
    "ColorIncludingFallback",
  ],
  interpolable: true,
  inherited: true,
  independent: true,
  default_value: "StyleColor(Color::kBlack)",
  type_name: "StyleColor",
  priority: 1,
}
```

### Shorthand Property

```json5
{
  name: "background",
  longhands: [
    "background-image",
    "background-position-x",
    "background-position-y",
    "background-size",
    "background-repeat",
    "background-attachment",
    "background-origin",
    "background-clip",
    "background-color",
  ],
  property_methods: ["ParseShorthand", "CSSValueFromComputedStyleInternal"],
}
```

### Layout-Dependent Property

```json5
{
  name: "margin",
  longhands: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
  property_methods: ["ParseShorthand", "CSSValueFromComputedStyleInternal"],
  layout_dependent: true,
}
```

## Usage in csscascade

The `csscascade` crate uses this file as a reference to implement:

1. **Initial value resolution** — Ensuring every property has the correct default value
2. **Inheritance logic** — Correctly propagating inherited properties from parent to child
3. **Shorthand expansion** — Expanding shorthand properties into their longhand components
4. **Property metadata** — Type information and validation rules

By aligning with Blink's property database, `csscascade` can achieve browser-grade accuracy in CSS cascade resolution without reimplementing the entire specification from scratch.

## Notes

- The file uses JSON5 format, allowing comments and trailing commas
- Properties are defined in alphabetical order
- Internal properties (prefixed with `-internal-`) are included but marked as non-computable
- The file is regularly updated as new CSS properties are added to Blink
- Runtime flags (`runtime_flag`) allow properties to be conditionally enabled based on feature flags
