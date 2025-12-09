# Contributing to Grida | React Conventions

Welcome to the Grida frontend contribution guide. Grida is a high-performance, canvas-based design tool built with modern web technologies. This document outlines the standards and conventions we follow to ensure our codebase remains clean, maintainable, and testable.

> **Note:** This document only covers conventions that are not automatically enforced by our linters/formatters.

---

## UI Test ID Conventions

> For contributors working on React UI

This project uses `data-testid` selectively to improve the reliability of automated tests and the debuggability of large UI surfaces.

Our primary goal with `data-testid` is **Component Locality**: being able to quickly trace a rendered DOM element back to its source component in the codebase.

### Core Principle: One ID Per Component Root

**Do not overuse or abuse `data-testid`.**

Ideally, if you have a component defined as `function MyComponent() {}`, you should add **one** `data-testid` to its root element (or the most significant wrapper). Avoid scattering test IDs on internal children unless absolutely necessary for complex interactions that cannot be targeted otherwise.

### When to Add `data-testid`

Add a `data-testid` only when the component represents a meaningful, distinct UI region or functional unit.

Examples include:

- **Major layout regions**
  - `Sidebar`, `InspectorPanel`, `CanvasView`, `TopMenuBar`
- **Purpose-specific panels**
  - `LayersPanel`, `PropertiesPanel`, `AssetsPanel`
- **High-level workflows**
  - `ExportDialog`, `ColorPicker`, `DocumentSettingsModal`
- **Complex, isolated Modules**
  - A specialized controls group, a visualization widget, etc.

#### ✅ GOOD — One ID at the Component Root

```tsx
export function LayersPanel() {
  return (
    // Single ID identifying this component's existence in the DOM
    <aside data-testid="sidebar-right-layers-panel">
      <Header />
      <Content />
      <Footer />
    </aside>
  );
}
```

### When NOT to Add `data-testid`

Do not add `data-testid` to:

- **Primitive UI elements** (`Button`, `Input`, `Icon`, `Text`)
- **Pure layout primitives** (`Box`, `Flex`, `Stack`)
- **Internal children** of a component that can be easily found via standard queries (role, text, or by their parent's test ID).

**Reason:** Over-tagging makes the DOM noisy, encourages brittle tests that rely on implementation details, and reduces the value of "landmark" IDs.

#### ❌ BAD — Overuse / Abuse

```tsx
// ❌ Don't do this: granular IDs for everything
export function LayersPanel() {
  return (
    <aside data-testid="layers-panel">
      <div data-testid="layers-panel-header">...</div>
      <ul data-testid="layers-list">
        <li data-testid="layer-item-1">...</li>
      </ul>
      <button data-testid="add-layer-btn">...</button>
    </aside>
  );
}
```

Tests should find the root `layers-panel` and then use semantic queries (e.g., `findByRole('button', { name: 'Add Layer' })`) to interact with internals.

### Naming Convention

**Strictly use kebab-case** for all `data-testid` values.

The values should be **factful**, **descriptive**, and **non-conflicting** to uniquely identify the component in the application context.

Examples:

- `sidebar-right`
- `sidebar-right-inspect-node-properties`
- `popover-color-picker-rgba32f`
- `canvas-view-viewport`
- `dialog-export-settings`

Avoid names tied to:

- exact file names
- UI copy strings
- component internals
- styling concerns

### Why We Do This

- **Traceability:** Helps developers inspect the DOM and immediately know which React component is responsible.
- **Stability:** Makes high-level UI stable to reference in tests.
- **Cleanliness:** Avoids polluting low-level reusable components.

### Summary

| Component Type                    | Should Have `data-testid`? | Reason                              |
| :-------------------------------- | :------------------------- | :---------------------------------- |
| **High-level Components / Roots** | ✅ Yes                     | Identifies the component boundaries |
| Panels (layers, properties)       | ✅ Yes                     | Stable landmarks                    |
| Dialogs / Modals / Popovers       | ✅ Yes                     | Hard to locate contextually         |
| Buttons / Inputs / Icons          | ❌ No                      | Use semantic queries (role, label)  |
| Internal implementation div/span  | ❌ No                      | Implementation detail               |
