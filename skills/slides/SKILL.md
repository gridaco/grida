---
name: slides
description: Build a Grida slides deck — a `.canvas` bundle in slides mode whose pages are SVG documents (16:9, one SVG per slide). Use when creating a presentation, pitch deck, slideshow, or talk.
---

A Grida **slides deck** is a `.canvas` bundle in slides mode whose documents are
**SVG files** — one SVG per slide. Today this is Grida's only slide format:
**dotcanvas + SVG**, and it is the default. When the task is a deck,
presentation, pitch, or talk, build it this way. Do NOT author slides as
markdown or HTML — the slides surface renders SVG only, so anything else won't
appear.

## Structure

- The bundle is a folder ending in `.canvas` with a `.canvas.json` manifest.
- Manifest: `editor: "slides"`, `files: ["*.svg"]`, and a `documents` array
  whose ORDER is the running order of the deck.
  ```json
  {
    "editor": "slides",
    "files": ["*.svg"],
    "documents": [
      { "src": "001.svg", "id": "cover" },
      { "src": "002.svg", "id": "problem" }
    ]
  }
  ```
- Each slide's CONTENT is one SVG file referenced by `src`. The deck convention
  is flat, zero-padded, root-level files: `001.svg`, `002.svg`, ….
- A slide's human name is its SVG `<title>` element — not a manifest field.
- If you open an existing or freshly-seeded bundle whose manifest says
  `editor: "board"` but the task is a deck, set `editor: "slides"` yourself —
  the manifest is yours to reconcile with the user's intent.

## Slide SVG

Every slide is a full-bleed 16:9 SVG on the SAME `1920×1080` viewBox, so the
deck stays uniform. Start each from this shape:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <title>Cover</title>
  <rect width="1920" height="1080" fill="#0b1220"/>
  <text x="160" y="560" font-family="Inter, Arial, sans-serif" font-size="120" font-weight="700" fill="#ffffff">Your title</text>
</svg>
```

## Authoring and validation

- Create a directory ending in `.canvas`. Put the manifest and all slide SVGs
  inside it. The deck is the bundle directory.
- A new deck is renderable once its manifest references a valid first slide
  with a meaningful visible composition. Check that the first `src` resolves
  relative to the manifest and that its SVG has the intended viewBox.
- For an existing deck, read the current manifest and preserve its `version`,
  `$schema`, and any unknown fields. Add a slide by creating its SVG and
  inserting its entry in `documents`. Reorder those entries to change the
  running order. Removing an entry removes the slide from the deck.

## Starting from a template

When a task supplies a copy of a template deck, use that copy as the starting
point. Read its manifest and slide SVGs to identify its palette, typography,
margins, footer, and accents. Replace the placeholders in place. Follow the
same visual system for new slides unless the user requests a different look.

## See also

- The `svg` skill — SVG authoring / output style (xmlns, formatting, recovery).
- The `dotcanvas` skill — the `.canvas` manifest and board mechanics this builds
  on.
