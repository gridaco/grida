---
title: Figma Boolean operation and how to handle it.
version: 0.1.0
revision: 1
---

# Figma Boolean operation and how to handle it.

> **Theoretically, svg support for boolean operation is possible.** But, we don't support this on remote version of design to code.

Boolean operation is most used when making a vector shape combining rects / circles / and poligons, thus it can also be used with any other node such as image. So the most efficient way to support boolean operation is to making everything boolean as a image snapshot, embeding it as a artwork.

On plugin version, we would still interpret this as a sort of a artwork, but in a svg data form.

https://www.figma.com/plugin-docs/api/BooleanOperationNode/

## Limitations

### Exceptional Constraint behavior of `BooleanOperation`

Boolean operation is a node contains a children with a operation type contained. The layout of Boolop is same as Group. The container itself does not have a constraints, only its children has one. The problem begins here. Designers often use Group to make something behave like a stack, but it can also have a mixed constraints. In this case, for group, we can simply break the group and make each children relative to original container(group)'s parent.

But for BooleanOperation, it is purely for representing a graphical resource, so we don't support mixed constraints. it will fallback to most occurrencing constraint or left top by default.

**Related**

- Lint: Mixed constraints for BooleanOperation is not allowed. (align constraints or use Group / Frame instead)

## TL;DR Falls back to artwork

- svg in plugin
- png in remote
