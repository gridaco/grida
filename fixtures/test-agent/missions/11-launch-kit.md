# Launch kit from a brief

A long creative turn: from a client brief and an approved copy deck to a
consistent set of brand, social and web assets, verified by the agent itself.
A capable model is expected to spend well over ten minutes on it.

## Request

Read `brief.md` and `copy.md`, then build the complete spring launch kit for Hearth & Glaze in a new `kit/` folder. Work through it end to end without stopping to ask me; where the brief leaves a choice open, decide and note it in the handoff.

1. **Foundations.** `kit/tokens.json` and `kit/tokens.css` (custom properties) with a palette of 6–8 colours drawn from the glazes in the brief (each with a name, hex value and role), a type scale using system font stacks only, a spacing scale and corner radii. The two files must agree.
2. **Logo.** In `kit/logo/`: a primary lockup, a compact mark that still reads at 48 px, and a one-colour version. Hand-written SVG only: a `viewBox`, a `<title>`, no embedded raster images, no external references, text converted to shapes or set in a system font stack.
3. **Social set.** In `kit/social/`: six Instagram feed posts at 1080×1350, one per product in the copy deck, all on one shared layout grid so they read as a set. Each shows the product name, price and hook exactly as written in the copy deck, plus the compact mark. Add one story at 1080×1920 announcing the launch (subscriber day and launch day) and one email header at 1200×600. Flat illustration or type and colour only.
4. **Landing page.** `kit/site/index.html` and `kit/site/styles.css`, using only the tokens: headline, the six products with prices and hooks, both launch dates, and a signup form that needs no JavaScript. It must work at 375 px and 1280 px wide.
5. **Newsletter.** `kit/email/launch.html`: the subscriber email for Friday 13 March, built the way email clients need it (table layout, inline styles, no external assets, 600 px wide), with the headline, all six products and a plain-text version in `kit/email/launch.txt`.
6. **Market cards.** In `kit/print/`: one price card per product at A6 (105 × 148 mm, `width="105mm"` and `height="148mm"`) with a 3 mm bleed and crop marks, for the studio's weekend market table.
7. **Review sheet.** `kit/index.html` showing every asset at a glance with its file name and dimensions, so the client can review the whole kit on one page.
8. **Self-check.** Write `kit/check.mjs` (Node, built-in modules only) that fails with a clear message unless: every SVG is well-formed and has exactly its required dimensions; every colour used in the SVGs, the site and the email is in the palette; nothing references an external URL, web font or raster image; `tokens.css` and `tokens.json` agree; every product name, price and hook in the social posts, site, email and market cards matches the copy deck exactly; and every text colour on its background meets WCAG AA (4.5:1, or 3:1 for text 24 px and larger). Run it, fix everything it reports, and repeat until it passes.
9. **Look at it.** If this machine can render SVG to PNG, render previews of the posts, story and header and look at them. Fix anything clipped, overlapping, off-grid or unbalanced. If it cannot, say what you tried.
10. **Handoff.** `kit/HANDOFF.md`: what is in the kit, the palette with roles and contrast pairs, how to run the check, and the decisions the client should confirm.

## Criteria

- Every listed file exists; the self-check exists, exercises each rule, and passes.
- The social posts share one grid, use the copy deck verbatim and stay inside their frames.
- The tokens are the single source: no stray colours in SVG or CSS.
- The site works without JavaScript at both widths.
- The handoff is honest about what was and was not verified, including visual review.
- The turn runs to completion without asking, looping or giving up early.

## Run

```json
{
  "seed": "studio",
  "preset": "default",
  "deadline_minutes": 45,
  "checks": [
    "exists kit/tokens.json",
    "exists kit/tokens.css",
    "exists kit/site/index.html",
    "exists kit/site/styles.css",
    "exists kit/index.html",
    "exists kit/HANDOFF.md",
    "files kit/logo .svg 3",
    "files kit/social .svg 8",
    "script kit/check.mjs",
    "contains kit/site/index.html Holds a morning, not a bucket.",
    "contains kit/social Pours without the dribble. We checked.",
    "unchanged brief.md",
    "unchanged copy.md",
    "exists kit/email/launch.html",
    "exists kit/email/launch.txt",
    "files kit/print .svg 6",
    "contains kit/email/launch.txt Four cups, one lid that stays put."
  ],
  "prompts": [
    "Read `brief.md` and `copy.md`, then build the complete spring launch kit for Hearth & Glaze in a new `kit/` folder. Work through it end to end without stopping to ask me; where the brief leaves a choice open, decide and note it in the handoff.\n\n1. Foundations. `kit/tokens.json` and `kit/tokens.css` (custom properties) with a palette of 6–8 colours drawn from the glazes in the brief (each with a name, hex value and role), a type scale using system font stacks only, a spacing scale and corner radii. The two files must agree.\n2. Logo. In `kit/logo/`: a primary lockup, a compact mark that still reads at 48 px, and a one-colour version. Hand-written SVG only: a `viewBox`, a `<title>`, no embedded raster images, no external references, text converted to shapes or set in a system font stack.\n3. Social set. In `kit/social/`: six Instagram feed posts at 1080×1350, one per product in the copy deck, all on one shared layout grid so they read as a set. Each shows the product name, price and hook exactly as written in the copy deck, plus the compact mark. Add one story at 1080×1920 announcing the launch (subscriber day and launch day) and one email header at 1200×600. Flat illustration or type and colour only.\n4. Landing page. `kit/site/index.html` and `kit/site/styles.css`, using only the tokens: headline, the six products with prices and hooks, both launch dates, and a signup form that needs no JavaScript. It must work at 375 px and 1280 px wide.\n5. Newsletter. `kit/email/launch.html`: the subscriber email for Friday 13 March, built the way email clients need it (table layout, inline styles, no external assets, 600 px wide), with the headline, all six products and a plain-text version in `kit/email/launch.txt`.\n6. Market cards. In `kit/print/`: one price card per product at A6 (105 × 148 mm, `width=\"105mm\"` and `height=\"148mm\"`) with a 3 mm bleed and crop marks, for the studio's weekend market table.\n7. Review sheet. `kit/index.html` showing every asset at a glance with its file name and dimensions, so the client can review the whole kit on one page.\n8. Self-check. Write `kit/check.mjs` (Node, built-in modules only) that fails with a clear message unless: every SVG is well-formed and has exactly its required dimensions; every colour used in the SVGs, the site and the email is in the palette; nothing references an external URL, web font or raster image; `tokens.css` and `tokens.json` agree; every product name, price and hook in the social posts, site, email and market cards matches the copy deck exactly; and every text colour on its background meets WCAG AA (4.5:1, or 3:1 for text 24 px and larger). Run it, fix everything it reports, and repeat until it passes.\n9. Look at it. If this machine can render SVG to PNG, render previews of the posts, story and header and look at them. Fix anything clipped, overlapping, off-grid or unbalanced. If it cannot, say what you tried.\n10. Handoff. `kit/HANDOFF.md`: what is in the kit, the palette with roles and contrast pairs, how to run the check, and the decisions the client should confirm."
  ]
}
```
