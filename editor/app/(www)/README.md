# Public website route register (`(www)`)

This is the canonical maintainer map for pages physically owned by
`editor/app/(www)`. It records why each public page exists, its UX and CTA
umbrella, the user-visible gate and recovery path, the terminal funnel outcome,
crawl intent, and lifecycle.

This file describes **product intent and current behavior**. The App Router
tree remains authoritative for which URLs actually resolve.

## Sources of truth

| Concern                                            | Authority                                                                                                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deployed route, layout, and runtime behavior       | [`page.tsx` files in this directory](.) and their imported components                                                                                                              |
| Intended route role, CTA, funnel, and lifecycle    | This README                                                                                                                                                                        |
| Crawl discovery and explicit crawler policy        | [`app/sitemap.ts`](../sitemap.ts), [`app/robots.txt`](../robots.txt), and each page's metadata                                                                                     |
| Shared header, footer, and navigation destinations | [`www/data/sitemap.ts`](../../www/data/sitemap.ts), [`header-cta.tsx`](../../www/header-cta.tsx), and [`footer-with-cta.tsx`](../../www/footer-with-cta.tsx)                       |
| Dedicated AI model-page publication and retirement | [`www/data/ai-model-pages.ts`](../../www/data/ai-model-pages.ts)                                                                                                                   |
| AI execution and recovery enforcement              | [`lib/ai/README.md`](../../lib/ai/README.md), [`lib/ai/server.ts`](../../lib/ai/server.ts), and `getEntitlement()` in [`lib/billing/metronome.ts`](../../lib/billing/metronome.ts) |
| Intrinsic AI model facts and provider pricing      | `@grida/ai-models`                                                                                                                                                                 |

Do not turn this README into another router or sitemap. Update it in the same PR
when a route is added, removed, renamed, redirected, re-indexed, or changes its
primary CTA, gate, recovery behavior, funnel outcome, or lifecycle. A new
`(www)` page is not complete until it has a row here.

Dynamic inventories stay in their executable registries. For example, this
README describes `/ai/models/[slug]` once; individual active models and their
`retireWhen` conditions remain in `ai-model-pages.ts`.

## Vocabulary

### UX and CTA umbrellas

| Umbrella                  | Visitor intent                                          | Typical outcome                                          |
| ------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| Workspace acquisition     | Understand a Grida product, then start or resume work   | Dashboard, organization, project, or editor              |
| Playable evaluation       | Try a real tool before or while deciding to adopt it    | Generated media, an editable canvas, or a tool result    |
| Model discovery           | Compare a model or answer model-name search intent      | Exact model runner                                       |
| Developer adoption        | Evaluate or install a package, format, or SDK           | npm, GitHub, docs, or a public editor demo               |
| Resource acquisition      | Obtain an installer or official asset                   | Downloaded file or release page                          |
| Plan conversion           | Choose Free, Pro, or Custom                             | Dashboard, billing upgrade, or sales contact             |
| Sales and community       | Reach a person or join an external community            | Email, Slack, calendar, waitlist, or marketplace         |
| Reference browse          | Inspect a catalogue without mutating product state      | Model, template, material, or published-form detail      |
| Prototype transaction     | Exercise an unfinished transactional concept            | Client-only preview; no durable order or payment         |
| Alias, embed, or campaign | Support a specific host, compatibility, or campaign use | Canonical redirect/handoff, embedded UI, or campaign CTA |

### Gate terms

- **No browse gate**: the page and its evidence are public.
- **Destination gate**: the page is public; auth, organization selection, or
  billing happens only after its CTA hands off elsewhere.
- **Run gate**: the tool is public, but a server-authoritative mutation checks
  auth, organization membership, and any entitlement when the visitor runs it.
- **Page gate**: the page itself redirects based on session state.
- **External gate**: Figma, GitHub, Slack, Cal.com, npm, or another destination
  owns any account requirement.
- **Prototype/no-op**: the control does not yet perform the transaction its
  copy implies. This is not a successful or gated production funnel.

“Not in the sitemap” is not a gate and is not `noindex`. Unless page metadata or
`robots.txt` says otherwise, such a page remains crawlable when discovered.

## Shared funnels

Pages using the shared [`Header`](../../www/header.tsx) inherit these controls:

- Desktop, signed out: **Sign in** → `/sign-in`; **Get Started** →
  `/dashboard/new?plan=free`.
- Desktop, signed in: **Dashboard** → `/dashboard`.
- The mobile drawer currently always shows **Sign in** and **Get Started**,
  even when the visitor is signed in.
- Pages using [`FooterWithCTA`](../../www/footer-with-cta.tsx) also show
  **Start your project** → `/dashboard/new?plan=free` and **Try the demo** →
  `/canvas`.

`/dashboard/new?plan=free` is a compatibility shim, not the current plan
selector. It redirects to `/dashboard`; `/dashboard` then sends a guest to
`/sign-in`, a member with no organization to `/organizations/new`, and an
existing member to their last or first available workspace. New paid-plan CTAs
should use the universal billing route instead of adding new query intents to
the shim.

## Core, commercial, and resource routes

| Route and owner                                                                                               | State and crawl                                          | Umbrella and reason                                       | Primary CTA and funnel                                                        | Gate and recovery                                                                                                                                                                                                                                                                         | Replace or remove when                                                                                             |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `/` — [`(home)/page.tsx`](<(home)/page.tsx>)                                                                  | Active; sitemap                                          | Workspace acquisition; canonical Grida home               | Start project → compatibility shim → dashboard; demo → `/canvas`              | Page gate: authenticated visitors redirect directly to `/dashboard`; destinations own later auth/org recovery                                                                                                                                                                             | Only when another URL becomes the canonical home; preserve a redirect                                              |
| `/home` — [`(home)/home/page.tsx`](<(home)/home/page.tsx>)                                                    | Alias; explicit `noindex`; canonical `/`; not in sitemap | Alias/campaign shell for the same home content            | Same CTAs as `/`, without the page-level signed-in redirect                   | Shared-header destination gates                                                                                                                                                                                                                                                           | After shared navigation and meaningful inbound links no longer depend on the alias; redirect rather than orphan it |
| `/pricing` — [`(pricing)/pricing/page.tsx`](<(pricing)/pricing/page.tsx>)                                     | Active; sitemap                                          | Plan conversion; presents current public commercial offer | Free → `/dashboard`; Pro → `/_/settings/billing/upgrade`; Custom → `/contact` | No browse gate. Free handles guest/no-org recovery through `/dashboard`. Pro sends guests to sign-in, routes one org directly, and asks multi-org users to choose; a signed-in zero-org user currently dead-ends at “No organizations available.” Custom enters the public contact funnel | When plan acquisition moves to a replacement canonical route; preserve `/pricing` as a redirect                    |
| `/contact` — [`(contact)/contact/page.tsx`](<(contact)/contact/page.tsx>)                                     | Active; sitemap                                          | Sales and community; human support and sales entrypoint   | Slack, email, or Cal.com                                                      | No Grida gate; external services own their requirements                                                                                                                                                                                                                                   | When every published sales/support CTA has another maintained destination                                          |
| `/downloads` — [`(downloads)/downloads/page.tsx`](<(downloads)/downloads/page.tsx>)                           | Active; sitemap                                          | Resource acquisition; Desktop distribution                | Platform installer; fallback to GitHub Releases                               | No Grida gate                                                                                                                                                                                                                                                                             | When Desktop distribution has a replacement canonical page; keep release redirects working                         |
| `/brand` — [`(brand)/brand/page.tsx`](<(brand)/brand/page.tsx>)                                               | Active; sitemap                                          | Resource acquisition; official brand kit                  | Direct PNG and SVG downloads                                                  | No gate                                                                                                                                                                                                                                                                                   | When the official kit moves; redirect to its new canonical home                                                    |
| `/www-embed/demo-canvas` — [`(home)/www-embed/demo-canvas/page.tsx`](<(home)/www-embed/demo-canvas/page.tsx>) | Embed; not in sitemap; currently no explicit `noindex`   | Alias/embed; isolated canvas used inside marketing demos  | No CTA; hosts the interactive canvas                                          | No gate                                                                                                                                                                                                                                                                                   | With its last embed consumer; otherwise add explicit crawler policy instead of relying on sitemap omission         |
| `/kr/events` — [`kr/events/page.tsx`](kr/events/page.tsx)                                                     | Campaign; not in sitemap; currently indexable            | Alias/campaign; Korean events and affiliate landing       | Start → `/forms`; contact → `/contact`                                        | No browse gate; Forms activation owns any later workspace gate                                                                                                                                                                                                                            | When the campaign ends or gets a successor; redirect if inbound campaign links remain                              |

## Product and developer routes

| Route and owner                                                                                           | State and crawl                                       | Umbrella and reason                                             | Primary CTA and funnel                                           | Gate and recovery                                                                                                                                                 | Replace or remove when                                                                                               |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `/forms` — [`(forms)/forms/page.tsx`](<(forms)/forms/page.tsx>)                                           | Active; sitemap                                       | Workspace acquisition; canonical Forms landing                  | Start project → compatibility shim; demo → `/forms/ai`           | No browse gate; activation is destination-gated                                                                                                                   | When a successor becomes the canonical Forms landing                                                                 |
| `/forms/supabase` — [`(forms)/forms/supabase/page.tsx`](<(forms)/forms/supabase/page.tsx>)                | Active; sitemap                                       | Workspace acquisition; Supabase-specific search intent          | Start project → compatibility shim                               | Destination handles auth and organization                                                                                                                         | When this search intent is folded into a replacement with a redirect                                                 |
| `/forms/ai` — [`(forms)/forms/ai/page.tsx`](<(forms)/forms/ai/page.tsx>)                                  | Degraded playable route; sitemap                      | Playable evaluation; prompt-first entry to the Forms playground | POST prompt → temporary gist → `/playground/forms/[slug]`        | Current generation has no organization context and errors. Publishing later requires sign-in, loses the first submit, and provisions/selects a workspace on retry | Reactivate with an honest auth/org gate, or noindex/retire it; do not market the current path as a working generator |
| `/forms/templates` — [`(forms)/forms/templates/page.tsx`](<(forms)/forms/templates/page.tsx>)             | Active browse; not in sitemap; currently indexable    | Reference browse; server-fetched form templates                 | Card → published form URL                                        | No catalogue gate; the target form owns any interaction rules                                                                                                     | When the template corpus is retired; separately decide sitemap versus explicit `noindex`                             |
| `/database` — [`(database)/database/page.tsx`](<(database)/database/page.tsx>)                            | Active; sitemap                                       | Workspace acquisition; canonical Database landing               | Start project → compatibility shim                               | Destination handles auth and organization                                                                                                                         | When a successor becomes the canonical Database landing                                                              |
| `/database/supabase` — [`(database)/database/supabase/page.tsx`](<(database)/database/supabase/page.tsx>) | Active; sitemap                                       | Workspace acquisition; Supabase admin search intent             | Connect Supabase → compatibility shim                            | Destination handles auth and organization; connection itself is not performed on this page                                                                        | When the intent is replaced; preserve a redirect                                                                     |
| `/slides` — [`(slides)/slides/page.tsx`](<(slides)/slides/page.tsx>)                                      | Active; sitemap                                       | Playable evaluation and developer adoption                      | Try editor → `/canvas/slides`; secondary GitHub                  | Public demo has no Grida gate; shared footer offers workspace activation                                                                                          | When another route becomes the canonical Slides landing/editor handoff                                               |
| `/svg` — [`(svg)/svg/page.tsx`](<(svg)/svg/page.tsx>)                                                     | Active; sitemap                                       | Playable evaluation and developer adoption                      | Try editor → `/svg/examples/default`; npm/docs/GitHub follow-ups | Public editor demo has no Grida gate                                                                                                                              | When another route becomes the canonical SVG product and SDK landing                                                 |
| `/sdk` — [`(sdk)/sdk/page.tsx`](<(sdk)/sdk/page.tsx>)                                                     | Active; sitemap                                       | Developer adoption; Canvas SDK landing                          | GitHub, SDK docs, and an embedded public canvas demo             | No gate; external destinations own their accounts                                                                                                                 | When the SDK has a replacement canonical landing                                                                     |
| `/dotcanvas` — [`(dotcanvas)/dotcanvas/page.tsx`](<(dotcanvas)/dotcanvas/page.tsx>)                       | Active; sitemap                                       | Developer adoption; `.canvas` format and package reference      | Copy install command; npm and GitHub                             | No gate                                                                                                                                                           | When the format/package is retired or renamed; preserve package and spec redirects                                   |
| `/figma/assistant` — [`(figma)/figma/assistant/page.tsx`](<(figma)/figma/assistant/page.tsx>)             | Early access; sitemap                                 | Sales/community and external product adoption                   | Install Figma plugin; waitlist; book demo                        | Figma, hosted waitlist, and Cal.com own their gates                                                                                                               | When the plugin or access program is retired or receives a new canonical route                                       |
| `/figma/ci` — [`(figma)/figma/ci/page.tsx`](<(figma)/figma/ci/page.tsx>)                                  | Legacy; sitemap                                       | Developer adoption; old CLI/Figma-CI funnel                     | Copy `npx grida init`; open deprecated CLI docs                  | No application gate                                                                                                                                               | With the deprecated CLI surface; redirect to the maintained successor rather than leaving stale acquisition copy     |
| `/figma/vscode` — [`(figma)/figma/vscode/page.tsx`](<(figma)/figma/vscode/page.tsx>)                      | Early onboarding; not in sitemap; currently indexable | Sales/community; Slack-led VS Code onboarding                   | Join Slack                                                       | External/community gate only                                                                                                                                      | When the extension or Slack onboarding path is retired; separately decide sitemap versus explicit `noindex`          |
| `/west` — [`(west)/west/page.tsx`](<(west)/west/page.tsx>)                                                | Beta; not in sitemap; currently indexable             | Workspace acquisition and sales; referral-marketing concept     | Start project/sign in; book a meeting                            | Workspace destinations handle auth/org; Cal.com is external                                                                                                       | Promote with an explicit crawl decision, or retire/redirect if the beta ends                                         |

## AI page topology

The `/ai` prefix contains three independent page contracts. A modality does not
need to publish all three merely to make the URL tree look symmetrical.

- **Modality landing — `/ai/<modality>`**: an optional, durable product page
  for broad modality intent. It must earn the route with authored workflows,
  real output evidence, and a category-level funnel that can survive model
  replacement. `/ai/music` is the current example: it covers Lyria 3 and Lyria
  3 Pro, but the route belongs to music rather than either model.
- **Exact model page — `/ai/models/<slug>`**: one editorially selected model,
  its model-specific evidence, and an exact runner handoff. Publication and
  retirement are owned by `ai-model-pages.ts`; a direct successor may replace
  the route according to its recorded lifecycle.
- **Runner**: the functional execution destination. Its browse policy,
  indexing, accepted query parameters, and run-gate recovery are specified
  independently from the landing or model page that links to it.

Do not add `/ai/image` or another modality landing only to mirror
`/ai/music`. Add one when it has distinct, maintained category content.
Likewise, do not rename a modality landing into an exact model page without
narrowing its content and proving an exact model-selected runner handoff.

## AI routes

| Route and owner                                                                                     | State and crawl                                                                                        | Umbrella and reason                                                                     | Primary CTA and funnel                                                                      | Gate and recovery                                                                                                                                                                         | Replace or remove when                                                                                                                                   |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/ai` — [`(ai)/ai/page.tsx`](<(ai)/ai/page.tsx>)                                                    | Internal dogfood; explicit `noindex, nofollow`; not in sitemap                                         | Playable evaluation for AI chat and credit-seam testing                                 | Submit chat → transient response in the current client                                      | Not pre-gated. Server refusal redirects signed-out/no-org users; blocked credit offers a top-up toast. The invocation is not retained                                                     | When the dogfood surface is replaced or promoted into a separately specified product page                                                                |
| `/ai/models` — [`(ai)/ai/models/page.tsx`](<(ai)/ai/models/page.tsx>)                               | Active; sitemap                                                                                        | Model discovery; canonical supported-model catalogue                                    | A model label links to a dedicated page only when the editorial registry publishes one      | No run gate; browse-only                                                                                                                                                                  | When a replacement catalogue becomes canonical; never list unsupported models                                                                            |
| `/ai/models/[slug]` — [`(ai)/ai/models/[slug]/page.tsx`](<(ai)/ai/models/[slug]/page.tsx>)          | Registry-controlled static pages; active entries (currently `/ai/models/gpt-image-2`) join the sitemap | Model discovery; model-name search page intended to carry model-specific human evidence | Exact model CTA → its declared runner; current runner family is `/playground/image?model=…` | No browse gate. The destination runner owns auth/org/entitlement recovery                                                                                                                 | Per-entry `retireWhen` in `ai-model-pages.ts`; [`next.config.ts`](../../next.config.ts) turns its retired redirect dispositions into permanent redirects |
| `/ai/music` — [`(ai)/ai/music/page.tsx`](<(ai)/ai/music/page.tsx>)                                  | Active; sitemap                                                                                        | Playable evaluation; bespoke music landing and real-output showcase                     | Prompt/example → `/ai/playground/music`, preserving prompt text                             | No browse gate; destination owns execution gate                                                                                                                                           | When deliberately replaced by another canonical music landing, not merely when one model version changes                                                 |
| `/ai/playground` — [`(ai)/ai/playground/page.tsx`](<(ai)/ai/playground/page.tsx>)                   | Active; sitemap                                                                                        | Playable evaluation; directory of current AI tools                                      | Music → `/ai/playground/music`; image → `/playground/image`; forms → `/forms/ai`            | No gate; navigation only. Each destination has its own, currently non-uniform gate                                                                                                        | When another maintained tool directory becomes canonical                                                                                                 |
| `/ai/playground/music` — [`(ai)/ai/playground/music/page.tsx`](<(ai)/ai/playground/music/page.tsx>) | Active, request-dynamic; sitemap                                                                       | Playable evaluation; prompt/image to music                                              | Generate → transient audio player and download                                              | In-place sign-in can resume. No-org uses the older redirect flow; blocked credit is currently a plain error without retained invocation or billing recovery. Server remains authoritative | When replaced, or when migrated to the shared retained-invocation gate; do not describe current recovery as seamless                                     |

The image runner is outside `(www)` but is load-bearing for model pages:
`/playground/image?model=…` validates the requested listed model, gates only on
run, retains the exact refused invocation, handles sign-in in place, resolves
organization/billing remedies server-side, and on success inserts the output
into the canvas and uploads it to Library. It is currently the only web media
runner with the full retained-invocation recovery flow.

## Print prototype routes

The entire Print subtree is public, omitted from the sitemap, and lacks
explicit `noindex`. Its transactional controls are prototypes: order, custom
order, and contact have no server transaction; the standard-order submit is
unreachable, while custom order and contact only alert/log in the client. No
payment or durable order is created.

| Route and owner                                                                                 | UX/CTA umbrella and outcome                                                                                     | Gate                                           | Replace or remove when                                                  |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| `/print` — [`(printing)/print/page.tsx`](<(printing)/print/page.tsx>)                           | Prototype transaction landing → standard order or contact                                                       | No gate                                        | Implement and promote the order funnel, or noindex/retire the prototype |
| `/print/~/order` — [`order/page.tsx`](<(printing)/print/~/order/page.tsx>)                      | Configure a standard order; submit is unreachable because required name/email state has no corresponding inputs | Prototype/no-op                                | A real server order replaces it, or the prototype is removed            |
| `/print/~/order/custom` — [`order/custom/page.tsx`](<(printing)/print/~/order/custom/page.tsx>) | Multi-step custom-order mock; submit alerts only; Studio is an external follow-up                               | Prototype/no-op; Studio owns any external gate | A real custom-order or sales flow replaces it                           |
| `/print/~/contact` — [`contact/page.tsx`](<(printing)/print/~/contact/page.tsx>)                | Contact form mock; submit logs, alerts success, and resets locally without sending                              | Prototype/no-op                                | A real support/sales handler replaces it                                |
| `/print/~/templates` — [`templates/page.tsx`](<(printing)/print/~/templates/page.tsx>)          | Reference browse of local template data; no selection handoff                                                   | No gate                                        | It gains a real order/design handoff, or is removed with Print          |
| `/print/~/materials` — [`materials/page.tsx`](<(printing)/print/~/materials/page.tsx>)          | Reference browse of local material data                                                                         | No gate                                        | It gains a real order handoff, or is removed with Print                 |
| `/print/~/design` — [`design/page.tsx`](<(printing)/print/~/design/page.tsx>)                   | Public local canvas experiment; no order handoff                                                                | No gate                                        | It is connected to a real print order or removed with Print             |

## Known decisions and drift

Keep these visible until a product decision or implementation removes them:

- `/www-embed/demo-canvas`, `/figma/vscode`, `/forms/templates`, `/west`,
  `/kr/events`, and every `/print*` route are absent from the sitemap but are
  still indexable when discovered. Decide sitemap versus explicit `noindex`.
- The shared anonymous **Get Started** CTA still targets the retired pricing
  intent shim. It works, but new code should not extend that legacy contract.
- The shared mobile header is not session-aware: signed-in visitors still see
  **Sign in** and **Get Started**, unlike the desktop header.
- The Pro upgrade selector has no organization-creation recovery for a signed-in
  visitor with zero organizations.
- AI recovery is deliberately documented per runner. Image has the full
  retained-invocation gate; music and chat do not.
- The current `gpt-image-2` model-page entry is wired into static params and
  the sitemap but still has an artwork placeholder. The route is not
  release-ready until approved page-specific output and content replace it.
- `/forms/ai` is discoverable and in the sitemap even though generation is
  currently blocked by missing organization context.
- The Print subtree looks transactional but has no durable transaction.
