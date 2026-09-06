# @grida/account

Private, experimental `0.0.0`; no compatibility guarantees yet. Explicit
organization selection and passive cached-credit reads, independently usable
by a native host without a CLI, Desktop, or agent.

## Contract

```ts
import { AccountClient } from "@grida/account";

// auth is an existing @grida/auth client; its host owns login and custody.
const account = new AccountClient(auth);
const page = await account.organizations();
const next =
  page.next_cursor === null
    ? null
    : await account.organizations({ after: page.next_cursor });
const selected = await account.selectOrganization({ name: "studio" });
const credits = await account.credits({ id: selected.id });
```

The constructor accepts only the `requestAccount` capability from the public
`@grida/auth` contract and captures one bound callable. The runtime-neutral root
imports `AuthClient` only to recognize its safe failures; auth stays external in
the build so the original error class retains its identity. This package uses
no Node/DOM APIs and owns no transport, credentials, session, or configuration.

`organizations({after?})` returns one `AccountClient.OrganizationsPage`, preserving
the server's cursor. It never walks the list implicitly. A null cursor is the
only completion signal; a short page can still have a continuation.

`selectOrganization(selector?)` accepts exactly `{id: positiveSafeInteger}` or
`{name: canonicalSlug}`. Names contain 1–39 lowercase ASCII letters/digits with
single interior hyphens; a numeric name stays distinct from a numeric ID.
Unknown keys, both keys, malformed values, and throwing getters fail before
network access. Values are captured once before awaiting.

Without a selector, one page must prove exactly one membership. An empty terminal
page raises `no_organizations`. Multiple records or any continuation raises
`organization_required`, with at most ten projected `choices` and an explicit
`choices_truncated` flag. It never chooses the first of several organizations.

An explicit lookup follows at most 100 pages, stopping when it finds the ID or
name. Terminal absence raises `organization_not_found`. Exhausting the budget,
malformed pages, and nonprogressing cursors raise `selection_unavailable`, never
a claim that an unvisited organization does not exist. Each page is bounded to
100 ordered records and projects only `{id,name,display_name}`.

`credits(selector?)` resolves membership then performs the auth producer's fixed
`credits.read` for the selected ID. It returns `AccountClient.Credits` unchanged:
the server's cached USD-cent estimate, observation state, and billing gate.
Null/unobserved balances remain distinct from zero; this package does not infer
eligibility, freshness, or model readiness. It stores no selection. Each call
selects again; pages are separate observations, not a membership snapshot.
Selection is not authorization: the credits server must check membership again,
and a removal between selection and that read can return forbidden.

Account failures are `AccountClient.Failure` with a fixed message and one of
`invalid_input`, `no_organizations`, `organization_required`,
`organization_not_found`, or `selection_unavailable`. Genuine
`AuthClient.Failure` instances pass through unchanged; other capability exceptions
become safe `selection_unavailable` failures. There are no automatic retries,
login prompts, refresh calls, or fallback organizations. Auth alone owns its
existing refresh and credential lifecycle.

## Anti-goals

- No credential/session custody, token access, auth registration, browser launch,
  generic authenticated fetch, or provider integration.
- No stored default organization, browser/Desktop preference, implicit first
  membership selection, or organization-management mutations.
- No billing policy, subscription data, live reconciliation, top-up, formatting,
  currency conversion, GG readiness decision, CLI commands, or UI.
- No configurable page size, traversal budget, plugin registry, or permission engine.

## Verification

Producer-independent tests exercise selection and failures through the narrow
public auth capability. A copied-package test builds current account sources,
copies the shipped auth package into a disposable consumer, and runs ESM/CJS
processes without workspace resolution or network access. It checks selection,
cached zero, and preservation of auth error identity. Typecheck separately
excludes Node/DOM globals from the root. Build emits ESM/CJS and declarations.
