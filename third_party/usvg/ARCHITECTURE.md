# usvg Architecture: Parsing and Style Resolution

> **Note**: This document does not always reflect the current state of the implementation. The content may be incorrect, ahead of, or behind the actual implementation.

**Last updated**: 2025-11-25

## Overview

`usvg` (micro SVG) is an SVG parser that transforms complex SVG files with mixed styles (CSS, inline attributes, style attributes) into a simplified, strongly-typed tree structure. This document explains how it handles the complexity of SVG parsing, particularly focusing on CSS and style resolution.

## System Architecture

### High-Level Pipeline

The parsing pipeline follows these stages:

```
SVG XML String
    ↓
[roxmltree] → XML Document (DOM-like structure)
    ↓
[svgtree::parse] → Intermediate SVG Tree (with CSS resolution)
    ↓
[converter] → Final Tree (simplified, strongly-typed)
```

### Module Structure

```
usvg/
├── src/
│   ├── lib.rs              # Public API entry point
│   ├── parser/              # Parsing and CSS resolution
│   │   ├── mod.rs           # Parser module, error types
│   │   ├── svgtree/         # Intermediate tree representation
│   │   │   ├── mod.rs       # Document, Node, Attribute structures
│   │   │   ├── parse.rs     # XML → svgtree conversion (two-pass CSS)
│   │   │   ├── names.rs     # EId, AId enums (element/attribute IDs)
│   │   │   └── text.rs      # Text node handling
│   │   ├── style.rs         # Style resolution (fill, stroke, paint)
│   │   ├── converter.rs     # svgtree → tree::Tree conversion
│   │   ├── shapes.rs        # Shape element parsing (rect, circle, etc.)
│   │   ├── text.rs          # Text element parsing
│   │   ├── use_node.rs      # <use> element resolution
│   │   ├── paint_server.rs  # Gradient, pattern resolution
│   │   ├── filter.rs        # Filter effects
│   │   ├── mask.rs          # Mask elements
│   │   ├── clippath.rs      # Clip path elements
│   │   ├── marker.rs         # Marker elements
│   │   ├── image.rs         # Image elements
│   │   ├── switch.rs        # <switch> element
│   │   ├── units.rs         # Unit conversion
│   │   └── options.rs       # Parser options
│   ├── tree/                # Final tree structure
│   │   ├── mod.rs           # Tree, Node, Group, Path, Image, Text
│   │   ├── geom.rs          # Geometry types (Rect, Transform, etc.)
│   │   ├── filter.rs        # Filter types
│   │   └── text.rs          # Text-specific types
│   ├── text/                # Text rendering (optional feature)
│   │   ├── mod.rs
│   │   ├── layout.rs
│   │   ├── flatten.rs
│   │   └── colr.rs
│   └── writer.rs            # SVG output (optional)
```

### Key Components

1. **XML Parsing Layer** (`roxmltree`)

   - Parses raw SVG XML into a DOM-like structure
   - Handles namespaces, attributes, and element hierarchy
   - Provides zero-copy string storage via `StringStorage`

2. **Intermediate SVG Tree** (`svgtree::Document`)

   - Custom tree structure optimized for SVG
   - Stores attributes as strongly-typed `AId` (Attribute ID) enums
   - Resolves CSS and style attributes into presentation attributes
   - Handles attribute inheritance
   - **Key design**: Attributes stored separately from nodes (memory efficient)

3. **Style Resolution Layer** (`parser::style.rs`, `parser::svgtree::parse.rs`)

   - Two-pass CSS collection
   - Selector matching via `simplecss`
   - Precedence handling (`!important`, specificity)
   - Inheritance resolution

4. **Conversion Layer** (`parser::converter.rs`)

   - Converts `svgtree::Document` to `tree::Tree`
   - Resolves all references (`url(#id)`)
   - Converts shapes to paths
   - Computes paint objects (Color, Gradient, Pattern)
   - Calculates bounding boxes

5. **Final Tree** (`tree::Tree`)
   - Simplified, render-ready structure
   - All references resolved
   - All styles computed and applied
   - Only contains renderable elements (Group, Path, Image, Text)

## CSS and Style Resolution

### The Challenge

SVG supports styles in multiple ways:

- **Presentation attributes**: `fill="red"`, `stroke-width="2"`
- **Style attributes**: `style="fill:red; stroke-width:2"`
- **CSS stylesheets**: `<style>rect { fill: red; }</style>`
- **External stylesheets**: `<link rel="stylesheet" href="styles.css">`
- **Inheritance**: Some attributes inherit from parent elements

### Full Document CSS Scan

**Yes, usvg scans the entire document first to extract all CSS before parsing any elements.**

The process works like this:

```rust
fn parse<'input>(
    xml: &roxmltree::Document<'input>,
    injected_stylesheet: Option<&'input str>,
) -> Result<Document<'input>, Error> {
    // ... setup ...

    // STEP 1: Scan entire document for ALL <style> tags
    let style_sheet = resolve_css(xml, injected_stylesheet);

    // STEP 2: Now parse elements, applying the complete stylesheet
    parse_xml_node_children(..., &style_sheet, ...)?;
}
```

The `resolve_css` function:

```rust
fn resolve_css<'a>(
    xml: &'a roxmltree::Document<'a>,
    style_sheet: Option<&'a str>,
) -> simplecss::StyleSheet<'a> {
    let mut sheet = simplecss::StyleSheet::new();

    // 1. Parse injected stylesheet first (lowest priority)
    if let Some(style_sheet) = style_sheet {
        sheet.parse_more(style_sheet);
    }

    // 2. Find ALL <style> tags in the document using descendants()
    //    This scans the ENTIRE document tree
    for node in xml.descendants().filter(|n| n.has_tag_name("style")) {
        let text = node.text()?;
        sheet.parse_more(text);  // Add rules to the stylesheet
    }

    sheet  // Return complete stylesheet with all rules
}
```

**Key points:**

- Uses `xml.descendants()` to traverse the entire XML tree
- Collects CSS from **all** `<style>` tags, regardless of where they appear
- Rules are added to the stylesheet in document order
- The complete stylesheet is then passed to element parsing

### CSS Cascading

CSS cascading works correctly because:

1. **All rules are collected first** - The stylesheet contains all rules from all `<style>` tags
2. **Rules are applied in document order** - When iterating `style_sheet.rules`, they're in the order they appeared
3. **All matching rules are applied** - For each element, ALL matching rules are evaluated:

```rust
// Apply CSS.
for rule in &style_sheet.rules {  // Iterate in document order
    if rule.selector.matches(&XmlNode(xml_node)) {
        for declaration in &rule.declarations {
            write_declaration(declaration);  // Apply each declaration
        }
    }
}
```

4. **Later rules override earlier ones** - The `insert_attribute` function handles precedence:
   - If a rule matches and sets `fill: red`
   - Then a later rule matches and sets `fill: blue`
   - The later rule wins (normal CSS cascading)

### Selector Matching

The `simplecss` library handles CSS selector matching. usvg implements the `simplecss::Element` trait to allow selectors to match against XML nodes:

```rust
struct XmlNode<'a, 'input: 'a>(roxmltree::Node<'a, 'input>);

impl simplecss::Element for XmlNode<'_, '_> {
    fn parent_element(&self) -> Option<Self> {
        self.0.parent_element().map(XmlNode)
    }

    fn prev_sibling_element(&self) -> Option<Self> {
        self.0.prev_sibling_element().map(XmlNode)
    }

    fn has_local_name(&self, local_name: &str) -> bool {
        self.0.tag_name().name() == local_name
    }

    fn attribute_matches(&self, local_name: &str, operator: simplecss::AttributeOperator) -> bool {
        match self.0.attribute(local_name) {
            Some(value) => operator.matches(value),
            None => false,
        }
    }

    fn pseudo_class_matches(&self, class: simplecss::PseudoClass) -> bool {
        match class {
            simplecss::PseudoClass::FirstChild => self.prev_sibling_element().is_none(),
            _ => false,  // Static SVG, so ignore :hover, :focus, etc.
        }
    }
}
```

**Supported selectors:**

- Element selectors: `rect`, `circle`, `g`
- Class selectors: `.highlight`, `.active`
- ID selectors: `#myElement`
- Attribute selectors: `[fill="red"]`, `[class~="highlight"]`
- Descendant selectors: `g rect` (parent-child relationships)
- Child selectors: `g > rect` (direct children)
- Sibling selectors: `rect + circle` (adjacent siblings)
- Pseudo-classes: `:first-child` (limited support for static SVG)

**Why this works:**

- The `XmlNode` wrapper provides access to the XML tree structure
- `simplecss` can traverse parent/child relationships
- Attribute matching supports all CSS attribute operators (`=`, `~=`, `|=`, `^=`, `$=`, `*=`)
- Multiple selectors can match the same element (cascading)

### Resolution Process

The style resolution happens in `svgtree::parse::parse_svg_element()` and follows this order (CSS specificity):

1. **Copy presentation attributes** (lowest priority)

   ```rust
   // Direct attributes like fill="red" are copied first
   for attr in xml_node.attributes() {
       append_attribute(..., attr.value(), false, ...);
   }
   ```

2. **Apply CSS rules from stylesheets** (medium priority)

   ```rust
   // CSS rules from <style> tags are matched and applied
   for rule in &style_sheet.rules {
       if rule.selector.matches(&XmlNode(xml_node)) {
           for declaration in &rule.declarations {
               write_declaration(declaration);
           }
       }
   }
   ```

3. **Apply style attribute** (highest priority)
   ```rust
   // Inline style="..." attributes override everything
   if let Some(value) = xml_node.attribute("style") {
       for declaration in simplecss::DeclarationTokenizer::from(value) {
           write_declaration(&declaration);
       }
   }
   ```

### CSS Parsing

The CSS resolution uses the `simplecss` library:

```rust
fn resolve_css<'a>(
    xml: &'a roxmltree::Document<'a>,
    style_sheet: Option<&'a str>,
) -> simplecss::StyleSheet<'a> {
    let mut sheet = simplecss::StyleSheet::new();

    // 1. Parse injected stylesheet (if provided)
    if let Some(style_sheet) = style_sheet {
        sheet.parse_more(style_sheet);
    }

    // 2. Parse all <style> tags in the SVG
    for node in xml.descendants().filter(|n| n.has_tag_name("style")) {
        let text = node.text()?;
        sheet.parse_more(text);
    }

    sheet
}
```

### Attribute Insertion with Precedence

When inserting attributes from CSS or style attributes, the code handles precedence correctly:

```rust
let mut insert_attribute = |aid, value: &str, important: bool| {
    // Check if attribute already exists
    let idx = doc.attrs[attrs_start_idx..]
        .iter_mut()
        .position(|a| a.name == aid);

    // Append the new attribute
    append_attribute(..., value, important, ...);

    if let Some(idx) = idx {
        let existing_idx = attrs_start_idx + idx;
        let last_idx = doc.attrs.len() - 1;

        // Handle !important flag and precedence
        // When a declaration is important, the order of precedence is reversed
        let has_precedence = !doc.attrs[existing_idx].important;

        if has_precedence {
            // Swap: new attribute takes precedence
            doc.attrs.swap(existing_idx, last_idx);
        }

        // Remove the old one
        doc.attrs.pop();
    }
};
```

**Precedence Rules:**

- `!important` declarations override non-important ones
- When both are important, the **last** one wins (reverse order)
- When neither is important, the **last** one wins (normal order)

### Style Attribute Splitting

The `style` attribute is split into individual presentation attributes:

```xml
<!-- Input -->
<rect style="fill:red; stroke:blue; stroke-width:2"/>

<!-- Becomes -->
<rect fill="red" stroke="blue" stroke-width="2"/>
```

This happens during parsing, so the final tree never contains `style` attributes.

## Attribute Inheritance

SVG has complex inheritance rules. Some attributes inherit from any ancestor, others only from the direct parent.

### Inheritable Attributes

Attributes like `fill`, `stroke`, `opacity` can inherit from any ancestor:

```rust
pub fn find_attribute<T: FromValue<'a, 'input>>(&self, aid: AId) -> Option<T> {
    if aid.is_inheritable() {
        // Walk up the ancestor chain
        for n in self.ancestors() {
            if n.has_attribute(aid) {
                return n.attribute(aid);
            }
        }
        None
    } else {
        // Non-inheritable: check self, then direct parent only
        if self.has_attribute(aid) {
            Some(*self)
        } else {
            self.parent_element()?.attribute(aid)
        }
    }
}
```

### Handling `inherit` Value

When an attribute value is `inherit`, it's resolved during parsing:

```rust
if aid.allows_inherit_value() && &*value == "inherit" {
    return resolve_inherit(parent_id, aid, doc);
}
```

The `resolve_inherit` function:

1. Finds the attribute in an ancestor (or parent for non-inheritable)
2. Copies the value
3. Falls back to default values if not found

## Node Structure

### Intermediate Tree (`svgtree::Document`)

The intermediate tree uses a custom structure optimized for SVG:

```rust
pub struct Document<'input> {
    nodes: Vec<NodeData>,           // Tree structure
    attrs: Vec<Attribute<'input>>,   // All attributes (shared storage)
    links: HashMap<String, NodeId>,  // ID → NodeId lookup
}

pub struct Attribute<'input> {
    pub name: AId,                              // Strongly-typed attribute ID
    pub value: roxmltree::StringStorage<'input>, // Borrowed or owned string
    pub important: bool,                         // CSS !important flag
}
```

**Key Design Decisions:**

- Attributes stored separately from nodes (reduces memory)
- `AId` enum instead of strings (type-safe, faster lookups)
- `StringStorage` allows borrowing from XML (zero-copy when possible)
- `important` flag preserved for correct CSS precedence

### Final Tree (`tree::Tree`)

The final tree contains only renderable elements:

```rust
pub enum Node {
    Group(Box<Group>),
    Path(Box<Path>),
    Image(Box<Image>),
    Text(Box<Text>),
}
```

Each node has:

- **Resolved styles**: `Fill`, `Stroke` with computed `Paint` (Color, Gradient, Pattern)
- **Transforms**: Absolute transforms (all ancestor transforms combined)
- **Bounding boxes**: Pre-computed in object and canvas coordinates
- **References resolved**: All `url(#id)` references point to actual objects

## Style Resolution Example

Let's trace through a complex example with cascading:

```xml
<svg>
  <style>
    rect { fill: blue; }
    .highlight { fill: red !important; }
    rect { fill: green; }  /* Later rule */
  </style>
  <g fill="orange">
    <rect class="highlight" style="fill:yellow" stroke="black"/>
  </g>
</svg>
```

**Processing steps:**

1. **Full Document CSS Scan** (happens first):

   ```rust
   resolve_css(xml, None)
   ```

   - Scans entire document with `xml.descendants()`
   - Finds `<style>` tag
   - Parses all three rules into stylesheet:
     - `rect { fill: blue; }`
     - `.highlight { fill: red !important; }`
     - `rect { fill: green; }` // Later in document
   - Returns complete `StyleSheet` object

2. **Process `<g>` element**:

   - Copy `fill="orange"` attribute (presentation attribute)
   - Check CSS: No rules match (not a `rect`, no `highlight` class)
   - Result: `fill="orange"`

3. **Process `<rect>` element**:

   - **Step 1**: Copy presentation attributes
     - `stroke="black"` → added
   - **Step 2**: Apply CSS rules (in document order)
     ```rust
     for rule in &style_sheet.rules {
         if rule.selector.matches(&XmlNode(xml_node)) {
             // Apply declarations
         }
     }
     ```
     - Rule 1: `rect { fill: blue; }` → matches! → `fill="blue"`
     - Rule 2: `.highlight { fill: red !important; }` → matches! → `fill="red"` (important)
     - Rule 3: `rect { fill: green; }` → matches! → `fill="green"`
     - **Result after CSS**: `fill="green"` (last matching rule wins, but `!important` preserved)
   - **Step 3**: Apply style attribute
     - `style="fill:yellow"` → `fill="yellow"`
     - **Final result**: `fill="yellow"` (style attribute has highest priority, unless `!important`)

**Cascading behavior:**

- Multiple rules can match the same element
- Rules are applied in document order
- Later rules override earlier ones (normal cascading)
- `!important` flag is preserved and can override style attributes
- Style attribute has highest priority (unless `!important`)

**Actual precedence in code:**

1. Presentation attributes (lowest)
2. CSS rules (medium) - later rules override earlier ones
3. Style attribute (highest) - unless CSS has `!important`

## Paint Resolution

After attributes are collected, they're converted to `Paint` objects:

```rust
pub(crate) fn resolve_fill(
    node: SvgNode,
    has_bbox: bool,
    state: &converter::State,
    cache: &mut converter::Cache,
) -> Option<Fill> {
    // Find fill attribute in ancestors
    if let Some(n) = node.ancestors().find(|n| n.has_attribute(AId::Fill)) {
        let value: &str = n.attribute(AId::Fill)?;
        convert_paint(node, value, AId::Fill, has_bbox, state, &mut sub_opacity, cache)?
    } else {
        (Paint::Color(Color::black()), None) // Default
    }
}
```

The `convert_paint` function handles:

- `none` → No paint
- `currentColor` → Uses `color` attribute
- `#rrggbb` / `rgb(...)` → `Paint::Color`
- `url(#gradient)` → Resolves to `Paint::LinearGradient` or `Paint::RadialGradient`
- `url(#pattern)` → Resolves to `Paint::Pattern`

## Component Architecture

### Data Flow

```
Input: SVG XML String
    │
    ├─→ [roxmltree] → XML Document
    │                    │
    │                    ├─→ resolve_css() → StyleSheet
    │                    │                    │
    │                    └─→ parse_xml_node_children()
    │                                         │
    │                                         ├─→ parse_svg_element()
    │                                         │    │
    │                                         │    ├─→ Copy attributes
    │                                         │    ├─→ Apply CSS rules
    │                                         │    └─→ Apply style attr
    │                                         │
    │                                         └─→ svgtree::Document
    │                                                          │
    └─→ [converter] ←─────────────────────────────────────────┘
         │
         ├─→ convert_doc()
         │    │
         │    ├─→ convert_element() (recursive)
         │    │    │
         │    │    ├─→ resolve_fill()
         │    │    ├─→ resolve_stroke()
         │    │    ├─→ convert_paint()
         │    │    └─→ resolve references
         │    │
         │    └─→ tree::Tree
         │
         └─→ Output: Render-ready tree
```

### Key Design Patterns

1. **Two-Pass CSS Collection**

   - **First pass**: Scan entire document to collect all CSS rules
   - **Second pass**: Parse elements and apply complete stylesheet
   - This ensures all CSS is available when matching selectors
   - Works correctly with `<style>` tags anywhere in the document

2. **Separation of Concerns**

   - XML parsing separate from SVG semantics
   - CSS resolution separate from attribute resolution
   - Style resolution separate from paint resolution

3. **Strong Typing**

   - `EId` enum for element names (prevents typos)
   - `AId` enum for attribute names (faster lookups)
   - Type-safe attribute parsing via `FromValue` trait

4. **Efficient Storage**

   - Attributes stored separately (shared across nodes)
   - String borrowing when possible (zero-copy)
   - HashMap for ID lookups (O(1) instead of O(n))

5. **Correct CSS Handling**

   - Uses `simplecss` for proper CSS parsing
   - Handles selector matching correctly
   - Preserves `!important` flag
   - Applies rules in correct order

6. **Comprehensive Inheritance**

   - Distinguishes inheritable vs non-inheritable attributes
   - Handles `inherit` keyword correctly
   - Walks ancestor chain efficiently

7. **Post-processing**
   - Removes recursive references
   - Resolves all `use` elements
   - Converts shapes to paths
   - Normalizes units

### Error Handling

Errors are propagated through the pipeline:

```rust
pub enum Error {
    NotAnUtf8Str,
    MalformedGZip,
    ElementsLimitReached,  // Security limit
    InvalidSize,
    ParsingFailed(roxmltree::Error),
}
```

- Errors are returned as `Result<T, Error>`
- Parsing stops on first error
- Security limits prevent DoS (element count limit)

## Limitations

As noted in the README:

- **Minimal CSS support**: Only basic selectors (no `:hover`, `:focus`, etc.)
- **Static SVG only**: No animations, scripts, or dynamic features
- **Some features ignored**: Unsupported SVG features are silently dropped

## Summary

usvg's architecture handles complex SVG files with mixed styles by:

1. **Parsing CSS first** into a stylesheet
2. **Applying styles in order**: attributes → CSS → style attribute
3. **Resolving inheritance** during attribute lookup
4. **Converting to strongly-typed** intermediate representation
5. **Post-processing** to resolve references and simplify

The key insight is that **all style resolution happens during XML parsing**, before conversion to the final tree. This means the final tree contains only resolved, computed values, making rendering straightforward.
