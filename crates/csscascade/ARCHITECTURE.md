# csscascade Architecture

> **Note**: This document does not always reflect the current state of the implementation. The content may be incorrect, ahead of, or behind the actual implementation.

**Last updated**: 2025-11-25

## Overview

`csscascade` is a **CSS Cascade & Style Resolution Engine** designed for building browser-like rendering pipelines. Unlike `usvg` (which is a full SVG parser), `csscascade` focuses specifically on the CSS cascade and style resolution step.

**Key Difference from usvg:**

- `usvg`: Parses SVG XML → Resolves CSS → Outputs simplified tree
- `csscascade`: Accepts already-parsed DOM tree → Resolves CSS → Outputs style-resolved tree

**Primary Use Case:** DOM Tree → CSS Cascade → Style-Resolved Tree → Layout → Render

This crate implements the hardest and most fundamental part of a rendering engine: the transformation from loosely-typed DOM nodes + CSS rules into a **fully computed, normalized, strongly-typed tree**.

## Design Philosophy

### Engine-Agnostic

- DOM input is **not** tied to any specific parser
- Works with any DOM-like structure implementing the crate's DOM traits
- You bring your own parser (html5ever, roxmltree, pulldown-cmark output, etc.)

### Format-Agnostic

- HTML and SVG share a unified style pipeline
- Same cascade logic for both formats
- Future support for SVG is planned (HTML + SVG share >90% of style logic)

### Separation of Concerns

- **csscascade does NOT:**

  - Parse HTML/SVG (bring your own parser)
  - Perform layout (block, inline, flex, grid)
  - Paint or rasterize
  - Handle JavaScript or dynamic updates

- **csscascade DOES:**
  - Parse and walk an HTML/XML tree (via DOM traits)
  - Perform full CSS cascade (selector matching, specificity, inheritance)
  - Produce a style-resolved static tree
  - Normalize presentation attributes (SVG-ready)
  - Expand CSS shorthands

## System Architecture

### High-Level Pipeline

```
Input DOM Tree (HTML / XML / SVG)
    ↓
[Your Parser] → DOM-like structure (implements csscascade DOM traits)
    ↓
[csscascade] → CSS Cascade & Style Resolution
    ↓
Style-Resolved Static Tree (fully computed styles)
    ↓
[Your Layout Engine] → Layout-computed tree
    ↓
[Your Painter] → Rendered Output
```

### Module Structure (Planned)

```
csscascade/
├── src/
│   ├── lib.rs              # Public API (Cascade, StyledTree)
│   ├── dom/                # DOM trait definitions
│   │   ├── mod.rs          # DomNode trait
│   │   └── adapters.rs    # Adapters for common parsers
│   ├── css/                # CSS parsing and stylesheet
│   │   ├── mod.rs          # Stylesheet, Rule, Declaration
│   │   ├── parser.rs       # CSS parser (using cssparser)
│   │   ├── selector.rs     # Selector matching (using selectors crate)
│   │   └── values.rs        # CSS value parsing (using cssparser)
│   ├── cascade/            # Cascade engine
│   │   ├── mod.rs          # Cascade struct, main logic
│   │   ├── specificity.rs  # Specificity calculation
│   │   ├── inheritance.rs  # Property inheritance
│   │   └── compute.rs      # Style computation
│   ├── style/              # Computed style types
│   │   ├── mod.rs          # ComputedStyle struct
│   │   ├── properties.rs   # CSS property definitions
│   │   ├── values.rs       # Value types (Color, Length, etc.)
│   │   └── shorthand.rs    # Shorthand expansion
│   ├── tree/               # Styled tree output
│   │   ├── mod.rs          # StyledTree, StyledNode
│   │   └── builder.rs      # Tree construction
│   └── utils/              # Utilities
│       ├── initial.rs      # Initial value handling
│       └── normalize.rs    # Value normalization
```

### Component Interactions

```
┌─────────────┐
│   DOM Tree  │ (from user's parser)
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  CSS Collection │ ← Two-Pass Pattern
│  (First Pass)   │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│   Stylesheet    │ (all CSS rules collected)
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Cascade Engine │ ← Second Pass
│  (per element)  │
└──────┬──────────┘
       │
       ├─→ Selector Matching
       ├─→ Specificity Resolution
       ├─→ Inheritance
       └─→ Style Computation
       │
       ▼
┌─────────────────┐
│  StyledTree     │ (output)
└─────────────────┘
```

### Two-Pass CSS Collection (Inspired by usvg)

csscascade follows the same two-pass pattern as usvg:

1. **First Pass**: Collect all CSS from `<style>` tags and external sources

   - Walk entire DOM tree
   - Extract CSS from all `<style>` elements
   - Parse into stylesheet
   - Store rules in document order

2. **Second Pass**: Walk DOM tree and apply CSS cascade to each element
   - For each element, match all applicable CSS rules
   - Resolve specificity and importance
   - Apply inheritance
   - Compute final style values
   - Build styled node

This ensures:

- All CSS rules available when processing any element
- Correct cascading behavior
- Predictable, deterministic output

## What csscascade Does

### ✔ 1. Parse and walk an HTML/XML tree

Accepts a DOM-like tree (any structure implementing the crate's DOM traits).

**Example DOM trait:**

```rust
pub trait DomNode {
    fn tag_name(&self) -> Option<&str>;
    fn attributes(&self) -> &[Attribute];
    fn children(&self) -> &[Self];
    fn text_content(&self) -> Option<&str>;
    // ... other DOM operations
}
```

### ✔ 2. Perform full CSS cascade

- **Selector matching**: Match CSS selectors against DOM elements
- **Specificity and importance resolution**: Handle `!important` and specificity rules
- **Inheritance**: Resolve inherited properties from ancestors
- **Initial values**: Apply CSS initial values where needed
- **Presentation attribute mapping**: Map SVG presentation attributes to CSS (SVG-ready)
- **Shorthand expansion**: Expand CSS shorthands (e.g., `margin: 10px` → `margin-top`, `margin-right`, etc.)

### ✔ 3. Produce a Style-Resolved Tree

A new tree where **every node has its final computed style** attached.

Each node includes:

- Tag name
- Attributes
- **Fully computed CSS style** (all properties resolved)
- Resolved defaults
- Resolved inheritance
- Normalized values

**Computed style includes:**

- Resolved display modes
- Resolved text properties (font-size, font-family, color, etc.)
- Resolved sizing/box model values (width, height, margin, padding, border)
- Resolved transforms & opacity
- Fully computed inline and block styles

### ✔ 4. Ready for layout engine consumption

`csscascade` does **not** perform layout.
It outputs a static, fully resolved element tree specifically designed to be fed into your layout engine (block/inline/flex/grid/etc.).

### ✔ 5. Ready for painting after layout

Since the style is computed and normalized, the next stages can be:

- Layout engine
- Display list generation
- Painting/rendering

## Dependencies and Interfaces

### External Dependencies

1. **`cssparser`** - CSS Syntax Module Level 3 parser

   - Purpose: Parse CSS stylesheets, rules, declarations, and values
   - Handles CSS tokenization and parsing according to W3C CSS Syntax spec
   - Used by Servo browser engine
   - **Benefits**: Full CSS3 support, production-proven, actively maintained

2. **`selectors`** - CSS Selectors matching engine
   - Purpose: Match CSS selectors against DOM elements
   - Handles selector parsing, matching, and specificity calculation
   - Used by Servo browser engine
   - **Benefits**: Complete CSS3 selector support, efficient matching, proven in production

**Why `cssparser` + `selectors` over `simplecss`?**

- **Broader CSS3 support**: `cssparser` and `selectors` provide comprehensive CSS3 feature support, including modern selectors, at-rules, and value types
- **Production-proven**: Both crates are core components of Servo, ensuring battle-tested reliability
- **Better separation**: `cssparser` handles CSS parsing, `selectors` handles selector matching - cleaner separation of concerns
- **Active development**: Both crates are actively maintained and aligned with latest CSS specifications
- **Extensibility**: Easier to extend for future CSS features (CSS4, custom properties, etc.)
- **W3C compliance**: Both crates follow W3C specifications closely, ensuring correct behavior

### CSS Parsing Architecture

**cssparser Integration:**

```rust
use cssparser::{Parser, ParserInput, RuleListParser};

// CSS input string
let css = ".title { color: red; }";

// Create parser input (zero-copy tokenization)
let mut input = ParserInput::new(css);
let mut parser = Parser::new(&mut input);

// Parse stylesheet
let stylesheet = parse_stylesheet(&mut parser)?;
```

**Key features:**

- Tokenizes CSS according to CSS Syntax Module Level 3
- Handles all CSS value types (colors, lengths, functions, etc.)
- Supports at-rules (`@media`, `@keyframes`, `@import`, etc.)
- Zero-copy parsing where possible
- Comprehensive error reporting

### Selector Matching Architecture

**selectors Integration:**

```rust
use selectors::parser::{SelectorList, Selector};
use selectors::matching::{matches_selector, MatchingContext, QuirksMode};

// Parse selector list
let selector_list = SelectorList::parse(
    &SELECTOR_PARSER,
    &mut cssparser::Parser::new(&mut selector_text)
)?;

// Match against DOM element
let context = MatchingContext::new(
    MatchingMode::Normal,
    None,
    None,
    QuirksMode::NoQuirks,
);
let matches = matches_selector(&selector_list.0[0], element, &context);
```

**Key features:**

- Full CSS3 selector support (including `:nth-child()`, `:not()`, etc.)
- Automatic specificity calculation
- Efficient matching algorithms
- Pseudo-class and pseudo-element support
- Attribute selector matching
- Combinator support (descendant, child, sibling, etc.)

### Internal Components

1. **DOM Trait System** (`dom/`)

   - Purpose: Define interface for DOM-like structures
   - Allows engine-agnostic design
   - Any parser can implement these traits
   - **Key trait**: `DomNode` - minimal interface for DOM traversal

2. **CSS Stylesheet** (`css/`)

   - Purpose: Store and manage CSS rules
   - Parses CSS into rules using `cssparser`
   - Maintains rule order for cascading
   - **Uses `cssparser`**: Tokenizes and parses CSS according to CSS Syntax Module Level 3

3. **Selector Matching** (`css/selector.rs`)

   - Purpose: Match CSS selectors against DOM elements
   - Uses `selectors` crate for matching
   - Handles all CSS3 selectors (including complex combinators, pseudo-classes, etc.)
   - Calculates specificity automatically via `selectors`

4. **Cascade Engine** (`cascade/`)

   - Purpose: Apply CSS cascade to DOM
   - Uses `selectors` for selector matching
   - Resolves specificity and importance (via `selectors`)
   - Applies inheritance

5. **Style Computation** (`style/`)

   - Purpose: Compute final styles from CSS rules
   - Handles specificity (via `selectors`), inheritance, initial values
   - Normalizes and expands CSS properties
   - Expands shorthands
   - Parses CSS values using `cssparser`

6. **Styled Tree Builder** (`tree/`)
   - Purpose: Build output tree with computed styles
   - Creates `StyledTree` from DOM + computed styles
   - Maintains tree structure

## Comparison with usvg

### Similarities

Both csscascade and usvg:

- Use two-pass CSS collection pattern
- Support static documents only
- Output simplified, strongly-typed trees
- Resolve all styles before conversion
- Handle inheritance correctly
- Focus on correctness and predictability

### Key Differences

| Aspect          | usvg                             | csscascade                      |
| --------------- | -------------------------------- | ------------------------------- |
| **Scope**       | Full SVG parser + CSS resolution | CSS cascade only (no parsing)   |
| **Input**       | SVG XML string                   | Already-parsed DOM tree         |
| **Parser**      | `roxmltree` (built-in)           | None (bring your own)           |
| **CSS Parser**  | `simplecss`                      | `cssparser` + `selectors`       |
| **Output**      | Simplified SVG tree              | Style-resolved tree             |
| **Use Case**    | SVG rendering                    | Any HTML/SVG rendering pipeline |
| **Format**      | SVG only                         | HTML + SVG (unified)            |
| **CSS Support** | Basic CSS (minimal)              | Full CSS3 support               |

### Why csscascade is Different

**usvg approach:**

```
SVG XML → [usvg parser] → [CSS resolution] → Simplified tree
```

**csscascade approach:**

```
HTML/SVG → [your parser] → DOM tree → [csscascade] → Style-resolved tree
```

**Benefits of csscascade's approach:**

1. **Flexibility**: Use any parser (html5ever, roxmltree, custom)
2. **Reusability**: Same cascade logic for HTML and SVG
3. **Separation**: Parsing and cascade are separate concerns
4. **Composability**: Works with existing DOM structures

## Intended Use Cases

### ✔ 1. Static HTML/SVG Renderers

If you:

- Want to parse HTML/SVG once
- Resolve styles correctly
- Produce a clean, immutable tree
- Feed it to your own layout + painting pipeline

…then `csscascade` is designed for you.

### ✔ 2. Tools that need correct CSS without a browser

For example:

- SVG → PNG converters
- HTML → PDF generators
- Print engines
- Design tools (like Figma-style or illustration tools)
- WASM/canvas engines
- Document processors

### ✖ Not for browser makers

If you need:

- Live DOM mutation
- Dynamic style recalculation
- Reflow/repaint cycles
- Incremental layout
- Event-driven DOM

…this crate intentionally does **not** target that use case.

## API Design

### Public API

```rust
use csscascade::{Cascade, StyledTree};
use your_dom_library::Document;

// Your parser produces a DOM tree
let dom: Document = parse_html("<div class=\"title\">Hello</div>");

// CSS from <style> tags or external sources
let css = "
  .title {
    font-size: 24px;
    font-weight: bold;
  }
";

// Create cascade engine
let cascade = Cascade::new(css);

// Apply cascade to DOM tree
let styled: StyledTree = cascade.apply(&dom);

// Pass styled tree to your layout engine
layout_engine.layout(&styled);
```

### DOM Trait Interface

The DOM trait must implement `selectors::Element` trait for selector matching:

```rust
use selectors::Element;

pub trait DomNode: Element {
    /// Get element tag name
    fn tag_name(&self) -> Option<&str>;

    /// Get all attributes
    fn attributes(&self) -> &[Attribute];

    /// Get attribute by name
    fn attribute(&self, name: &str) -> Option<&str>;

    /// Get child nodes
    fn children(&self) -> &[Self];

    /// Get text content
    fn text_content(&self) -> Option<&str>;

    /// Get parent node
    fn parent(&self) -> Option<&Self>;
}

// The selectors::Element trait provides:
// - match_selector() - matches a selector against the element
// - parent_element() - gets parent element
// - first_child_element() - gets first child
// - last_child_element() - gets last child
// - prev_sibling_element() - gets previous sibling
// - next_sibling_element() - gets next sibling
// - is_html_element_in_html_document() - checks HTML context
// - has_local_name() - checks element name
// - has_namespace() - checks namespace
// - attr_matches() - matches attribute selectors
// - match_pseudo_element() - matches pseudo-elements
// - match_non_ts_pseudo_class() - matches pseudo-classes
```

### StyledTree Output

```rust
pub struct StyledTree {
    pub root: StyledNode,
}

pub struct StyledNode {
    pub tag: String,
    pub attributes: Vec<Attribute>,
    pub computed_style: ComputedStyle,
    pub children: Vec<StyledNode>,
}

pub struct ComputedStyle {
    pub display: Display,
    pub color: Color,
    pub font_size: f32,
    pub font_family: String,
    pub margin: Margin,
    pub padding: Padding,
    pub border: Border,
    // ... all CSS properties
}
```

## CSS Cascade Implementation

### Two-Pass Pattern (from usvg)

```rust
use cssparser::{Parser, ParserInput};
use selectors::parser::SelectorList;

impl Cascade {
    pub fn new(css: &str) -> Result<Self, ParseError> {
        // STEP 1: Parse all CSS rules using cssparser
        let mut input = ParserInput::new(css);
        let mut parser = Parser::new(&mut input);
        let stylesheet = parse_stylesheet(&mut parser)?;
        Ok(Cascade { stylesheet })
    }

    pub fn apply<N: DomNode>(&self, dom: &N) -> StyledTree {
        // STEP 2: Walk DOM and apply cascade
        // Uses selectors crate for matching
        self.cascade_tree(dom)
    }
}
```

**CSS Parsing with `cssparser`:**

```rust
use cssparser::{Parser, ParserInput, RuleListParser, Token};

fn parse_stylesheet(input: &mut Parser) -> Result<Stylesheet, ParseError> {
    let mut rules = Vec::new();
    let rule_parser = RuleListParser::new_for_stylesheet(input, CssRuleParser);

    for rule in rule_parser {
        match rule? {
            CssRule::Style(style_rule) => {
                // Parse selector list using selectors crate
                let selector_list = SelectorList::parse(
                    &SELECTOR_PARSER,
                    &mut Parser::new(&mut style_rule.selectors)
                )?;
                rules.push(Rule {
                    selector_list,
                    declarations: style_rule.declarations,
                });
            }
            // Handle @media, @keyframes, etc.
            _ => {}
        }
    }
    Ok(Stylesheet { rules })
}
```

**Selector Matching with `selectors`:**

```rust
use selectors::matching::{matches_selector, MatchingContext, QuirksMode};

fn match_selectors<N: DomNode>(
    element: &N,
    selector_list: &SelectorList<N::Impl>,
    context: &MatchingContext<N::Impl>,
) -> bool {
    selector_list.0.iter().any(|selector| {
        matches_selector(&selector, element, context)
    })
}
```

### Cascade Algorithm

For each DOM node, the cascade process follows this algorithm:

```
1. Collect Matching Rules
   ├─→ Match selectors against element
   ├─→ Collect all matching CSS rules
   └─→ Store in document order

2. Resolve Specificity
   ├─→ Calculate specificity for each rule
   ├─→ Sort by specificity (higher wins)
   └─→ Handle !important flag

3. Apply Inheritance
   ├─→ Get parent's computed style
   ├─→ Inherit inheritable properties
   └─→ Override with element's own rules

4. Compute Final Style
   ├─→ Resolve all property values
   ├─→ Expand shorthands (margin → margin-top, etc.)
   ├─→ Apply initial values where needed
   └─→ Normalize units and values

5. Build Styled Node
   ├─→ Create StyledNode with computed style
   └─→ Recursively process children
```

### Data Structures

**Stylesheet:**

```rust
use selectors::parser::SelectorList;
use cssparser::{DeclarationList, Parser};

pub struct Stylesheet {
    rules: Vec<Rule>,  // All CSS rules in document order
}

pub struct Rule {
    // SelectorList from selectors crate (handles multiple selectors)
    selector_list: SelectorList<SelectorImpl>,
    // Parsed declarations from cssparser
    declarations: Vec<Declaration>,
    // Specificity is calculated by selectors crate automatically
}
```

**Key differences from simplecss approach:**

- `SelectorList` from `selectors` crate handles multiple selectors (e.g., `div, span`)
- Specificity is automatically calculated by `selectors` crate
- `cssparser` provides structured parsing of declarations and values
- Better support for complex selectors, pseudo-classes, and pseudo-elements

**Computed Style:**

```rust
pub struct ComputedStyle {
    // All CSS properties as resolved values
    display: Display,
    color: Color,
    font_size: Length,
    // ... hundreds of properties
}
```

### Performance Considerations

- **Zero-copy where possible**: Borrow strings from DOM and CSS input
- **Efficient selector matching**: `selectors` crate provides optimized matching algorithms
- **Selector compilation**: `selectors` compiles selectors once, matches many times
- **CSS parsing**: `cssparser` uses zero-copy tokenization where possible
- **Lazy computation**: Only compute styles for visible elements (future)
- **Memory efficiency**: Shared style objects for identical styles (future)
- **Production-tested**: Both `cssparser` and `selectors` are optimized for Servo's performance needs

## Goals

### Primary Goals

- ✅ Accurate CSS cascade implementation
- ✅ Browser-inspired computed style model
- ✅ Shared resolution logic for HTML and SVG
- ✅ Zero heap allocations in hot paths where possible
- ✅ Fast traversal + predictable output
- ✅ Engine-agnostic design (works with any DOM)

### Future Goals

- [ ] SVG presentation attributes → CSS mapping
- [ ] CSS variables (`var()`) resolution
- [ ] Custom property support
- [ ] Support for user-agent stylesheets
- [ ] Inline style parsing
- [ ] @media evaluation hooks
- [ ] Integration examples (HTML, SVG, Grida Canvas)
- [ ] Full W3C cascade compliance test suite

## Non-Goals (for now)

- Layout algorithms (block, inline, flex, grid)
- Painting or rasterization
- JavaScript-style dynamic live updates
- HTML/SVG parsing (bring your own parser)

**Note**: Selector parsing is handled by `selectors` crate, CSS parsing by `cssparser` - these are external dependencies, not implemented separately.

These are intentionally separate stages.

## Implementation Roadmap

### Phase 1: Core Cascade (MVP)

- [ ] DOM trait system (implementing `selectors::Element`)
- [ ] CSS parser integration (`cssparser`)
- [ ] Selector matching (`selectors` crate)
- [ ] Specificity calculation (handled by `selectors`)
- [ ] Basic property resolution
- [ ] Inheritance handling
- [ ] Initial value application

### Phase 2: Style Computation

- [ ] Property value computation
- [ ] Shorthand expansion
- [ ] Unit normalization
- [ ] Computed style structure
- [ ] Style-resolved tree output

### Phase 3: Advanced Features

- [ ] SVG presentation attribute mapping
- [ ] CSS variables (`var()`)
- [ ] Custom properties
- [ ] User-agent stylesheet support
- [ ] Inline style parsing

### Phase 4: Integration & Testing

- [ ] Integration examples (HTML, SVG)
- [ ] W3C compliance test suite
- [ ] Performance optimization
- [ ] Documentation and examples

## Example: Markdown → HTML → Cascade → Render

```rust
// 1. Parse markdown to HTML
let markdown = "# Title\n\nParagraph with **bold** text.";
let html = pulldown_cmark::html::push_html(
    String::new(),
    pulldown_cmark::Parser::new(markdown)
);

// 2. Parse HTML to DOM (using your parser)
let dom = html5ever::parse_document(&html, Default::default())?;

// 3. Extract CSS from <style> tags
let css = extract_css_from_dom(&dom);

// 4. Apply CSS cascade
let cascade = csscascade::Cascade::new(&css);
let styled_tree = cascade.apply(&dom);

// 5. Layout and render
let layout_tree = layout_engine.layout(&styled_tree);
renderer.render(&layout_tree);
```

## Philosophy & Design Principles

- **Engine-agnostic:** DOM input is not tied to any specific parser
- **Format-agnostic:** HTML and SVG share a unified style pipeline
- **Separation of concerns:** Cascade is separate from layout, paint, and parsing
- **Deterministic:** Same input always yields the same resolved tree
- **Modern CSS:** Designed for progressive extension (variables, calc, etc.)
- **Inspired by usvg:** Uses proven two-pass CSS collection pattern
- **Production-grade:** Uses `cssparser` and `selectors` from Servo for comprehensive CSS3 support

## Conclusion

csscascade is a **CSS cascade engine** that handles the universally hard parts (CSS cascade, style normalization, static tree production) so your rendering engine can focus on **layout and painting**, not CSS correctness.

**Key Design Principles:**

1. **Separation**: Parsing and cascade are separate concerns
2. **Flexibility**: Works with any DOM structure
3. **Correctness**: Proper CSS cascading from the start
4. **Reusability**: Same logic for HTML and SVG
5. **Simplicity**: Focused on one thing (CSS cascade) and doing it well

**Primary Goal:**
Enable reliable, predictable CSS cascade resolution for any HTML/SVG rendering pipeline, similar to how usvg enables reliable SVG rendering, but focused specifically on the CSS cascade step.
