---
title: Declare flag
id: "--declare"
locale: en
locales:
  - en
stage:
  - draft
  - staging
  - proposal
  - experimental
---

# `--declare` Flag

**Accepted keys**

- `--declare`

## Syntax

```ts
`--declare${"="typeof boolean}`
```

**Example**

```
--declare

--declare=true
--declare=false

--declare=yes
--declare=no

----declare
```

## When to use

Baes on this tsx react example - assuming the input design has a deep-depthed children structure, you can specify the `--declare` flag to split one of the child as a in-module component and transformt the module tree.

In result,

```tsx
import React from "react";

function Root() {
  return (
    <div>
      <div>
        <div>
          <div>
            <div>complex</div>
          </div>
        </div>
      </div>
      <div>
        <div>
          <div>
            <div>complex</div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

The above complex tree would be splitted with in-module component, resulting below.

```tsx
import React from "react";

function Root() {
  return (
    <div>
      <ComplexDeclared1 />
      <ComplexDeclared2 />
    </div>
  );
}

const ComplexDeclared1 = () => {
  return (
    <div>
      <div>
        <div>
          <div>complex</div>
        </div>
      </div>
    </div>
  );
};

const ComplexDeclared2 = () => {
  return (
    <div>
      <div>
        <div>
          <div>complex</div>
        </div>
      </div>
    </div>
  );
};
```

This may make the lines longer, but there is no argue that this makes the code more readable and maintainable.

## Behavior

**Element**
When applied, this will have no impact on its scoped element tree.

**Composition**
When applied, this will transform the element tree to be a declaration, e.g. a `const` or `function` on React, a `Widget Class` on Flutter, which splitting ui tree by its interest and scope.

## See Also

- nothing to see within
