## `fixtures/test-html/L0`

This directory holds the baseline HTML fixtures that mirror the `test-svg/L0` coverage but for DOM rendering. Each file captures a narrowly scoped behavior (structure, text, painting, layout) with self-contained markup so parsers and renderers can exercise specific branches without relying on external assets.

### Authoring Rules

1. `<style>` blocks in the document head are allowed and encouraged for readability. Keep them minimal and scoped to the current fixture.
2. Inline `style=""` attributes are also allowed when it keeps the document shorter than introducing an extra class.
3. Anchor tags are allowed to point to any URL because they don’t trigger fetches during render-only tests, but avoid `<link>` tags that would load external stylesheets or fonts.
4. `<script>` tags (inline or external) are disallowed. L0 fixtures should remain static to guarantee deterministic output.

### Intent

- Provide deterministic, image-free fixtures that highlight individual HTML/CSS concepts.
- Use dark backgrounds and modern fonts for visual parity with existing SVG fixtures.
- Keep markup minimal: one `<html>` document per file, limited nesting, and no external network requirements.

Please follow these conventions when adding new fixtures under L0 so higher-level suites can rely on consistent assumptions.
