# Fundamental Tools (for AI)

This document proposes the philosophical basis for the fundamental toolset, enabling machines to design like humans.

## Key Principles

- Versioning, Sandboxing, and Rolling Back

## Tools

### `::man`

This tool serves as the documentation and self-discovery interface for all other tools, inspired by the Unix `man` command. It displays structured, human-readable manual pages for any tool, including syntax, description, and examples, and acts as the primary entry point for understanding system capabilities.

### `::text_content`

Similar to [DOM's textContent](https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent), this tool extracts the node as plain text.

Unlike the DOM, the design is likely unordered; this tool accepts an optional argument for sorting, aligning with geometric layout so that the output follows the reading direction.

This tool provides a clean textual representation of design elements to facilitate analysis and manipulation.

### `::tree`

Similar to the [`tree`](<https://en.wikipedia.org/wiki/Tree_(command)>) command, this tool returns the tree structure of the node.

It enables hierarchical understanding of design components for structured processing.

### `::html`

This exports a canvas subtree as HTML.

It allows integration and reuse of design elements in web environments.

### `::peek_pixels`

This peeks at pixels at a specific point in the canvas or node.

It provides precise visual inspection for pixel-level verification.

### `::exec`

This executes a command on the canvas API.

It enables dynamic manipulation of the canvas through scripted instructions.

### `::select`

This selects nodes at a specific point in the canvas.

It facilitates targeted interaction and editing of design elements.

### `::diff`

This diffs the nodes between the current canvas and the target canvas.

It supports change detection and version comparison within designs.

### `::lint`

This generates a visual linting report for the current state of the canvas subtree.

It helps identify and enforce design consistency and best practices.

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

### `::format`

Formats design elements for consistent presentation and output.

### `::resource` / `::asset`

Manages external resources and assets linked to the design for streamlined usage.
