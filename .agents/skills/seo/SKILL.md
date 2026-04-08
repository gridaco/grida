---
name: seo
description: >
  SEO best practices for the Grida project across Next.js pages, blog posts,
  and documentation. Covers Next.js metadata API, Open Graph / Twitter cards,
  sitemaps, image search optimization, structured data (JSON-LD), Docusaurus
  frontmatter, and content writing for search. Use when creating or editing
  public-facing pages under editor/app/(www), writing blog posts, authoring
  docs, or reviewing SEO-related metadata. Trigger phrases: "SEO", "metadata",
  "sitemap", "open graph", "og image", "meta tags", "search ranking",
  "structured data", "JSON-LD".
---

# SEO

Guidelines for search engine optimization across the Grida project -- Next.js
pages, blog posts, and documentation.

## Scope

| Surface                   | Location                          | Framework  |
| ------------------------- | --------------------------------- | ---------- |
| Marketing / product pages | `editor/app/(www)/`               | Next.js 16 |
| Blog                      | `docs/blog/` or `apps/docs/blog/` | Docusaurus |
| Documentation             | `docs/**`                         | Docusaurus |
| Sitemaps                  | `editor/app/sitemap.ts` + others  | Next.js    |

## Next.js Pages (`editor/app/(www)`)

### Metadata

Every public page must export metadata (static or dynamic).

```tsx
// Static
export const metadata: Metadata = {
  title: "Page Title — Grida",
  description: "Concise, keyword-rich description under 160 chars.",
  keywords: ["relevant", "keywords"],
  openGraph: {
    title: "Page Title — Grida",
    description: "Same or tailored OG description.",
    images: ["/og/page-name.png"],
  },
  twitter: {
    card: "summary_large_image",
  },
};

// Dynamic
export async function generateMetadata({ params }): Promise<Metadata> { ... }
```

**Rules:**

- `title` should end with ` — Grida` (or use a `title.template` in the root layout).
- `description` must be unique per page, under 160 characters, and include primary keywords.
- Every page with OG images must set `metadataBase` or use absolute URLs so crawlers resolve them correctly.
- OG images must return **200** without auth and use correct `Content-Type`.

### `metadataBase`

When `openGraph.images` uses relative paths, the layout or page must set:

```tsx
metadataBase: new URL("https://grida.co"),
```

Without this, crawlers may see broken OG URLs.

### Sitemap

Public pages belong in `editor/app/sitemap.ts`.

```ts
{
  url: "https://grida.co/new-page",
  changeFrequency: "monthly",
  priority: 0.5,
}
```

- Use `priority: 1` only for the homepage.
- Match `changeFrequency` to actual update cadence.
- When adding a new public page, always add a sitemap entry.

### Google Image Search

Next.js `<Image>` renders optimized `/_next/image?url=...` URLs that Google
Images indexes unreliably.

**For pages where images are the search target** (brand assets, logos, press
kits):

- Use `<Image unoptimized>` or plain `<img>` so the rendered `src` is a
  stable, direct public URL (e.g. `/brand/grida-symbol-240.png`).
- Include descriptive `alt` text with "Grida" + asset name + format.

**Checklist for image assets:**

- Returns **200** without cookies; not blocked for `Googlebot-Image`
- Correct `Content-Type` (`image/png`, `image/svg+xml`, etc.)
- Not blocked by `robots.txt` or `X-Robots-Tag`
- `/_next/image` endpoint itself is not blocked (other pages still use it)
- Stable, clean URLs under `public/` -- no query-string-only canonicals

### Structured Data (JSON-LD)

Use JSON-LD for rich results where applicable:

- **Product pages**: `Product` or `SoftwareApplication`
- **Blog posts**: `BlogPosting` or `Article`
- **FAQ sections**: `FAQPage`
- **Brand/org**: `Organization`

Embed via a `<script type="application/ld+json">` in the page or layout.

## Documentation (`docs/**`)

Docs are built with Docusaurus and published at `grida.co/docs`.

### Frontmatter

Every doc page should have:

```md
---
title: Feature Name
description: One-line summary for search snippets (under 160 chars).
keywords: [keyword1, keyword2]
---
```

- `title` becomes the `<title>` tag and H1.
- `description` becomes the meta description.
- `keywords` help Docusaurus generate meta tags.
- Add `slug:` only when the default URL path is wrong.

### Headings

- Use a single `# H1` matching the `title` frontmatter.
- Use `##` for sections -- these generate anchor links and appear in the TOC.
- Headings should be descriptive and keyword-aware (search engines weight them).

### Internal Linking

- Link related docs to each other -- it helps search engines discover pages
  and improves user navigation.
- Use relative paths within `/docs`.
- For editor pages, use universal routing: `https://grida.co/_/<path>`.

## Blog Posts

### Title

- Clear, specific, keyword-forward. Front-load the most important words.
- Avoid clickbait or vague titles.
- Good: "How Grida Canvas Renders 10K Nodes at 60 FPS"
- Bad: "Exciting Updates!"

### Meta Description

- Write a custom `description` in frontmatter (under 160 chars).
- Summarize the post's value proposition -- what will the reader learn?

### Content Structure

- Open with a clear summary paragraph (search engines often use this as
  the snippet).
- Use `##` headings that include relevant keywords.
- Break content into scannable sections.
- Include alt text on all images.

### Social Sharing

- Set `image:` in frontmatter for the OG image.
- OG image should be 1200x630 px for optimal display.
- Ensure the image URL is absolute and publicly accessible.

## Crawl Control

### `robots.txt`

Located at `editor/app/robots.txt`. Currently allows everything except
`/private/`. When adding new route groups that should not be indexed (e.g.
internal tools, preview embeds, auth flows), add a `Disallow:` rule here.

### Canonical URLs & Tenant Domains

Grida serves `grida.co` (main) and `[tenant].grida.site` (tenant sites).
Tenant-rendered pages must **not** compete with `grida.co` pages in search.

- Public marketing pages under `(www)` should set canonical to
  `https://grida.co/...`.
- Tenant pages (`(tenant)`) should either set `noindex` or canonical to their
  own `*.grida.site` domain -- never to `grida.co`.
- Preview / embed pages (`(preview)`) should be `noindex, nofollow`.

### Known Gaps

- The `(www)` root layout (`editor/app/(www)/layout.tsx`) does not set
  `metadataBase`. Pages with relative OG images should set it themselves
  (see `metadataBase` section above) or it should be added to the root layout.

## General SEO Writing Rules

These apply across all surfaces (pages, docs, blog):

1. **One primary keyword per page.** Include it in the title, first paragraph,
   and at least one heading.
2. **Write for humans first.** Natural, helpful content ranks better than
   keyword-stuffed text.
3. **Unique content.** Every page must have a unique title and description.
   Duplicate meta across pages hurts rankings.
4. **Descriptive link text.** Use meaningful anchor text, not "click here."
5. **Alt text on images.** Describe what the image shows; include keywords
   when natural.
6. **URL structure.** Keep URLs short, lowercase, hyphenated, and descriptive.
   Avoid IDs or query params in public URLs.
7. **Mobile-first.** Ensure pages render well on mobile -- Google uses
   mobile-first indexing.
8. **Performance.** Page speed is a ranking factor. Prefer static/SSG pages
   for marketing content. Lazy-load below-fold images.

## Verification Checklist

Before shipping a public page or post:

- [ ] `title` and `description` set in metadata / frontmatter
- [ ] `description` is under 160 characters and unique
- [ ] OG image set, absolute URL, returns 200 without auth
- [ ] Page added to sitemap (Next.js pages)
- [ ] Headings use keywords and follow hierarchy (no skipped levels)
- [ ] All images have `alt` text
- [ ] No duplicate meta with other pages
- [ ] Page is mobile-friendly
- [ ] Canonical URL is correct (no competing duplicates)
