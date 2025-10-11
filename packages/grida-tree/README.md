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
  constructor(graph: IGraph<T>);

  // Get a snapshot of the current graph state
  snapshot(): IGraph<T>;

  // Remove a node and its entire subtree recursively
  rm(key: Key): RmResult;

  // Unlink (delete) a single node from the graph
  unlink(key: Key): void;

  // Move one or more nodes to a new parent
  mv(sources: Key | Key[], target: Key, index?: number): void;

  // Reorder a node within its parent
  order(
    key: Key,
    order: "back" | "front" | "backward" | "forward" | number
  ): void;
}
```

### Example Usage

```ts
import { tree } from "@grida/tree";

interface DocumentNode {
  id: string;
  type: "frame" | "text" | "image";
  name: string;
  // ... other properties
}

// Initialize graph
const graph = new tree.graph.Graph<DocumentNode>({
  nodes: {
    root: { id: "root", type: "frame", name: "Page" },
    header: { id: "header", type: "frame", name: "Header" },
    title: { id: "title", type: "text", name: "Title" },
    logo: { id: "logo", type: "image", name: "Logo" },
  },
  links: {
    root: ["header"],
    header: ["title", "logo"],
    title: undefined,
    logo: undefined,
  },
});

// Work with the graph
const snapshot = graph.snapshot();
// snapshot.nodes contains your data
// snapshot.links contains your structure
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

### Limitations & Warnings

#### No Cycle Detection ⚠️

The `mv()` method does **not detect cycles**. Moving an ancestor into its descendant will create a cycle and break tree integrity.

**How to prevent:**

```ts
import { tree } from "@grida/tree";

// Build a lookup table to check ancestry
const lut = tree.lut.TreeLUT.from(graphData.links);

// Check before moving
if (!lut.isAncestorOf(source, target)) {
  graph.mv(source, target);
} else {
  console.error("Cannot move ancestor into descendant - would create cycle");
}
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
// Use with Immer for immutable state management
const nextState = produce(state, (draft) => {
  const graph = new tree.graph.Graph(draft.document);
  graph.mv("node-id", "new-parent");
});

// Check for cycles before moving
if (!wouldCreateCycle(source, target)) {
  graph.mv(source, target);
}

// Create snapshots for undo functionality
const backup = graph.snapshot();
graph.rm("node");
if (needsUndo) Object.assign(graphData, backup);

// Validate node existence before operations
if (nodeId in graphData.nodes) {
  graph.rm(nodeId);
}
```

#### ❌ Don'ts

```ts
// Don't move ancestors into descendants
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
```

### When to Use `tree.graph`

#### ✅ Perfect For:

- Main data model for tree-based applications
- Working with Immer for state management
- Frequent structural changes (move, add, remove, reorder)
- Need to keep data and structure separate
- Trees with thousands of nodes
- TypeScript projects requiring type safety

#### ⚠️ Consider Alternatives When:

- Need O(1) parent lookups (use `tree.lut` for queries)
- Already have nested tree structure (flatten first or use different approach)
- Need cycle detection (implement your own check or wait for v2)
- Working with extremely large trees (100k+ nodes) with frequent parent lookups

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

#### Custom Operations

```ts
class MyGraph<T> extends tree.graph.Graph<T> {
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
}
```

### Roadmap

Future enhancements planned for v2:

- [ ] Built-in cycle detection option
- [ ] Cached parent lookups for O(1) access
- [ ] Batch operations API
- [ ] Tree validation utilities
- [ ] Performance optimizations for large trees

### Related Namespaces (Coming Soon)

#### `tree.flat_with_children` (🚧 WIP)

Simple operations on flat trees where each node has a `children` array.

#### `tree.lut` (🚧 WIP)

Efficient lookup table for querying relationships with O(1) access to parents, children, ancestors, etc.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md) for details.

## License

See [LICENSE](../../LICENSE) for details.
