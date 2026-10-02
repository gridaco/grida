# Grida Open API

Grida's public, user-facing API runs in this Nitro 2 application on Node.js 24.
The first product module is Forms. Grida's own interfaces use the same public
HTTP contract. Private editor endpoints, account authentication, billing, West
administration and Toss payment callbacks remain in `editor/`.

The API shares the existing Supabase project, identities, organizations, projects,
buckets and migration stream. There is no new database or account system.
`supabase/` remains the sole migration authority. Shared producers have explicit
boundaries:

| Package                               | Responsibility                                                           |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `@grida/forms`                        | Neutral Forms contracts, projections and pure utilities                  |
| `@app/database`                       | Generated types and adapters that receive a caller-owned Supabase client |
| `@grida/postgrest`                    | Pure schema interpretation and JSON-path utilities                       |
| `@workspace/utils/http`               | Request/header normalization with explicit inputs                        |
| `@workspace/utils/otp`                | Node-only cryptographic OTP generation                                   |
| `@workspace/translations/forms`       | Forms catalogs, locale selection and request-local translators           |
| `@workspace/emails/ciam-verification` | Verification email presentation and subject text                         |

These packages do not own credentials, application request context or provider
delivery. The API owns authorization, privileged client creation, operation
orchestration and required effects. Editor consumers call its public HTTP
contract; they do not import API operations.

## Develop

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm turbo build --filter='@grida/api^...'
cp apps/api/.env.example apps/api/.env
# Fill the API's local Supabase values, then:
pnpm --filter @grida/api dev
```

Nitro development listens on port 4000 and loads the app's explicit `.env` file.
Set `NEXT_PUBLIC_GRIDA_OPEN_API_ORIGIN=http://localhost:4000` in the editor's
local environment. See [authenticated local development](../../CONTRIBUTING.md#authenticated-local-development)
for the editor's existing local Supabase configuration. API and editor must use
the same backend. Hosted credentials are not a local development default.

```sh
pnpm --filter @grida/api typecheck
pnpm --filter @grida/api test
pnpm --filter @grida/api build:local
pnpm --filter @grida/api start
pnpm --filter @grida/api build
```

`build:local` produces `.output/server/index.mjs`; `build` produces the Vercel
Node function in `.vercel/output`. The dependency-only Turbo command above builds
the API's shared packages, including the token dependency of Forms, without
building the API. `@app/database` exports source and has no build step. The
compiled packages export from `dist`; their runtime dependencies remain declared
in their manifests and are resolved by the application build.

Forms translation JSON lives in [`data/translations`](../../data/translations/README.md)
and is embedded by the translation package build; deployed processes do not read
the repository data directory. That package's Turbo inputs include the canonical
catalog directory. Production Node processes receive configuration from their
environment; they do not load the editor's dotenv files.

## Environment ownership

| Variable                            | Owner and purpose                                      |
| ----------------------------------- | ------------------------------------------------------ |
| `GRIDA_OPEN_API_ORIGIN`             | API: canonical origin for public endpoint URLs         |
| `GRIDA_WEB_ORIGIN`                  | API: origin for existing receipt and error pages       |
| `SUPABASE_URL`                      | API: existing project origin                           |
| `SUPABASE_SECRET_KEY`               | API only: privileged server key; never a browser value |
| `RESEND_API_KEY`                    | API: OTP and respondent receipt delivery               |
| `NEXT_PUBLIC_GRIDA_OPEN_API_ORIGIN` | Editor: compiled public API origin                     |

Origins are complete URLs without a path, query, fragment or credentials.
Preview deployments need an explicit paired API origin and the same isolated
nonproduction backend. Do not default a missing preview origin to production.
The existing `GRIDA_API_ORIGIN` belongs to the native/machine API and is unrelated.

Keep values explicit per project. Supabase configuration may have the same values
in both projects, but each project receives only the credentials its operations
require. No synchronized dotenv file or shared privileged browser configuration
is introduced.

## HTTP contract

| Method    | Path                                                        | Capability                                                    |
| --------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| GET       | `/v1/:id`                                                   | Load the published form and render contract                   |
| GET       | `/v1/:id/session`                                           | Create a respondent session (existing method retained)        |
| GET, POST | `/v1/submit/:id`                                            | Submit a response; JSON or existing browser redirect behavior |
| PATCH     | `/v1/session/:session/field/:field`                         | Save a field draft                                            |
| POST, PUT | `/v1/session/:session/field/:field/file/upload/signed-url`  | Prepare a Storage upload                                      |
| GET       | `/v1/session/:session/field/:field/file/preview/public-url` | Resolve a staged file preview                                 |
| POST      | `/v1/session/:session/field/:field/challenge/email/start`   | Start email verification                                      |
| GET       | `/v1/session/:session/field/:field/challenge/email/state`   | Read verification state                                       |
| POST      | `/v1/session/:session/field/:field/challenge/email/verify`  | Verify the challenge                                          |
| GET       | `/v1/session/:session/field/:field/search/meta`             | Load reference-field metadata                                 |

Session IDs are bearer capabilities. The server binds each supplied session to
its form, field and staged objects. Member cookies are not authority for these
operations. CORS permits anonymous browser callers (`*`, no credentials), with
explicit content and existing simulator/geo headers. These metadata headers do
not confer authorization. Responses are not cached. `x-request-id` correlates
requests without logging session URLs, request bodies or provider responses.

Respondent location comes from Vercel request geolocation, with the existing
developer/simulator header overrides. The API maps Vercel's `countryRegion` to
the response's geographic `region`; the Vercel compute region is not a respondent
location. Missing location stays empty, including in local development. No
external IP lookup or enrichment credential is used. Historical `x_ipinfo` data
remains readable; new submissions write only the normalized `geo` column.

The session response exposes `{ id, form_id }`; submission data exposes
`{ id, customer_id }`. Form fields and render blocks use explicit recursive
projections; customer access exposes only `{ uid }`. Database rows and internal
storage/connection configuration are not the public response contract.

Checkbox groups accept repeated literal values; enabled multi-toggle groups
accept repeated option IDs or the existing comma-packed encoding. Raw response,
field values and connected array columns preserve every selection. Conflicting
scalar duplicates and multiple inventory-backed selections are rejected before
writes; identical scalar duplicates remain accepted.

Email OTP issuance has a database-enforced 60-second cooldown per normalized
recipient and project, shared across sessions and CIAM callers. Forms returns
429 with `Retry-After: 60` without sending another email. The eight failed-guess
limit persists between requests. Forms verification consumes the OTP, binds the
system customer identity when applicable and stores success in one transaction;
unexpected database errors return 500 and roll back consumption. A denied guess
returns 401 while committing its attempt count. Delivery at challenge start
remains best effort, and a recipient cooldown does not limit bulk requests across
different recipients or IPs.

Successful submission awaits session clearing, customer indexing and any
configured respondent email. Those are internal functions, with no public hook
routes or self-HTTP. A required effect can fail after the response and files have
been persisted: an HTTP failure does not promise that nothing was accepted.
There is no automatic replay or fallback to the editor writer. Remote calls have
bounded deadlines; aborting a call cannot undo an already committed effect.

Storage uploads still go directly to Supabase using signed URLs. Existing public
bucket policy and object URLs are preserved; an authorized metadata endpoint
does not make a public download private.

## Verification and release

The [local Forms proof](../../scripts/forms-local/README.md) builds the actual
Nitro server and exercises it over HTTP against disposable local Supabase,
including real Storage bytes, RLS, OTP delivery recording and connected writes.
It must pass alongside typechecking, unit contracts and Vercel output checks.
`GET /health` is process liveness, not backend or release readiness.

Create a separate API Vercel project with root `apps/api`, Node 24 and access to
workspace files outside that root. Its [configuration](./vercel.json) declares
one Nitro service and a public catch-all ingress that preserves the request path.
The current editor remains a separate project. Check the generated output with
`pnpm --filter @grida/api build`; this does not certify hosted Services ingress.

Before production cutover:

1. Hold automatic editor promotion. Record the previous editor release and the
   candidate API/editor revisions and environment pairing.
2. Apply the [OTP repair migration](../../supabase/migrations/20261002171546_otp_attempts_and_forms_verification.sql)
   through the normal operator-owned database release before deploying this API.
   The generic CIAM verifier keeps its signature and reports invalid codes with
   zero rows; existing callers already deny that result. The new Forms verifier
   must exist before this API serves verification requests.
3. Verify paired hosted previews against an isolated nonproduction backend.
   Exercise real ingress, CORS, payloads, sessions, uploads and required effects.
   Confirm effective abuse controls on the new API origin, including OTP requests
   across recipients/IPs; controls attached to the editor project do not carry
   over automatically. Runner-local loopback URLs are not a hosted preview backend.
4. Build with production-target configuration and make the API ready at its
   intended origin first. Do not promote a preview editor artifact containing a
   different compiled API origin.
5. Promote the matching editor only after API readiness is established. Automated
   agents must not access the production database.
6. If cutover fails, restore the recorded compatible release/configuration pair.
   Preserve accepted data and files; do not replay uncertain submissions or
   restore a database snapshot. Keep the API available for outstanding clients.

The comprehensive Forms/Database/Storage UI move, tenant routing redesign,
account/billing extraction and repository-wide documentation cleanup are later
milestones.
