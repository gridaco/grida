---
title: Tray
format: md
---

# Tray

A Tray is a lightweight organizational container for grouping frames and other elements on your canvas. Think of it as a labeled surface — things sit _on_ a Tray, and the Tray itself doesn't affect how they behave.

## When to Use a Tray

Use Trays to organize your canvas when you have many frames. For example:

- Group all login/signup screens under an "Authentication" Tray
- Keep dashboard views together in a "Dashboard" Tray
- Separate mobile and desktop variants into their own Trays

## Creating a Tray

| Method                    | How                                                                  |
| ------------------------- | -------------------------------------------------------------------- |
| Keyboard shortcut         | Press **Shift + F**, then click and drag on the canvas               |
| Draw over existing frames | The Tray will automatically contain any frames inside the drawn area |

## How Trays Differ from Containers (Frames)

|                | Tray                              | Container (Frame)       |
| -------------- | --------------------------------- | ----------------------- |
| **Purpose**    | Organize your canvas              | Structure your design   |
| **Layout**     | None — children are freely placed | Auto-layout, flex, flow |
| **Clipping**   | No — children can overflow        | Yes — clips content     |
| **Effects**    | None                              | Shadows, blurs, etc.    |
| **In exports** | Not visible                       | Rendered                |
| **Nesting**    | Only inside Scene or other Trays  | Anywhere                |

## Nesting Rules

- Trays live at the **top level** of your scene, or inside other Trays
- You **cannot** put a Tray inside a Container or Group
- You **can** put anything inside a Tray: Containers, Groups, shapes, text, other Trays

## Default Appearance

New Trays are created with:

- White background fill
- Subtle border (black at 10% opacity)
- Slightly rounded corners

You can change fills, strokes, and corner radius in the inspector, just like a Container.

## Keyboard Shortcut

| Action      | Shortcut      |
| ----------- | ------------- |
| Insert Tray | **Shift + F** |

This follows the pattern: **F** = Frame (Container), **Shift + F** = Tray.

## Figma Compatibility

Trays map directly to Figma **Sections**. When you import a Figma file, Sections become Trays. The round-trip is clean — Trays export back as Sections.
