### SEO gotchas for `editor/app/(www)` (not the basics)

This doc exists to record **easy-to-miss stack-specific issues** and **our preferred tricks**.

---

### Google Image Search gotcha: Next.js `<Image>` hides the “real” image URL

**Symptom:** the page ranks (e.g. “Grida logo png”), but **Google Images doesn’t surface the logo assets** from that page.

**Cause:** Next.js `<Image>` commonly renders an optimized `src` like:

- `/_next/image?url=%2Fbrand%2Fgrida-symbol-240.png&w=...&q=...`

Google Images indexes the asset more reliably when the rendered `img src` is a **stable public URL** such as `/brand/...png` rather than only an optimized proxy URL.

**Our trick (for brand/press/asset pages):** ensure the rendered `img src` is a **direct, stable, public asset URL**.

- **Preferred**: keep `<Image>`, but add `unoptimized` for SEO-critical assets.
- **Alternative**: use a plain `<img>` when you want to be maximally explicit.

**Apply to:** pages where the images themselves are the query target (“logo png”, brand assets, downloads).

**Sanity checklist:**

- **Public**: returns **200** without cookies; not blocked for `Googlebot-Image`
- **Correct `Content-Type`**: `image/png`, `image/svg+xml`, etc.
- **Not blocked by robots**: `robots.txt` and `X-Robots-Tag`
- **`/_next/image` is fetchable**: not blocked by robots, authentication, or middleware (other pages may still rely on the optimizer)
- **Stable, clean URLs**: prefer `public/` paths like `/brand/...` (avoid query-string-only canonical asset URLs)
- **Alt text**: include “Grida” + asset name + format (e.g. “Grida wordmark logo (PNG)”)

**Reminder:** JSON-LD / Open Graph help, but they **don’t replace** crawlable image URLs in the HTML for Image Search.

---

### Image search boost: sitemap + canonical URL

- **Image sitemap**: include brand PNGs in the image sitemap (one entry per canonical asset URL).
- **Canonical**: keep a single, clean canonical `/brand` URL (avoid duplicates, tracking params, and competing alternates).

---

### Next.js metadata: relative OG/Twitter images need `metadataBase`

OG/Twitter images must resolve to **absolute public URLs** that return **200** without auth.

If `openGraph.images` uses relative paths in Next.js metadata, `metadataBase` is required so crawlers see correct absolute URLs.

