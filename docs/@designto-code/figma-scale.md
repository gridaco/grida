---
title: Figma scale
version: 0.1.0
revision: 1
---

# Figma scale

> This document is incomplete.

How Figma scale works - Figma SCALE is a representation of responsive scaling (not a static scaling)

- https://css-tricks.com/scaled-proportional-blocks-with-css-and-javascript/

## Transform?

While figma and other major design tools has both transform value, and explicit rotation value (which can be calculated from transform value), The intuitive way to represent a rotation value is by using a `Rotation` token. Overall all figma node properties, the only two property that has impact to final transform (based on css) is `scale` and `rotation`.

But those two value comes from different property, one from `node#roation` (or `node#relativeTransform`), one from `node#constraint#scale` - a dynamic `scale` representor.

For this reason, while we tokenize the design, we use `Rotation` token rather than `Transform` token.

e.g.

```typescript
// node example (this is a abstract example, the syntax may differ.)
// [scale only example]
{
    rotation: 0,
    constraints: "SCALE"
}
// in this case, only scale property will be assigned to final transform value.
// Step 1 tokenization
Scale(
  scale: aspect_ratio, // a dynamically calculated value to make scale responsive
  child: node
)
// Step 2 merge transform
Transform(
  scale: matrix4, // a scale value that is represented as matrix 4
  child: node
)

// ------------------------------------------
// [rotation only example]
{
    rotation: 30,
    constraints: "MIN"
}
// in this case, only scale property will be assigned to final transform value.
// Step 1 tokenization
Rotation(
  rotation: 30,
  child: node
)

// Step 2 merge transform
Transform(
  rotation: 30,
  child: node
)

// ------------------------------------------
// [rotation + scale example]
{
    rotation: 30,
    constraints: "SCALE"
}

// Step 1 tokenization
Transforms(
	transforms: [
    Rotation(
      rotation: 30
    ),
    Scale(
	    scale: aspect_ratio, // a dynamically calculated value to make scale responsive
	  )
  ]
	child: node
)

// Step 2 merge transform
Transform(
  rotation: 30,
  scale: matrix4,
  child: node
)
```

## Read Also

- [figma rotation](./figma-rotation.md)
