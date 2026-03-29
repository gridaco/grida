---
title: Tray
description: Organize your canvas with Trays — lightweight containers that group frames without affecting layout or exports.
format: md
---

# Tray

A Tray is a lightweight organizational container for grouping frames and other elements on your canvas. Things sit _on_ a Tray, and the Tray itself doesn't affect how they behave.

<!-- TODO: add screenshot (960x960 WebP, cropped to a Tray containing a few frames) -->

## When to Use a Tray

Use Trays to organize your canvas when you have many frames. For example:

- Group all login/signup screens under an "Authentication" Tray
- Keep dashboard views together in a "Dashboard" Tray
- Separate mobile and desktop variants into their own Trays

## Creating a Tray

Press <kbd>Shift</kbd>+<kbd>F</kbd> to enter Tray insertion mode, then:

- **Click** on the canvas to place a Tray at that point.
- **Click and drag** to draw a Tray. Any existing frames inside the drawn area are automatically moved into the new Tray.

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

- Trays live at the **top level** of your scene, or inside other Trays.
- You **cannot** put a Tray inside a Container or Group.
- You **can** put anything inside a Tray: Containers, Groups, shapes, text, other Trays.

## Default Appearance

New Trays are created with:

- White background fill
- Subtle border (solid black at 10% opacity, 1 px inside stroke)
- Corner radius of 2 px

You can change fills, strokes, and corner radius in the inspector, just like a Container.

## Keyboard Shortcut

| Action      | Shortcut                      |
| ----------- | ----------------------------- |
| Insert Tray | <kbd>Shift</kbd>+<kbd>F</kbd> |

This follows the pattern: <kbd>F</kbd> = Frame (Container), <kbd>Shift</kbd>+<kbd>F</kbd> = Tray.

## Figma Compatibility

Trays map directly to Figma **Sections**. When you import a Figma file, Sections become Trays.
