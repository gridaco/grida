# Grida Gateway token owner

`GRIDA-SEC-006` / `GRIDA-GG: token`.

`gg.mint(principal, membership)` performs the shared per-user quota check,
asks the trusted membership capability for a verified organization, then signs
one scoped grant. A raw organization is not a mint input. The capability owns
the host's selector and must establish current membership for the supplied user;
the host must authenticate that principal first. No cookie, native OAuth,
Supabase client, provider or billing dependency belongs in this core.

The grant is `{token, expires_at, organization: {id, name}}`. `gg.MintError`
reports `rate_limited`, `no_organization` or `unavailable`. `gg.TokenError` reports signing or
verification failures. Other capability/upstream failures propagate for the
host's safe HTTP mapping; the core does not log credentials or errors.

The dedicated HS256 key, `gg:ai` audience, 900-second token lifetime,
60-second verification tolerance and verify-only previous key retain the
existing contract. The internal `GgTokens` policy receives a clock, signing-key
reader and per-user quota capability; `gg.ts` binds the server implementation.
Verification requires integer issuance/expiry claims, a positive window of at
most 900 seconds, and issuance no more than 60 seconds ahead of the host clock.
`config.ts` alone reads the mint/signing environment. The
10/user/60-second limiter uses the shared `rl:v1-ai:mint` prefix and initializes
once per module. Missing configuration preserves the existing fail-open mint
limiter. When configured, the SDK's five-second timeout allowance and upstream
failures become `unavailable` before membership lookup or signing. Both hosts
return 503 (native `auth_unavailable`, Desktop `mint_failed`); quota exhaustion
returns 429. This deadline bounds the quota decision, not the underlying Redis
work: it may finish later and consume quota, but cannot resume the failed mint.
There is no automatic remint. Minting does not inspect credits.

`gg.sign`, `gg.verify` and `gg.allowMint` retain the trusted low-level contract
through literal aliases at `lib/auth/gg-token.ts`. New authenticated hosts use
`gg.mint`; they must not assemble a second membership/signing policy. The token
is not recalled after mint: membership removal blocks a later mint, while an
already-issued grant retains its expiry window.

Tests use synthetic keys, member capabilities and limiter responses. They pin
policy ordering, denial without signing, shared quota, key failures/rotation,
compatibility exports and the existing Desktop adapter behavior.
