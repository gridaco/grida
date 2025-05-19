# canvas selection diffing (mixing)

This module provides a way to control multiple selections on a canvas.

When there are objects with various types and properties. This module provides a merged properties and callbacks for the control of the selection.

## Installation

```bash
pnpm add @grida/mixed-properties
```

## Specification

Example input data.

```json
[
  {
    "id": "a",
    "type": "rect",
    "locked": false,
    "x": 10,
    "y": 10,
    "width": 100,
    "height": 100,
    "opacity": 1,
    "fill": "red",
    "stroke": "black",
    "strokeWidth": 2
  },
  {
    "id": "b",
    "type": "circle",
    "locked": false,
    "cx": 50,
    "cy": 50,
    "r": 50,
    "opacity": 1,
    "fill": "blue",
    "stroke": "black",
    "strokeWidth": 2
  },
  {
    "id": "c",
    "type": "text",
    "locked": false,
    "x": 10,
    "y": 10,
    "opacity": 0,
    "text": "Hello World",
    "fill": "black",
    "font": "Arial"
  }
]
```

- each object needs a unique identifier.
- certain property can be present in one object and not in another.
- certain property can be present in all objects and have identical values.
- certain property can be present in all objects and have different values.
- certain property can be an array.

The above input shall output something like below.

```json
{
  "locked": {
    "type": "boolean",
    "value": false,
    "mixed": false,
    "partial": false,
    "ids": ["a", "b", "c"]
  },
  "x": {
    "type": "number",
    "value": 10,
    "mixed": false,
    "partial": true,
    "ids": ["a", "c"]
  },
  "y": {
    "type": "number",
    "value": 10,
    "mixed": false,
    "partial": true,
    "ids": ["a", "c"]
  },
  "cx": {
    "type": "number",
    "value": 50,
    "mixed": false,
    "partial": true,
    "ids": ["b"]
  },
  "cy": {
    "type": "number",
    "value": 50,
    "mixed": false,
    "partial": true,
    "ids": ["b"]
  },
  "width": {
    "type": "number",
    "value": 100,
    "mixed": false,
    "partial": true,
    "ids": ["a"]
  },
  "height": {
    "type": "number",
    "value": 100,
    "mixed": false,
    "partial": true,
    "ids": ["a"]
  },
  "opacity": {
    "type": "number",
    "value": null,
    "mixed": true,
    "partial": false,
    "ids": ["a", "b", "c"]
  },
  "fill": {
    "type": "string",
    "value": null,
    "mixed": true,
    "partial": false,
    "ids": ["a", "b", "c"]
  },
  "stroke": {
    "type": "string",
    "value": "black",
    "mixed": false,
    "partial": true,
    "ids": ["a", "b"]
  },
  "strokeWidth": {
    "type": "number",
    "value": 2,
    "mixed": false,
    "partial": true,
    "ids": ["a", "b"]
  },
  "text": {
    "type": "string",
    "value": "Hello World",
    "mixed": false,
    "partial": true,
    "ids": ["c"]
  },
  "font": {
    "type": "string",
    "value": "Arial",
    "mixed": false,
    "partial": true,
    "ids": ["c"]
  }
}
```

**Result**

```ts
type MixedProperty = {
  /**
   * type of the property.
   *
   * Does not support array or object.
   */
  type: "number" | "string" | "boolean";

  /**
   * value of the property. if mixed, then value is null.
   */
  value: number | string | boolean | null;

  /**
   * if the value is different in some objects.
   */
  mixed: boolean;

  /**
   * if the value is available in some objects but not in all.
   */
  partial: boolean;

  /**
   * list of object ids that have this property.
   */
  ids: string[];
};
```

## Usage

```ts
import { mixed } from "@grida/mixed-properties";

const mixedProperties = mixed(
  [
    {
      id: "a",
      type: "rect",
      locked: false,
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      opacity: 1,
      fill: "red",
      stroke: "black",
      strokeWidth: 2,
    },
    {
      id: "b",
      type: "circle",
      locked: false,
      cx: 50,
      cy: 50,
      r: 50,
      opacity: 1,
      fill: "blue",
      stroke: "black",
      strokeWidth: 2,
    },
  ],
  {
    idKey: "id",
    ignoredKeys: ["id", "type"],
  }
);

const { x } = properties;

x.value; // 10
x.mixed; // false
x.partial; // true
x.ids; // ["a"]

// updating the value of x
x.ids.forEach((id) => {
  myUpdateFn(id, "x", 20);
});
```
