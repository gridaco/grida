# `~` The Tenant Root

It's technically possible to visit this route as-is (e.g. `/~/xyz/...`), but the primary use case is to visit via the custom domain (e.g. `xyz.grida.site/...` or `xyz.com/...`) for this reason, the common practice under this directory follows the below rules.

## Rules.

1. fetch requests needs to be prefixed with `web.HOST` or `server.HOST` if it points to the grida api.

Instead of `fetch("/api")`, use `fetch(server.HOST + "/api")`

2. routing needs to be tenant-aware, meaning `href="/path"` will point to the `xyz.grida.site/path`

Intead of `href="/~/xyz/path"`, use `href="/path"`
