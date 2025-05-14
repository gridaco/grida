# @grida/tokens

A utility package for handling property access expressions, template expressions, and object path resolution in Grida's codebase.

## Overview

This package provides utilities for:

- Property access expression handling
- Template expression rendering
- Object path resolution with scoped identifiers
- Deep object access and selection

## Installation

```bash
npm install @grida/tokens
# or
yarn add @grida/tokens
# or
pnpm add @grida/tokens
```

## Usage

### Property Access Expressions

```typescript
import { factory } from "@grida/tokens";

// Create a property access expression
const propertyAccess = factory.createPropertyAccessExpression(["props", "a"]);

// Get dependencies from the expression
const deps =
  factory.getStringValueExpressionAccessIdentifiersDependencyArray(
    propertyAccess
  );
// Returns: [["props", "a"]]
```

### Template Expressions

```typescript
import { factory } from "@grida/tokens";

// Create a template expression
const template = factory.createTemplateExpression([
  { kind: "StringLiteral", text: "Hi " },
  { kind: "Identifier", name: "name" },
]);

// Get dependencies from the template
const deps =
  factory.getStringValueExpressionAccessIdentifiersDependencyArray(template);
// Returns: [["name"]]
```

### Object Access and Path Resolution

```typescript
import { access } from "@grida/tokens";

const context = {
  scopedIdentifiers: {
    identifier: ["b", "c"],
    nested: ["identifier", "d"],
  },
};

// Resolve a path with context
const path = ["identifier", "d"];
const resolvedPath = access.resolvePath(path, context);
// Returns: ["b", "c", "d"]

// Access object values with context
const obj = { b: { c: { d: "value" } } };
const result = access.access(obj, path, context);
// Returns: "value"
```

## Features

- Property access expression creation and dependency analysis
- Template expression handling with string literals and identifiers
- Object path resolution with scoped identifier context
- Deep object access and selection utilities
- Recursive rendering of nested structures

## API

The package exports several modules:

- `factory`: Utilities for creating and analyzing expressions
- `render`: Template and expression rendering utilities
- `access`: Object path resolution and access utilities

## License

MIT
