# Public model catalogue

`/ai/models` reads the public `GET /v1/models` feed at
`GRIDA_AI_GATEWAY_ORIGIN` (default `https://gateway.grida.ai`). It sends no API
key, cookie or account identity. Production requires an HTTPS origin; development
may explicitly configure an HTTP loopback origin with
`GRIDA_AI_GATEWAY_ALLOW_LOCAL=1`. That flag never permits HTTP in production.
Redirects are rejected. `ggConfig.publicModels()` in `../config.ts` is the only
environment reader; it is separate from signing/workload credential settings.

`schema.ts` validates and projects only the page's supported fields; its Zod
validator stays out of the browser bundle. `catalogue.ts` owns local query
filter parsing and exact decimal formatting. `pricing.ts` groups the published
rates into input, output and ancillary schedules for the table. Different meters
remain separate: cached input is not the ordinary input price, and additive
components are never summed or silently discarded. A lower conditional unit rate
is labeled “From”; all conditions, tiers and rounding remain in the expanded row.
Normalized usage units stay usage units. The current feed does not provide enough
information to turn them into per-image or per-second quotes; the page must not
invent that conversion or maintain its own model-specific price list.

`cache.ts` owns one snapshot and one in-flight fetch per server process. Reads
have a five-second deadline and a 2 MiB decoded limit. Successful validation is
fresh for 60 seconds and usable on upstream failure for at most 300 seconds,
shortened by `next_change_at`. Upstream Date/Age count toward those limits;
reading another cache cannot restart them. A failed fetch backs off five seconds.
There is no provider/financial work, query cache, persistent write or model-list
fallback. The page deliberately disables HTML/ISR caching so stale framework
fallback cannot silently extend those deadlines.

Exact public page/feed reads bypass session refresh in `proxy.ts`, while retaining
maintenance and tenant-host routing. Other routes keep their identity behavior.

The browser filters the initial server-rendered data locally and orders models by
release date, newest first. Unknown dates come last; equal dates use model ID as
a stable tie-breaker. The public API retains its canonical ID ordering. The filter builder
supports multiple selections for type, lab, input and output. The page uses CSV
values in `kind` and `lab` for OR within those groups, AND across groups, ALL
selected inputs and ANY selected outputs. These are page-local queries over the
complete snapshot; the public API still accepts a single `kind` and `lab`.
Search replaces history; deliberate filter selections push history. Back/forward, restoration and long-open
tabs recheck freshness through the no-store `/ai/models/feed` route. That route
shares the same bounded reader; it does not forward search queries upstream.

Lab logos are rendered from the existing `@grida/react-icons/logos` package by
canonical lab ID; the page does not fetch the feed’s CDN logo URLs. Labs without
a bundled mark use a neutral initial.

The installed-client `/api/v1/models/catalog` contract, shared BYOK catalogues and
special Grida background-removal/upscale tools remain independent and unchanged.

```sh
pnpm --dir editor vitest run lib/gg/public-models
pnpm --dir editor typecheck
```
