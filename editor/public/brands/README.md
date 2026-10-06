# Brand logos

Shared third-party brand artwork for the public website. Each brand has a folder
named with a lowercase hyphenated slug, with its primary asset named `logo.svg`
or `logo.png`. Prefer original SVG artwork when available. Keep additional
wordmark or color variants in the same brand folder when needed.

Register assets and display names in [the shared registry](../../www/data/brands.ts).
Static image imports carry source dimensions, so pages can select brands from
that registry and render them in their own layout. For example, Adidas is available
at `/brands/adidas/logo.png` and as `brands.adidas.logo`.

Grida's own identity lives in the sibling `brand/` directory. React technology
and platform logo components live in `packages/grida-react-icons`.
