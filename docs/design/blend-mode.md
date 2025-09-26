### Understanding and Working with Blend Modes

This guide explains how blend modes work in Grida, how paint stacks are composed, and when to use special layer behavior like Pass Through. It is written for designers who want practical outcomes, with just enough technical detail to reason about results.

---

## TL;DR

- Paints are stacked bottom → top. The last paint in the list is the top‑most visually.
- Each paint has its own blend mode and opacity. It blends over everything beneath it in the stack.
- The first paint’s blend mode applies against the background (not “nothing”), so Non‑Normal base blends like Multiply or Screen behave as expected.
- Layers have their own mode. Pass Through means the layer is not treated as a separate piece; its paints can blend with the background. Picking a specific layer blend (e.g., Multiply) treats the whole layer as one piece and then blends that with the background.
- In the UI, paint entries display top‑most first for convenience, but the engine always stores them in render order (bottom → top).

---

> If you only read one thing
>
> - Order matters: the top item wins if it’s fully opaque.
> - Start with Pass Through for layers; only switch the layer blend if you want the whole object to act as one piece.

## Behind the scenes (optional)

Grida follows a paint‑stack model:

- Bottom → Top order. The engine stores paints in render order where the first paint is drawn first; each subsequent paint is composited on top of the accumulated result. UIs may display the list top‑first for usability, but the renderer uses bottom‑to‑top.
- Per‑paint blend mode. Each paint has a `blend_mode` that describes how it combines with the pixels beneath.
- Base blend behavior. The first paint in the stack blends with the background using its `blend_mode` (not ignored). This lets “first paint = Multiply over background” produce a darkened base as expected.

Practical rule: the last paint wins on coverage when fully opaque. If the top paint’s alpha is 1.0 (255), everything beneath is hidden in regions it covers (regardless of their blend modes).

---

## Layer Blending vs. Paint Blending

Designer summary: Paint modes affect items inside the object; the layer mode decides how the whole object mixes with the background.

There are two related concepts:

1. Paint blend mode (per entry in the fills/strokes list)

- Affects how that paint combines over the paints already composed under it in the stack.

2. Layer blend mode (applies to the entire object/layer)

- If set to a specific blend (e.g., Normal, Multiply), the layer is treated as one piece and then blended with the background.
- If set to Pass Through, the layer is not treated as a separate piece; the inner paints directly affect and are affected by the background. This often yields more natural compositing when you intend internal paints to interact with the environment.

When in doubt: use Pass Through for typical object stacking so paint‑level blends interact with what’s underneath. Switch to a specific layer blend when you want the whole object to be flattened first (e.g., to avoid unexpected interplays with background).

---

## The Blend Modes (what they do, when to use)

Below, each mode has a plain‑English explanation and a design tip. No formulas.

> Note: Example thumbnails will be added later.

### Pass Through (Layer)

- What it does: The layer is not treated as a separate temporary layer; its paints/children blend directly with whatever is behind it.
- Behind the scenes: No extra temporary layer is created. Paint‑level modes are applied in place.
- Use when: You want the object’s internal paints to interact naturally with the background (typical for groups/containers). Default choice.

### Normal (SrcOver)

- What it does: The top color simply covers what’s underneath based on its opacity.
- Use when: You just want transparency/opacity without special mixing.

### Multiply

- What it does: Darkens by mixing colors; white has no effect, black makes things black.
- Use when: Shading, adding ink/texture, making colors interact naturally (e.g., shadows).

### Screen

- What it does: Lightens; basically the opposite of Multiply. Black does nothing, white pushes to white.
- Use when: Highlights, glows, adding light.

### Overlay

- What it does: A smart mix of Multiply and Screen that boosts contrast—darker areas get darker, lighter areas get lighter.
- Use when: Increasing punch/contrast without fully losing midtones.

### Darken / Lighten

- Darken: Picks whichever is darker, replacing lighter pixels.
- Lighten: Picks whichever is lighter, replacing darker pixels.
- Use when: You want strict min/max selection for compositing decisions.

### Color Dodge / Color Burn

- What it does: Dodge brightens aggressively (think spotlight); Burn darkens aggressively (think deep shadows).
- Use when: Strong highlight (Dodge) or shadow (Burn) effects with vivid results.

### Hard Light / Soft Light

- Hard Light: Punchy lighting—adds contrast and pop.
- Soft Light: Gentle lighting—adds subtle sheen and mood.
- Use when: You want lighting effects that feel directional (Hard) or subtle (Soft).

### Difference / Exclusion

- Difference: Creates a high‑contrast, inverted look based on how different the colors are.
- Exclusion: A softer, less harsh version of Difference.
- Use when: Special effects, edge imaging, or creative compositing.

### Hue / Saturation / Color / Luminosity

- These modes mix properties from the two colors:
  - Hue: Use the top color’s hue, keep the base’s lightness/detail.
  - Saturation: Use the top color’s saturation intensity, keep the base’s color structure.
  - Color: Great for colorizing—use the top color’s hue+saturation but keep the base’s lightness.
  - Luminosity: Use the top color’s lightness while preserving the base’s hue/saturation.
- Use when: Re‑tinting, colorizing grayscale, or preserving lightness while changing color.

---

## Opacity and Order Matter

- Opacity compounds with blending. A 50% Screen on top may be subtler than expected; try adjusting both opacity and mode.
- Order is crucial. Multiply on top of Screen is different from Screen on top of Multiply. If results are “inside out,” check the paint order.
- A fully opaque top paint hides everything below in covered regions, regardless of blend. To mix, keep some transparency or choose a non‑covering mode appropriate for your goal.

---

## UI vs Engine Ordering

- UI displays paints with the top‑most first for easier editing (what you “see” first is what’s on top).
- The engine stores paints bottom → top. When you add a new paint, it’s appended to the end of the stack (becoming the new top layer).
- If your visual result differs from expectations, confirm both paint order and blend/opacity.

---

## Pass Through (Layer Compositing)

Pass Through is a layer‑level setting that determines whether a layer is isolated before blending with the backdrop.

- Pass Through: The layer is not isolated. Its paints (and child elements) blend directly with whatever is behind the layer. This is the default for group‑like constructs and is analogous to “isolation: auto.”
- Specific Layer Blend (e.g., Normal, Multiply, Overlay): The layer is isolated (flattened) first, then that flattened result blends with the backdrop using the chosen mode. This resembles “isolation: isolate.”

When to use Pass Through

- You want internal paints to interact with background content in a natural, non‑flattened way.
- You’re building effects that depend on live interplay between this object and what’s underneath.

When to use a specific layer blend

- You want to “bake” multiple internal paints together first, then treat the result as one unit (e.g., to avoid unintentional interactions with background imagery).
- You need a predictable, portable output that behaves like a single bitmap layer.

Tip: You can combine both concepts—use per‑paint blends internally, and then choose whether the whole object is Pass Through or blended as a unit.

---

## Example Scenarios (placeholders for demos)

> Replace the placeholder text with demo images later.

1. Single Solid

   - Normal at 78% opacity. Shows simple transparency.
   - [demo image placeholder]

2. Single Linear Gradient (Normal)

   - Red → Blue, fully opaque.
   - [demo image placeholder]

3. Solid + Solid (Multiply)

   - Base: Red (Normal 39%), Top: Blue (Multiply 39%). Produces lavender.
   - [demo image placeholder]

4. Solid + Linear (Screen)

   - Base: Yellow, Top: Magenta→Cyan (Screen 60%).
   - [demo image placeholder]

5. Linear + Linear (Overlay)

   - Two different gradients layered; Overlay boosts contrast.
   - [demo image placeholder]

6. Linear + Radial (Soft Light)

   - Subtle central highlight over a linear base.
   - [demo image placeholder]

7. Image + Solid (Multiply)

   - Darken a checker image with a semi‑opaque solid.
   - [demo image placeholder]

8. Image + Radial (Hard Light)

   - Strong center glow over an image.
   - [demo image placeholder]

9. All Mixed (Various Blends)
   - Solid + Linear + Radial + Image; demonstrates complex stacks.
   - [demo image placeholder]

---

## Tips, Pitfalls, and Debugging

- If a result looks reversed, check paint order. The top entry visually dominates.
- If everything looks “too flat,” ensure the layer is Pass Through (so inner paints can interact with the background) instead of an isolated layer blend.
- If colors clip or blow out with Dodge/Burn, ease opacity or tweak base brightness.
- For colorization, try Color/Luminosity modes with moderate opacity for smoother results.

---

## FAQ

Q: Why doesn’t an opaque top paint show what’s underneath?

- Because it fully covers those pixels. Use transparency or an appropriate blend to see through.

Q: Why do Multiply and Screen depend on order?

- They’re not commutative with alpha and typical stacks. The top paint is blended last, so order matters.

Q: Pass Through vs setting the layer to Normal?

- Pass Through: no isolation; inner paints can interact with backdrop. Layer set to (e.g.) Normal: isolates first, then blends the flattened result with the background. Different control for different goals.

---

If something looks off, check paint order, per‑paint opacity, and whether the layer is Pass Through or isolated with a specific layer blend.
