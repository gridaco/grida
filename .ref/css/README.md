# CSS Spec references

This directory contains reference materials used to implement a browser-grade CSS cascading module.  
The goal is to achieve fully spec-accurate `initial` and `inherited` behavior for every CSS property, matching real-world engines like Chromium Blink.

## [`css_properties.json5`](./css_properties.json5)

`css_properties.json5` is a **direct extract of Chromium Blink’s CSS property database**, located at:

[`third_party/blink/renderer/core/css/css_properties.json5`](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/css/css_properties.json5)

This file is Blink’s _single source of truth_ for all CSS property metadata, including:

- **Property names** (canonical)
- **Inheritance behavior** (`inherited: true/false`)
- **Initial values** (`default_value: ...`)
- **Type information** (`type_name`, value converter)
- **Longhand/shorthand relationships**
- **Animation/interpolation flags**
- **Parsing behavior flags**
- **Extra property-specific metadata**

Blink uses this file to generate:

- `ComputedStyleBase` fields
- `ComputedStyleInitialValues`
- CSS parser logic
- Style builder code

This means the file embeds the **actual behavior used by Chrome** when resolving CSS cascade and computed style.
