# Public model catalogue

`/ai/models` reads the public `GET /v1/models` feed at
`GRIDA_AI_GATEWAY_ORIGIN` (default `https://gateway.grida.ai`). It sends no API
key, cookie or account identity. Production requires an HTTPS origin; development
may explicitly configure an HTTP loopback origin with
`GRIDA_AI_GATEWAY_ALLOW_LOCAL=1`. That flag never permits HTTP in production.
Redirects are rejected. `ggConfig.publicModels()` in `../config.ts` is the only
environment reader; it is separate from signing/workload credential settings.

`schema.ts` validates and projects only the page's supported fields; its Zod
validator stays out of the browser bundle. `catalogue.ts` owns local query and
price-formatting helpers. Published USD rates remain exact decimal strings; conditional rates and quantity bands are
shown without inventing an average or a per-output quote.

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

The browser filters the initial server-rendered data locally. Search replaces
history; deliberate filters push history. Back/forward, restoration and long-open
tabs recheck freshness through the no-store `/ai/models/feed` route. That route
shares the same bounded reader; it does not forward search queries upstream.

The installed-client `/api/v1/models/catalog` contract, shared BYOK catalogues and
special Grida background-removal/upscale tools remain independent and unchanged.

```sh
pnpm --dir editor vitest run lib/gg/public-models
pnpm --dir editor typecheck
```
