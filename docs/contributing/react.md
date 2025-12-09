# Contributing to Grida | React Conventions

Welcome to the Grida frontend contribution guide. Grida is a high-performance, canvas-based design tool built with modern web technologies. This document outlines the standards and conventions we follow to ensure our codebase remains clean, maintainable, and testable.

> **Note:** This document only covers conventions that are not automatically enforced by our linters/formatters.

---

## UI Test ID Conventions

> For contributors working on React UI

This project uses `data-testid` selectively to improve the reliability of automated tests and the debuggability of large UI surfaces.

These attributes should be added only to high-level, purpose-built UI components — not to generic or reusable UI primitives.

### When to Add `data-testid`

Add a `data-testid` only when the component represents a meaningful UI region or functional unit in the application.

Examples include:

- **Major layout regions**
  - `Sidebar`, `InspectorPanel`, `CanvasView`, `TopMenuBar`
- **Purpose-specific panels**
  - `LayersPanel`, `PropertiesPanel`, `AssetsPanel`
- **High-level workflows**
  - `ExportDialog`, `ColorPicker`, `DocumentSettingsModal`
- **UI that appears conditionally or asynchronously**
  - Snackbars, toasts, context menus, floating toolbars

These components are frequently interacted with in tests or are difficult to locate through semantic queries alone.

#### ✅ GOOD — Add `data-testid`

```tsx
<div data-testid="sidebar-right-layers-panel">
  ...
</div>

<section data-testid="canvas-view-main">
  ...
</section>

<aside data-testid="sidebar-right-properties-panel">
  ...
</aside>
```

### When NOT to Add `data-testid`

Do not add `data-testid` to:

- **Primitive UI elements**
  - `Button`, `Input`, `Icon`, `Checkbox`, `Text`, etc.
- **Pure layout primitives**
  - `Box`, `Flex`, `Stack`
- **Components whose identity should be determined by semantics**
  - e.g., a `<button>` is already identifiable

**Reason:** Over-tagging makes the DOM noisy and reduces the value of test IDs.

#### ❌ BAD — Do NOT add `data-testid`

```tsx
<button data-testid="button">Click</button>

<input data-testid="input" />
```

For primitives, tests should rely on:

- text queries
- role queries
- label queries
- aria attributes

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

### Example: High-Level Component With Test ID

```tsx
export function LayersPanel() {
  return <aside data-testid="sidebar-right-layers-panel">{/* ... */}</aside>;
}
```

### Why We Do This

- Makes high-level UI stable to reference in tests
- Helps debugging complex UIs (inspect DOM → find component quickly)
- Keeps test code robust when UI copy or layout changes
- Avoids polluting low-level reusable components
- Ensures consistency across contributors

### Summary

| Component Type                      | Should Have `data-testid`? | Reason                                     |
| :---------------------------------- | :------------------------- | :----------------------------------------- |
| Panels (layers, properties, assets) | ✅ Yes                     | High-level, stable test targets            |
| Canvas / workspace / inspectors     | ✅ Yes                     | Core workflow surfaces                     |
| Dialogs / modals / pickers          | ✅ Yes                     | Conditional UI hard to select semantically |
| Buttons / Inputs / Icons            | ❌ No                      | Should use semantic queries                |
| UI primitives (Flex, Box, Stack)    | ❌ No                      | Too generic; pollutes DOM                  |
