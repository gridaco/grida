---
title: Native account infrastructure
description: Independent Grida login, member-scoped account and credit reads, and shared GG access for native clients.
keywords: [grida, cli, oauth, auth, account, credits, infrastructure]
sidebar_label: Account infrastructure
sidebar_position: 2
tags: [internal, wg, cli, architecture]
format: md
---

# Native account infrastructure

> **Status: accepted architecture.** This specifies the account foundation for
> independent native clients. CLI commands, media execution and npm distribution
> are separate delivery. The replacement CLI has not shipped. See the
> [doctrine](./index.md) for product boundaries.

## Scope and ownership

A native client can sign in, inspect its own account and obtain scoped Grida
Gateway (GG) access with Desktop closed. It uses the same account and organization
authorities as Desktop, with its own session and credential custody.

| Foundation       | Contract                                                                             |
| ---------------- | ------------------------------------------------------------------------------------ |
| Native login     | Browser authorization, protected local sessions, refresh and session-local logout.   |
| Account reads    | Verified identity, organization memberships and passive cached-credit summaries.     |
| Scoped GG access | Exchange verified account authority for a short-lived, organization-scoped AI grant. |

The native client owns login and custody. The account service owns identity and
membership authorization. Billing owns the credit model; GG owns scoped access
and generation authorization. These owners can serve multiple clients without
depending on CLI argument parsing, terminal output, Desktop or an agent runtime.

## Independent account session

The client is a registered first-party public OAuth application. Its client ID
identifies the application, not a trusted installation; it contains no client
secret. Login uses the system browser, authorization code with PKCE, and a
temporary listener on an exact registered loopback address. If its registered
ports are occupied, login fails before opening the browser. Desktop cookies are
not a credential source.

Browser sign-in authorizes a separate native session. Logout clears that session
locally and requests its revocation, reporting any unconfirmed remote result.
Logout also succeeds without a stored session while still preventing an earlier
pending login from restoring it. Revoking an application's grant or signing out
account-wide has broader effects and is a separate action.
Identity scopes do not reduce existing account or organization permissions.

Save one account per trusted local profile. The [credential custody
contract](./credential-custody.md) owns storage selection, refresh coordination
and protection against stale writes. Account reads refresh access when possible;
transient failures remain errors, while unrecoverable authentication requires
explicit login. Reads never start browser login themselves.

## Account and organization reads

Account reads require login and a connection. The native client sends its bearer
credential to fixed Grida account APIs. Direct database queries are outside its
client contract; server authorization and database permissions must still enforce
access independently of that client behavior.

Identity exposes the current account's ID, email and display name. Organization
reads list only its memberships, including an empty list. The account client can
resolve an omitted organization selector only when the membership result proves
there is exactly one. Ambiguity returns choices rather than selecting the first
organization or borrowing Desktop's current selection. Credits and GG requests
still carry an explicit organization ID; the server verifies membership again
when serving the operation.

## Passive credit information

Credit reads never provision a billing account, purchase credit, alter a
subscription or refresh a provider balance. They return the organization,
billing-account presence, provisioning/cache state, a nullable estimate in USD
cents, the cache update time, and cached billing eligibility with a blocked
reason when applicable.

An absent billing account, unprovisioned credits, an unobserved cache and a
recorded zero remain distinguishable. The timestamp records a cache update,
which may include estimated usage deductions; it does not promise a recent
provider reconciliation. An aggregate balance has no single expiry date.
Cached eligibility does not guarantee a generation request will succeed;
generation checks its own current access and availability.

These reads require organization membership. The [billing
WG](../platform/billing/index.md) owns the billing model. Subscription details,
invoices, payment methods and billing mutations are outside this foundation.

## Shared GG access and Desktop compatibility

Native and Desktop sessions authenticate separately, then use the same GG
membership and token-mint policy. Account credentials are not GG grants. A grant
is short-lived, scoped to one organization and kept in memory for an explicit
trusted consumer; account APIs do not accept it as an account session.

The mint allowance is per user across both clients. Exhaustion returns 429. When
a configured limiter fails or times out, minting returns 503 before issuing a
grant. Neither failure signs the user out; existing grants remain subject to
their expiry and normal authorization checks. Successful Desktop token responses
retain their existing contract.

The [GG architecture](../platform/hosted-ai.md) owns the shared access model.
Native account access does not change Desktop's login or provider-key storage.

## Separate product delivery

The branded CLI composes these foundations into commands. Model discovery,
provider credential configuration, media generation, local artifacts, help and
npm distribution belong to that product delivery. They do not need to be present
to verify native login, account reads or scoped GG exchange independently.

Agent and render integration, Canvas, MCP, headless credential provisioning and
multiple-account selection remain outside this account foundation.
