# `editor`

This package is the Next.js app that powers **`grida.co`** and tenant domains (e.g. `xyz.grida.site`, custom domains).

- This doc is a curated “where to change what” map. It’s intentionally **not** exhaustive.

## Key rules (things that bite later)

- **Auth is special**: `app/(auth)` is security-critical. **Do not modify** routes/flows there.
- **Public API is versioned**: treat `app/(api)/(public)/v1` as **backwards-compatible** (additive changes only unless you’re intentionally breaking/v2-ing).
- **Layouts are per route group**: there isn’t a single shared root layout across the whole `app/` tree — top-level route groups own their root `layout.tsx`/metadata.
- **Edge entrypoint is `proxy.ts`**: on Next.js 16 this replaces `middleware.ts` (same runtime + semantics). Don’t add a new `middleware.ts`.
- **Tenant pages are tenant-aware**: follow [`app/(tenant)/README.md`](<app/(tenant)/README.md>) for host-prefixed fetches (`server.HOST` / `web.HOST`) and tenant-friendly `href="/path"` patterns.
- **Shared UI boundaries matter**:
  - `components/` should remain route-agnostic and override-friendly (see [`components/AGENTS.md`](components/AGENTS.md))
  - `kits/` are stateful “drop-in widgets” that must not couple to global editor/workbench state (see [`kits/AGENTS.md`](kits/AGENTS.md))
  - `scaffolds/` are feature assemblies and may bind to global/editor state
- **Stable public asset URLs**: put canonical assets under `public/` (e.g. `/brand/...png`) when you need a durable, crawlable, cache-friendly path. (If you care about image search quirks, see [`app/(www)/SEO.md`](<app/(www)/SEO.md>).)

## Directory map

### Editor root (selected)

| Path          | What lives here                             | Guide                                          | Notes                                                                                                                                        |
| ------------- | ------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/`        | Next.js App Router routes                   | —                                              | Route groups are listed below. Main sitemap: [`app/sitemap.ts`](app/sitemap.ts).                                                             |
| `www/`        | Public-site components for `(www)`          | —                                              | Header/footer + landing components. Nav config: [`www/data/sitemap.ts`](www/data/sitemap.ts) (despite the name, it’s **not** `sitemap.xml`). |
| `components/` | Shared UI building blocks                   | [`components/AGENTS.md`](components/AGENTS.md) | Route-agnostic, override-friendly components. Includes primitives under `components/ui/*` and related subdirectories.                        |
| `scaffolds/`  | Feature-sized UI assemblies                 | —                                              | Bigger, feature-scoped assemblies (often app-coupled).                                                                                       |
| `lib/`        | Stable, non-opinionated modules             | —                                              | Good candidates to promote to `/packages` once matured.                                                                                      |
| `grida-*`     | Large domain folders (e.g. `grida-canvas*`) | —                                              | Editor-local domain implementations that may be promoted into `/packages` once stabilized.                                                   |
| `kits/`       | Stateful “drop-in” widgets                  | [`kits/AGENTS.md`](kits/AGENTS.md)             | Opinionated, state-rich UI modules: stateful inside the kit, simple API for consumers. No route/global-store coupling.                       |
| `theme/`      | Templates and themes                        | —                                              | Email templates, enterprise templates, etc.                                                                                                  |
| `public/`     | Static assets                               | —                                              | Use for **stable public asset URLs** (e.g. `/brand/...png`).                                                                                 |

### `app/` route groups (selected)

| Route group   | Used for                                               | Guide                                                | Notes / rules                                                                                                                                                                   |
| ------------- | ------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `(workbench)` | Core editor / workbench                                | —                                                    | Performance-sensitive. Keep `use client` boundaries narrow and avoid heavy deps in shared layouts.                                                                              |
| `(workspace)` | Dashboard / org & project management                   | —                                                    | Similar constraints as `(workbench)`; avoid pushing heavyweight client code into shared layouts.                                                                                |
| `(tenant)`    | Tenant-rooted routes (custom domains / `*.grida.site`) | [`app/(tenant)/README.md`](<app/(tenant)/README.md>) | Tenant-aware routing + host-prefixed fetch rules (`server.HOST` / `web.HOST`).                                                                                                  |
| `(api)`       | Route handlers (public + private)                      | —                                                    | Public: `app/(api)/(public)/v1` (treat as stable). Private: `app/(api)/private` (first-party). Private editor web APIs live under `app/(api)/private/editor` (see `README.md`). |
| `(auth)`      | Auth flow routes                                       | —                                                    | **Do not modify.**                                                                                                                                                              |
| `(tools)`     | Standalone tools                                       | —                                                    | Tools live under `app/(tools)/tools/*`. Some tools include a local `AGENTS.md` (example: [`halftone`](<app/(tools)/tools/halftone/AGENTS.md>)).                                 |
| `(preview)`   | Embed/preview surfaces                                 | —                                                    | Read-only previews and embed-purpose routes (often consumed by tools/playground).                                                                                               |
| `(library)`   | Library (open assets) pages                            | —                                                    | Library browsing/marketing routes.                                                                                                                                              |
| `(www)`       | Public marketing / SEO pages                           | [`app/(www)/SEO.md`](<app/(www)/SEO.md>)             | Public `grida.co` landing pages and SEO-first routes.                                                                                                                           |
| `(site)`      | Public pages not SEO-first                             | —                                                    | Public routes that aren’t primarily marketing/SEO.                                                                                                                              |
| `(insiders)`  | Insider/local-only routes                              | —                                                    | Local-only/internal tooling and flows. Don’t depend on these for production UX.                                                                                                 |
| `(dev)`       | Dev-only pages/tools                                   | —                                                    | Development-only routes; avoid linking from production UI.                                                                                                                      |

## Navigation, sitemaps, and docs links

- **Header/nav config**: [`www/data/sitemap.ts`](www/data/sitemap.ts) (drives `www/header.tsx`; despite the name, this is **not** `sitemap.xml`)
- **`sitemap.xml` generator**: [`app/sitemap.ts`](app/sitemap.ts) (Next.js `MetadataRoute.Sitemap` for `grida.co`; tenant routes are handled separately)
- **Universal routing (docs-friendly links)**: [`../docs/wg/platform/universal-docs-routing.md`](../docs/wg/platform/universal-docs-routing.md)
  - When docs link to editor pages, prefer `https://grida.co/_/<path>`.
  - If you add a new user-facing page that docs should reference, ensure it’s registered in universal routing.
