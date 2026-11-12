# Public model catalogue

`/ai/models` reads the public `GET /v1/models` feed at
`GRIDA_AI_GATEWAY_ORIGIN` (default `https://gateway.grida.ai`). It sends no API
key, cookie or account identity. Production requires an HTTPS origin; development
may explicitly configure an HTTP loopback origin with
`GRIDA_AI_GATEWAY_ALLOW_LOCAL=1`. That flag never permits HTTP in production.
Redirects are rejected. Model, operation and API-reference links use that same
validated origin. `ggConfig.publicModels()` in `../config.ts` is the only
environment reader; it is separate from signing/workload credential settings.

`schema.ts` validates and projects only the page's supported fields; its Zod
validator stays out of the browser bundle. Additive display values (model kinds,
modalities, component units, pricing contexts and release bases) use bounded
opaque tokens. Known values get friendly labels/icons; unfamiliar ones retain
raw text and can be filtered from the observed snapshot. Unused unsupported logo
metadata is omitted. Additional object fields are stripped. Unknown units keep
their exact unit, quantity and rate without inferred conversions or pluralization.
Essential structure, USD/mill denomination, decimals/divisors, rounding, safe
clickable URLs, ordering and validity deadlines remain strict: incompatible
changes to those contracts require a coordinated consumer update.

`catalogue.ts` owns local query
filter parsing and exact decimal formatting. `pricing.ts` groups the published
rates into input, output and ancillary schedules for the table. Different meters
remain separate: cached input is not the ordinary input price, and additive
components are never summed or silently discarded. Only provably disjoint quantity
bands share a “From” summary; overlapping or opaque conditions stay separate.
Unknown meters retain their identities under additional charges. Descriptions,
conditions, tiers and rounding remain in the expanded row, mounted only on demand.
Normalized usage units stay usage units. Unit rates alone do not establish a
general per-image or per-second conversion; the page must not invent that
conversion or maintain its own model-specific price list.

Optional `gg.illustrative_costs` supplies GG's own example amounts separately from
usage rates. Every item has an advertised `operation_id`, exact decimal USD
`amount`, `scenario`, `coverage`, and manual provenance (`description`,
`reviewed_on`, optional HTTPS `source_urls`). The page labels these “Estimated cost”
and shows a compact clickable
amount and an additional-example count. Expanding it reveals every example's
complete scenario, coverage, operation and provenance. Amounts apply only to the
stated scenario and included charges; they are not unit rates or guaranteed request totals. USD strings are
formatted without floating-point conversion or rounding. There is no fallback to
another provider's examples or a model-specific local price list.

Older feeds without this field remain valid. Unsupported or malformed optional
examples, including unknown operation IDs or unsafe source links, are omitted
without hiding a model or weakening validation of its actual usage prices. Only
the supported fields are projected; unfamiliar additive metadata is ignored.

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
Repeated parameters use the first value consistently on the server and browser.
Search replaces history; deliberate filter selections push history. Client navigation
synchronizes the visible filters with the new query. Back/forward, restoration and long-open
tabs recheck freshness through the no-store `/ai/models/feed` route. That route
shares the same bounded reader; it does not forward search queries upstream.
The browser anchors server deadlines to elapsed time instead of comparing them
with the visitor’s wall clock. Expiry still hides stale data during failed refreshes.
Provider-endpoint release dates are identified separately from model releases.

Lab logos are rendered from the existing `@grida/react-icons/logos` package by
canonical lab ID; the page does not fetch the feed’s CDN logo URLs. Labs without
a bundled mark use a neutral initial.

The installed-client `/api/v1/models/catalog` contract, shared BYOK catalogues and
special Grida background-removal/upscale tools remain independent and unchanged.

```sh
pnpm --dir editor vitest run lib/gg/public-models
pnpm --dir editor typecheck
```
