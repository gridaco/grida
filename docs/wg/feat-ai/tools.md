# Fundamental Tools (for AI)

This document proposes the philosophical basis for the fundamental toolset, enabling machines to design like humans.

## Key Principles

- Versioning, Sandboxing, and Rolling Back

## Tools

---

> **Search** Tools

### `::man`

This tool serves as the documentation and self-discovery interface for all other tools, inspired by the Unix `man` command. It displays structured, human-readable manual pages for any tool, including syntax, description, and examples, and acts as the primary entry point for understanding system capabilities.

### `::tree`

Similar to the [`tree`](<https://en.wikipedia.org/wiki/Tree_(command)>) command, this tool returns the tree structure of the node.

It enables hierarchical understanding of design components for structured processing.

Example:

```
└─ ⛶  Document (nodes=4, scenes=1, entry=scene)
   └─ ⛶  Frame HeroSection  (type=container, id=frame)  [1280×720]  fill=#111111  opacity=0.9
      ├─ ✎  Text Title  (type=text, id=text)  "Welcome to Grida"  font=Inter  size=32  weight=700
      └─ ◼  Rect Button  (type=rectangle, id=button)  [160×48]  fill=#3B82F6  radius=8
```

### `::snapshot`

This takes a snapshot of the current canvas state.

### `::search`

Searches the scene graph for nodes by **semantics**, **geometry**, and **structure**. Returns a stable, ordered list of node IDs (plus brief metadata) without dumping full nodes.

- **Semantics**: type, role, name text, style tokens (fill/stroke/font), accessibility labels.
- **Geometry**: point/region queries (contains, intersects, overlaps), relations (near, aligned_to, left_of, above), size/ratio ranges.
- **Structure**: ancestry/descendancy (within, has_child, sibling_of), component/instance links.
- **Ordering**: by z-index, document order, reading order, distance to point, or score.

**Notes**

- Read-only; pairs with `::select` and `::exec` for actions.
- Supports boolean logic and filters (e.g., `type:Text AND near:(200,480,32)`), and pagination/cursors for large results.
- Returns compact briefs `{id, type, name?, bbox?, z?}` to minimize token cost.

This tool enables efficient retrieval of nodes based on complex criteria for precise design queries.

### `::text_content`

Similar to [DOM's textContent](https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent), this tool extracts the node as plain text.

Unlike the DOM, the design is likely unordered; this tool accepts an optional argument for sorting, aligning with geometric layout so that the output follows the reading direction.

This tool provides a clean textual representation of design elements to facilitate analysis and manipulation.

### `::html`

This exports a canvas subtree as HTML.

It allows integration and reuse of design elements in web environments.

### `::peek_pixels`

This peeks at pixels at a specific point in the canvas or node.

It provides precise visual inspection for pixel-level verification.

### `::image`

This exports a canvas subtree as an image.

### `::diff`

This diffs the nodes between the current canvas and the target canvas.

It supports change detection and version comparison within designs.

---

> **Awareness** tools

### `::select`

This selects nodes at a specific point in the canvas.

It facilitates targeted interaction and editing of design elements.

---

> **Run** tools

### `::exec`

This executes a command on the canvas scripting api sandbox.

It enables dynamic manipulation of the canvas through scripted instructions.

### `::lint`

This generates a visual linting report for the current state of the canvas subtree.

It helps identify and enforce design consistency and best practices.

### `::format`

Formats design elements for consistent presentation and output.

---

> **Specialized Insert** tools

### `::make_from_svg`

Insert a node from an SVG string.

### `::make_from_image`

Insert a node from an image URL/Data. (Non SVG)

### `::make_from_markdown`

Insert a node from a markdown (or plain txt) string.

---

> **Unsafe** tools

### `::unsafe_js_eval`

This calls eval() with the givven code string. needs explicit user approval.

---

> **Resource** tools

### `::resource` / `::asset`

Manages external resources and assets linked to the design for streamlined usage.

- search fonts
- search icons
- search photos
