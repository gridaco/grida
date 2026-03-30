---
title: "HTML Element Mapping"
format: md
tags:
  - internal
  - wg
  - format
  - html
---

# HTML Element Mapping

How HTML elements map to Grida IR nodes. For CSS property mapping, see [css.md](./css.md).

## Structural / Sectioning

| Element     | Grida IR Node         | Status | Notes                                        |
| ----------- | --------------------- | ------ | -------------------------------------------- |
| `<html>`    | Container             | ✅     | Always emitted as root container             |
| `<body>`    | Container             | ✅     | Always emitted as root container             |
| `<div>`     | Container / Rectangle | ✅     | Container if has children, Rectangle if leaf |
| `<section>` | Container / Rectangle | ✅     | Same as `<div>`                              |
| `<article>` | Container / Rectangle | ✅     | Same as `<div>`                              |
| `<nav>`     | Container / Rectangle | ✅     | Same as `<div>`                              |
| `<header>`  | Container / Rectangle | ✅     | Same as `<div>`                              |
| `<footer>`  | Container / Rectangle | ✅     | Same as `<div>`                              |
| `<main>`    | Container / Rectangle | ✅     | Same as `<div>`                              |
| `<aside>`   | Container / Rectangle | ✅     | Same as `<div>`                              |

## Text / Inline

| Element        | Grida IR Node        | Status | Notes                                                      |
| -------------- | -------------------- | ------ | ---------------------------------------------------------- |
| `<p>`          | Container + TextSpan | ✅     | Text content becomes TextSpan children                     |
| `<h1>`..`<h6>` | Container + TextSpan | ✅     | Text content becomes TextSpan children                     |
| `<span>`       | Container + TextSpan | ✅     | Text content becomes TextSpan children                     |
| `<strong>`     | Container + TextSpan | ✅     | Text content becomes TextSpan children                     |
| `<em>`         | Container + TextSpan | ✅     | Text content becomes TextSpan children                     |
| `<a>`          | Container + TextSpan | ✅     | Text content becomes TextSpan children; href not preserved |
| `<br>`         | (whitespace)         | ⚠️     | Not explicitly handled; collapses into surrounding text    |
| `<sup>`        | --                   | ❌     | No vertical-align / baseline offset in IR                  |
| `<sub>`        | --                   | ❌     | No vertical-align / baseline offset in IR                  |

## Media / Embedded

| Element          | Grida IR Node | Status | Notes                                   |
| ---------------- | ------------- | ------ | --------------------------------------- |
| `<img>`          | ImageNodeRec  | ⚠️     | Node type exists but `src` not wired    |
| `<svg>` (inline) | --            | 🔮     | Could delegate to `crate::svg` pipeline |
| `<video>`        | --            | ❌     | No media IR                             |
| `<audio>`        | --            | ❌     | No media IR                             |
| `<canvas>`       | --            | ❌     | No raster canvas IR                     |
| `<iframe>`       | --            | ❌     | No embedded document IR                 |

## Lists

| Element | Grida IR Node | Status | Notes                      |
| ------- | ------------- | ------ | -------------------------- |
| `<ul>`  | --            | ❌     | No list marker generation  |
| `<ol>`  | --            | ❌     | No list marker generation  |
| `<li>`  | --            | ❌     | No list marker generation  |
| `<dl>`  | --            | ❌     | No definition list support |
| `<dt>`  | --            | ❌     | No definition list support |
| `<dd>`  | --            | ❌     | No definition list support |

## Table

| Element   | Grida IR Node | Status | Notes              |
| --------- | ------------- | ------ | ------------------ |
| `<table>` | --            | ❌     | No table layout IR |
| `<tr>`    | --            | ❌     | No table layout IR |
| `<td>`    | --            | ❌     | No table layout IR |
| `<th>`    | --            | ❌     | No table layout IR |

## Form Controls

| Element      | Grida IR Node | Status | Notes              |
| ------------ | ------------- | ------ | ------------------ |
| `<input>`    | --            | ❌     | No form control IR |
| `<button>`   | --            | ❌     | No form control IR |
| `<select>`   | --            | ❌     | No form control IR |
| `<textarea>` | --            | ❌     | No form control IR |

## Non-Visual / Metadata

| Element    | Grida IR Node | Status | Notes                                        |
| ---------- | ------------- | ------ | -------------------------------------------- |
| `<style>`  | (cascade)     | ✅     | Parsed by Stylo cascade; not emitted as node |
| `<head>`   | --            | ✅     | Skipped (no visual output)                   |
| `<meta>`   | --            | ✅     | Skipped                                      |
| `<link>`   | --            | ✅     | Skipped                                      |
| `<script>` | --            | ✅     | Skipped                                      |

## Display Mode Handling

How computed `display` values affect node construction.

| Display Value  | Grida IR Behavior                          | Status | Notes                       |
| -------------- | ------------------------------------------ | ------ | --------------------------- |
| `none`         | Element skipped                            | ✅     | Node not emitted            |
| `flex`         | Container with `LayoutMode::Flex`          | ✅     | Full flex mapping           |
| `block`        | Container with `LayoutMode::Flex` (column) | ⚠️     | Approximated as flex column |
| `inline`       | (treated as block)                         | ⚠️     | No true inline layout       |
| `grid`         | --                                         | ❌     | No grid IR                  |
| `inline-flex`  | --                                         | ❌     | No inline layout model      |
| `inline-block` | --                                         | ❌     | No inline layout model      |
