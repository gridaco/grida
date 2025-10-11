# `@grida/tree`

Handling Tree Data

[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)]()

## Installation

```bash
pnpm add @grida/tree
```

## Overview

`@grida/tree` is a collection of tree data structure utilities and systems designed for efficient management of hierarchical data. It provides three main namespaces, each optimized for different use cases:

1. **`tree.graph`** - Graph-based tree structure with explicit node and link separation (✅ Production Ready)
2. **`tree.flat_with_children`** - Flat tree operations where nodes contain their children references (🚧 WIP)
3. **`tree.lut`** - Lookup table interface for efficient hierarchical queries (🚧 WIP)

> **Note:** This documentation focuses on `tree.graph`, which is production-ready. Other namespaces are under active development.

## `tree.graph` - Graph-Based Tree System

### What is it?

`tree.graph` is a data structure and system designed with explicit separation of **nodes** (the actual data) and **links** (the relationships between nodes). This architecture provides a clean, manageable way to work with large tree data structures without breaking integrity.

### Key Concepts

#### 1. Nodes & Links Separation

Unlike traditional tree structures where parent-child relationships are embedded within node objects, `tree.graph` explicitly manages:

- **Nodes**: The real data, stored as a flat record `{ [key: string]: T }`
- **Links**: The hierarchical relationships, stored separately as `{ [key: string]: string[] | undefined }`

```ts
interface IGraph<T> {
  nodes: Record<string, T>; // The actual data
  links: Record<string, string[] | undefined>; // The relationships
}
```

#### 2. Source of Truth

The graph structure serves as the **main source of truth** for your tree data. Instead of:

- Re-mapping data structures on every operation
- Creating wrapper objects to add hierarchy information
- Maintaining duplicate or derived data structures

You work directly with the graph, which keeps your data and relationships synchronized and consistent.

#### 3. Clean API for Safe Manipulation

The `Graph` class provides a clean interface for tree manipulation that prevents common errors:

```ts
const graph = new Graph<MyNode>({
  nodes: {
    root: { name: "Root" },
    child1: { name: "Child 1" },
    child2: { name: "Child 2" },
  },
  links: {
    root: ["child1", "child2"],
    child1: undefined,
    child2: undefined,
  },
});

// Safe operations that maintain integrity
graph.mv("child1", "child2", 0); // Move child1 under child2
graph.rm("child2"); // Remove child2 and its subtree
graph.unlink("child1"); // Detach child1 without recursive removal
```

### Why Use `tree.graph`?

#### Advantages

1. **Explicit Relationships**: Links are first-class citizens, making tree structure changes predictable and debuggable
2. **Data Integrity**: Separating data from structure prevents accidental corruption
3. **Performance**: No need to rebuild or re-wrap the entire tree for structure changes
4. **Flexibility**: The same node data can be used in different graph structures without duplication
5. **Type Safety**: Full TypeScript support for your node types
6. **Manageable Complexity**: Large trees remain manageable because operations work on structure independently from data
7. **Policy Constraints**: Optional type-based rules to enforce structural validity

#### Compared to Alternatives

| Approach               | `tree.graph` | Nested Objects | Flat with Parent ID |
| ---------------------- | ------------ | -------------- | ------------------- |
| Re-mapping needed      | ❌ No        | ✅ Often       | ✅ Often            |
| Data duplication       | ❌ No        | ✅ Yes         | ⚠️ Sometimes        |
| Structure changes      | ✅ Easy      | ❌ Hard        | ⚠️ Moderate         |
| Source of truth        | ✅ Single    | ❌ Multiple    | ⚠️ Split            |
| Large tree performance | ✅ Good      | ❌ Poor        | ✅ Good             |

### API Reference

```ts
class Graph<T> {
  constructor(graph: IGraph<T>, policy?: IGraphPolicy<T>);

  // Get a snapshot of the current graph state
  snapshot(): IGraph<T>;

  // Remove a node and its entire subtree recursively
  rm(key: Key): RmResult;

  // Unlink (delete) a single node from the graph
  unlink(key: Key): void;

  // Move one or more nodes to a new parent (with policy validation)
  mv(sources: Key | Key[], target: Key, index?: number): void;

  // Reorder a node within its parent (no policy checks)
  order(
    key: Key,
    order: "back" | "front" | "backward" | "forward" | number
  ): void;

  // Import an external sub-graph into the current graph
  import(subgraph: IGraph<T>, roots: Key[], parent: Key, index?: number): void;
}

// Policy interface for structural constraints
interface IGraphPolicy<T> {
  max_out_degree?(node: T, id: Key): number | typeof Infinity;
  can_link?(parent: T, parent_id: Key, child: T, child_id: Key): boolean;
  can_be_parent?(node: T, id: Key): boolean;
  can_be_child?(node: T, id: Key): boolean;
}
```

### Example Usage

#### Basic Usage

```ts
import { tree } from "@grida/tree";

interface DocumentNode {
  id: string;
  type: "scene" | "frame" | "text" | "image";
  name: string;
}

// Initialize graph without policy (permissive)
const graph = new tree.graph.Graph<DocumentNode>({
  nodes: {
    page: { id: "page", type: "scene", name: "Page 1" },
    header: { id: "header", type: "frame", name: "Header" },
    title: { id: "title", type: "text", name: "Title" },
    logo: { id: "logo", type: "image", name: "Logo" },
  },
  links: {
    page: ["header"],
    header: ["title", "logo"],
    title: undefined,
    logo: undefined,
  },
});

// Perform operations
graph.mv("title", "page"); // Move title to page
graph.order("header", "front"); // Reorder header to front
graph.rm("logo"); // Remove logo

// Import external sub-graphs
const component = {
  nodes: { button: { id: "btn", type: "frame", name: "Button" } },
  links: { button: [] },
};
graph.import(component, ["button"], "page"); // Add component

// Get current state
const snapshot = graph.snapshot();
// snapshot.nodes contains your data
// snapshot.links contains your structure
```

#### With Policy Constraints

```ts
import { tree } from "@grida/tree";

interface DesignNode {
  type: "scene" | "frame" | "text" | "image" | "group";
  name: string;
}

// Define structural constraints
const designPolicy: tree.graph.IGraphPolicy<DesignNode> = {
  // Leaf nodes (text, image) cannot have children
  max_out_degree: (node) => {
    if (node.type === "text" || node.type === "image") return 0;
    return Infinity;
  },

  // Only containers can be parents
  can_be_parent: (node) => {
    return ["scene", "frame", "group"].includes(node.type);
  },

  // Scenes are top-level only (cannot be nested)
  can_be_child: (node) => {
    return node.type !== "scene";
  },

  // Prevent group nesting
  can_link: (parent, parent_id, child, child_id) => {
    if (parent.type === "group" && child.type === "group") return false;
    return true;
  },
};

// Create graph with policy
const graph = new tree.graph.Graph<DesignNode>(
  {
    nodes: {
      homePage: { type: "scene", name: "Home" },
      aboutPage: { type: "scene", name: "About" },
      container: { type: "frame", name: "Container" },
      heading: { type: "text", name: "Title" },
    },
    links: {
      homePage: ["container"],
      aboutPage: undefined,
      container: ["heading"],
      heading: undefined,
    },
  },
  designPolicy
);

// Valid operations
graph.mv("heading", "homePage"); // ✅ Text can be child of scene

// Invalid operations (throw descriptive errors)
graph.mv("container", "heading"); // ❌ Text cannot be a parent
graph.mv("aboutPage", "container"); // ❌ Scene cannot be nested
graph.mv("aboutPage", "homePage"); // ❌ Scene cannot be a child
```

### Design Philosophy

The `tree.graph` system is designed around these principles:

1. **Separation of Concerns**: Data (nodes) and structure (links) are managed independently
2. **Explicit Mutability**: Operations modify data in-place for predictable state changes
3. **Predictability**: Every operation has a clear, predictable effect on the graph
4. **No Magic**: No hidden state, no derived properties, no implicit behavior
5. **Performance First**: Optimized for large trees and frequent structural changes

### Mutability & State Management

#### In-Place Mutation Design

The `Graph` class **modifies the constructor data directly**. This is an intentional design choice that provides several benefits:

- **Predictable mutations**: You know exactly what data is being modified
- **No hidden copies**: The graph doesn't create internal copies of your data
- **Memory efficient**: No duplication of large tree structures
- **Framework compatible**: Works seamlessly with immutability libraries

```ts
const graphData: IGraph<MyNode> = {
  nodes: {
    /* ... */
  },
  links: {
    /* ... */
  },
};

const graph = new Graph(graphData);
graph.rm("some-node");

// graphData is now modified directly
console.log(graphData.nodes["some-node"]); // undefined
```

#### Using with Immer (or similar patterns)

This design works perfectly with immutability libraries like [Immer](https://immerjs.github.io/immer/). Pass a draft to the constructor, and all mutations will apply to that draft, producing a new immutable state:

```ts
import { produce } from "immer";
import { tree } from "@grida/tree";

interface State {
  document: tree.graph.IGraph<DocumentNode>;
  // ... other state
}

// In your reducer/state updater
const nextState = produce(currentState, (draft) => {
  // Instantiate Graph with the draft
  const graph = new tree.graph.Graph(draft.document);

  // All mutations apply to the draft
  graph.mv("node-id", "new-parent");
  graph.rm("other-node");

  // When produce completes, you get new immutable state
  // with only the modified parts changed
});
```

**Why this pattern?**

1. **Explicit control**: You decide when to create immutable snapshots (via `produce`)
2. **Efficient updates**: Immer tracks exactly what changed, no unnecessary copies
3. **Familiar patterns**: Works like standard reducers/state updaters
4. **Type safe**: Full TypeScript support throughout

**Alternative: Manual snapshots**

If you're not using an immutability library, use `snapshot()` to create copies before mutations:

```ts
const graph = new Graph(originalData);
const backup = graph.snapshot(); // Create a copy before mutation

graph.rm("some-node"); // Mutates originalData

if (needsUndo) {
  // Restore from backup
  Object.assign(originalData, backup);
}
```

### Performance Characteristics

**Time Complexity:**

| Operation    | Complexity   | Notes                                |
| ------------ | ------------ | ------------------------------------ |
| `mv()`       | O(n × m)     | n = nodes, m = avg children per node |
| `rm()`       | O(k × n × m) | k = subtree size                     |
| `unlink()`   | O(n × m)     | Single node removal                  |
| `order()`    | O(n × m)     | Reordering within parent             |
| `snapshot()` | O(n + e)     | n = nodes, e = total children        |

**Space Complexity:** O(n + e) where n = nodes, e = total edges (children)

**Performance Notes:**

- ✅ **Efficient for most use cases**: Suitable for trees with thousands of nodes
- ✅ **No data copying**: Operations mutate in-place, avoiding memory overhead
- ⚠️ **Parent lookup is O(n)**: Finding a node's parent scans all links
- 💡 **Optimization available**: For very large trees (100k+ nodes), consider caching parent relationships

### Policy System

The `Graph` class supports optional **policy constraints** to enforce structural rules on your tree.

#### What are Policies?

Policies define **what operations are allowed** based on node types and relationships:

```typescript
interface IGraphPolicy<T> {
  max_out_degree?(node: T, id: Key): number | typeof Infinity;
  can_be_parent?(node: T, id: Key): boolean;
  can_be_child?(node: T, id: Key): boolean;
  can_link?(parent: T, parent_id: Key, child: T, child_id: Key): boolean;
}
```

#### Common Use Cases

**1. Enforce leaf nodes (nodes that cannot have children):**

```ts
const policy: IGraphPolicy<DesignNode> = {
  max_out_degree: (node) => {
    // Text and images are leaf nodes
    if (node.type === "text" || node.type === "image") return 0;
    return Infinity;
  },
};
```

**2. Restrict top-level nodes (like pages, artboards, scenes):**

```ts
const policy: IGraphPolicy<DesignNode> = {
  can_be_child: (node) => {
    // Scenes/pages must stay at root level
    return node.type !== "scene";
  },
};
```

**3. Control which types can be parents:**

```ts
const policy: IGraphPolicy<DesignNode> = {
  can_be_parent: (node) => {
    // Only containers can have children
    return ["scene", "frame", "group"].includes(node.type);
  },
};
```

**4. Define parent-child compatibility:**

```ts
const policy: IGraphPolicy<DesignNode> = {
  can_link: (parent, parent_id, child, child_id) => {
    // Scenes can only contain frames/groups (not leaf nodes directly)
    if (parent.type === "scene") {
      return child.type === "frame" || child.type === "group";
    }
    return true;
  },
};
```

#### Policy Check Order

When you call `mv()`, policies are checked in this order:

1. **`can_be_child`** - Can the source node be moved?
2. **`can_be_parent`** - Can the target accept children?
3. **`max_out_degree`** - Does target have capacity?
4. **`can_link`** - Is this specific relationship allowed?

All checks happen **before any mutation** (atomic operations).

#### Example: Complete Design Tool Policy

```ts
const DESIGN_TOOL_POLICY: tree.graph.IGraphPolicy<DesignNode> = {
  max_out_degree: (node) => {
    // Leaf nodes
    if (node.type === "text" || node.type === "image") return 0;
    // Containers (unlimited)
    return Infinity;
  },

  can_be_parent: (node) => {
    return ["scene", "frame", "group"].includes(node.type);
  },

  can_be_child: (node) => {
    // Scenes stay at root level
    return node.type !== "scene";
  },

  can_link: (parent, parent_id, child, child_id) => {
    // No self-parenting
    if (parent_id === child_id) return false;
    // No group nesting
    if (parent.type === "group" && child.type === "group") return false;
    return true;
  },
};

const graph = new tree.graph.Graph(graphData, DESIGN_TOOL_POLICY);
```

### Limitations & Warnings

#### No Cycle Detection ⚠️

The `mv()` method does **not detect cycles** by default. Moving an ancestor into its descendant will create a cycle.

**Solution: Use policy to prevent cycles:**

```ts
const policy: tree.graph.IGraphPolicy<Node> = {
  can_link: (parent, parent_id, child, child_id) => {
    // Prevent self-parenting (basic cycle prevention)
    if (parent_id === child_id) return false;

    // For ancestor cycle detection, use tree.lut:
    // const lut = tree.lut.TreeLUT.from(graph.snapshot().links);
    // if (lut.isAncestorOf(child_id, parent_id)) return false;

    return true;
  },
};
```

#### Parent Lookup Performance

Finding a node's parent requires scanning all link entries (O(n)). For most applications this is acceptable, but if you need frequent parent lookups:

- Use `tree.lut.TreeLUT` for O(1) parent queries
- Consider maintaining your own parent cache
- Profile before optimizing

#### In-Place Mutation

All operations mutate the graph directly. This is intentional for performance and Immer compatibility, but be aware:

- ✅ Works perfectly with Immer's `produce()`
- ⚠️ Without Immer, mutations are permanent
- 💡 Use `snapshot()` to create backups before risky operations

### Best Practices

#### ✅ Do's

```ts
// 1. Use with Immer for immutable state management
const nextState = produce(state, (draft) => {
  const graph = new tree.graph.Graph(draft.document, policy);
  graph.mv("node-id", "new-parent");
});

// 2. Define policies for structural constraints
const policy: tree.graph.IGraphPolicy<Node> = {
  can_be_child: (node) => node.type !== "scene",
  max_out_degree: (node) => (node.type === "text" ? 0 : Infinity),
};

// 3. Create snapshots for undo functionality
const backup = graph.snapshot();
graph.rm("node");
if (needsUndo) Object.assign(graphData, backup);

// 4. Use policy for self-parenting prevention
const policy = {
  can_link: (parent, parent_id, child, child_id) => parent_id !== child_id,
};
```

#### ❌ Don'ts

```ts
// Don't allow cycles without policy checks
graph.mv("root", "child"); // ❌ Creates cycle!

// Don't mutate without Immer in immutable contexts
function reducer(state, action) {
  const graph = new tree.graph.Graph(state.document);
  graph.mv(...); // ❌ Mutates state directly
  return state; // ❌ Returns mutated reference
}

// Don't assume operations are free for huge trees
for (let i = 0; i < 100000; i++) {
  graph.mv(nodes[i], "target"); // ⚠️ O(n×m) per call
}

// Don't forget to define policies for type constraints
graph.mv("frame", "text-node"); // ⚠️ Without policy, text can have children!
```

### When to Use `tree.graph`

#### ✅ Perfect For:

- **Design tools** - Scenes, frames, groups, text, images with hierarchy rules
- **Copy/paste operations** - Import clipboard data with preserved structure
- **Component systems** - Insert templates and reusable components
- **Main data model** - Tree-based applications (editors, file systems, org charts)
- **Immer integration** - State management with immutability
- **Type constraints** - Enforce structural rules (leaf nodes, root-only types)
- **Frequent changes** - Move, add, remove, reorder, import operations
- **Large trees** - Thousands of nodes with type-based constraints
- **TypeScript projects** - Full type safety and policy validation

#### ⚠️ Consider Alternatives When:

- Need O(1) parent lookups (use `tree.lut` for queries)
- Already have nested tree structure (flatten first or use different approach)
- Need cycle detection (use policy with `tree.lut.isAncestorOf` or wait for v2)
- Working with extremely large trees (100k+ nodes) with frequent parent lookups

### Importing Sub-Graphs

The `import()` method allows you to merge external graph structures into the current graph. This is perfect for copy/paste, templates, and component insertion.

#### Basic Import

```ts
const graph = new tree.graph.Graph({
  nodes: { page: { name: "Page" } },
  links: { page: [] },
});

// Import a component
const component = {
  nodes: {
    header: { name: "Header" },
    logo: { name: "Logo" },
    title: { name: "Title" },
  },
  links: {
    header: ["logo", "title"],
    logo: undefined,
    title: undefined,
  },
};

graph.import(component, ["header"], "page");
// Now: page -> [header], header -> [logo, title]
```

#### Import with Index (Insert Position)

```ts
// Insert at specific position
graph.import(subgraph, ["newNode"], "container", 0); // Insert at start
graph.import(subgraph, ["newNode"], "container", 2); // Insert at index 2
graph.import(subgraph, ["newNode"], "container"); // Append (default)
```

#### Import Multiple Roots

```ts
// Paste multiple selected items
const clipboard = {
  nodes: {
    box1: { type: "frame" },
    box2: { type: "frame" },
    text1: { type: "text" },
  },
  links: {
    box1: undefined,
    box2: undefined,
    text1: undefined,
  },
};

graph.import(clipboard, ["box1", "box2", "text1"], "container");
// Preserves order: container -> [...existing, box1, box2, text1]
```

#### Import Behavior

**All nodes are added**, even orphans:

```ts
const subgraph = {
  nodes: {
    attached: { name: "Attached" },
    orphan: { name: "Orphan" }, // Not in roots
  },
  links: {
    attached: undefined,
    orphan: undefined,
  },
};

graph.import(subgraph, ["attached"], "parent");
// Both nodes added, but only "attached" is linked to parent
// "orphan" remains unlinked in the graph
```

**ID conflicts are checked** before any changes:

```ts
// If any ID conflicts, entire import fails (atomic)
try {
  graph.import(subgraph, roots, parent);
} catch (e) {
  // Graph unchanged - nothing was added
}
```

**Policy checks apply** to root attachment:

```ts
const policy = {
  can_be_child: (node) => node.type !== "scene",
};

const graph = new tree.graph.Graph(data, policy);

const subgraph = {
  nodes: { scene: { type: "scene" } },
  links: { scene: undefined },
};

// Throws - scenes cannot be children
graph.import(subgraph, ["scene"], "container");
```

### Advanced Usage

#### Working with Multiple Trees

```ts
// Same node data, different structures
const nodes = {
  a: { name: "A" },
  b: { name: "B" },
  c: { name: "C" },
};

// Structure 1: Linear
const linear: tree.graph.IGraph<Node> = {
  nodes,
  links: { a: ["b"], b: ["c"], c: undefined },
};

// Structure 2: Flat
const flat: tree.graph.IGraph<Node> = {
  nodes,
  links: { a: ["b", "c"], b: undefined, c: undefined },
};

// Both share the same node objects
```

#### Custom Policies

Extend the default policy for your specific needs:

```ts
// Start with permissive, add only what you need
const myPolicy: tree.graph.IGraphPolicy<MyNode> = {
  ...tree.graph.DEFAULT_POLICY_INFINITE,

  // Only restrict scenes from nesting
  can_be_child: (node) => node.type !== "scene",
};
```

#### Custom Graph Class

Extend `Graph` for additional functionality:

```ts
class DesignGraph<T> extends tree.graph.Graph<T> {
  // Add cycle detection
  mvSafe(source: Key, target: Key) {
    const lut = tree.lut.TreeLUT.from(this.snapshot().links);
    if (lut.isAncestorOf(source, target)) {
      throw new Error("Cannot create cycle");
    }
    return this.mv(source, target);
  }

  // Add batch operations
  mvMany(moves: Array<[source: Key, target: Key]>) {
    for (const [source, target] of moves) {
      this.mv(source, target);
    }
  }

  // Helper: Check if node is a container
  isContainer(id: Key): boolean {
    const node = this.snapshot().nodes[id];
    return ["scene", "frame", "group"].includes((node as any).type);
  }
}
```

### Real-World Example: Design Tool

Complete example modeling a design tool like Figma or Sketch:

```ts
import { tree } from "@grida/tree";

// 1. Define your node types
interface CanvasNode {
  type: "scene" | "frame" | "text" | "image" | "group";
  name: string;
}

// 2. Define structural constraints
const CANVAS_POLICY: tree.graph.IGraphPolicy<CanvasNode> = {
  max_out_degree: (node) => {
    // Leaf nodes
    if (node.type === "text" || node.type === "image") return 0;
    return Infinity;
  },
  can_be_parent: (node) => {
    return ["scene", "frame", "group"].includes(node.type);
  },
  can_be_child: (node) => {
    // Scenes are pages/artboards - stay at root
    return node.type !== "scene";
  },
  can_link: (parent, parent_id, child, child_id) => {
    if (parent_id === child_id) return false;
    if (parent.type === "group" && child.type === "group") return false;
    return true;
  },
};

// 3. Create your document structure
const document: tree.graph.IGraph<CanvasNode> = {
  nodes: {
    homepage: { type: "scene", name: "Homepage" },
    header: { type: "frame", name: "Header" },
    logo: { type: "image", name: "Logo" },
    nav: { type: "group", name: "Navigation" },
    title: { type: "text", name: "Welcome" },
  },
  links: {
    homepage: ["header", "nav"],
    header: ["logo", "title"],
    logo: undefined,
    nav: undefined,
    title: undefined,
  },
};

// 4. Use with Immer for state management
import { produce } from "immer";

const nextState = produce({ document }, (draft) => {
  const graph = new tree.graph.Graph(draft.document, CANVAS_POLICY);

  // ✅ Valid: Move title to nav
  graph.mv("title", "nav");

  // ✅ Valid: Import a button component
  const button = {
    nodes: {
      btn: { type: "frame", name: "Button" },
      label: { type: "text", name: "Click me" },
    },
    links: {
      btn: ["label"],
      label: undefined,
    },
  };
  graph.import(button, ["btn"], "nav");

  // ❌ Invalid: Would throw "text cannot be a parent"
  // graph.mv("logo", "title");

  // ❌ Invalid: Would throw "scene cannot be a child"
  // graph.mv("homepage", "header");
});
```

### Roadmap

Future enhancements planned for v2:

- [ ] Built-in cycle detection option
- [ ] Cached parent lookups for O(1) access
- [ ] Batch operations API
- [ ] Tree validation utilities
- [ ] Performance optimizations for large trees
- [ ] More policy examples and presets

### Related Namespaces (Coming Soon)

#### `tree.flat_with_children` (🚧 WIP)

Simple operations on flat trees where each node has a `children` array.

#### `tree.lut` (🚧 WIP)

Efficient lookup table for querying relationships with O(1) access to parents, children, ancestors, etc.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md) for details.

## License

See [LICENSE](../../LICENSE) for details.
