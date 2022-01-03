---
title: As Wrap flag
description: Add Wrapping compatibility to your static design.
id: "--as-wrap"
locale: en
locales:
  - en
  - ko
stage:
  - production
  - staging
  - experimental
---

# `--as-wrap` - flexbox / Wrap / [Reflect UI](https://reflect-ui.com) Wrap Widget Indication Flag

(describing based on figma) Since no major design tool supports wrapping behaviour of the layout, we can use --as-wrap flag to indicate nested autolayout (e.g. `row([col([row, row, row]), col([row, row, row])])`) as a `wrap(item, item, item, item, item, item)`

**Accepted keys**

- `--as-wrap`

## Syntax

```ts
`--as-wrap${"="typeof boolean}`
`--as=wrap` // under development (do not use)
```

## Examples

```
--as-wrap

--as-wrap=true
--as-wrap=false

--as-wrap=yes
--as-wrap=no

----as-wrap
```

## Behavior

**Element**

- Web - On web, the parent will have [`flex-wrap`](https://developer.mozilla.org/en-US/docs/Web/CSS/flex-wrap) property. (`flex-wrap: wrap`)
- Flutter - On Flutter, the parent will be Tokenized as [`Wrap`](https://api.flutter.dev/flutter/widgets/Wrap-class.html) Widget.

_Summing up._

- flexbox on css
- Wrap on flutter
- Wrap with reflect-ui

**Transformed Hierarchy**
When Wrap being composed, for design, on the item's perspective, it has a 2 parent including the root.
But this will be transformed when generated to code. The item must be placed directly under the root Wrap.

As a result, the hierarchy will be transformed as below.

`row([col([row, row, row]), col([row, row, row])])`) as a `wrap(item, item, item, item, item, item)`

By this, the "col, col" does not impact any part of the final output code.

For example, if the design is composed as below, the "red" color property held by row 3 will not be read, be interpreted or be applied to the final output code.
This is not a bug, It's technically impossible. (Reason: mentioned above)

```
- autolayout root frame (column) 🔵
  - row 1 (autolayout) ⚪️
  - row 2 (autolayout) ⚪️
  - row 3 (autolayout) 🔴
  - row 4 (autolayout) ⚪️

🔵 = blue
🔴 = red
⚪️ = transparent (no bg)
```

## See also

- No related documents
