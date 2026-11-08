# Provider contract vectors

`media-wire-vectors.json` records synthetic provider request/response exchanges
and public results for all installed adapter operations. `input-vectors.jsonl` records
valid, missing, malformed and boundary inputs through the TypeScript public
parser. `error-vectors.jsonl` records status, malformed responses, hostile origins,
observed receipts and cancellation failures. The Rust tests replay these without contacting providers or accounts.

Verify the reviewed fixtures against the current TypeScript SDK consumers:

```sh
pnpm exec turbo run build --filter=@grida/ai...
node scripts/cli-contracts/catalogue-media.mjs --check
node scripts/cli-contracts/catalogue-inputs.mjs --check
node scripts/cli-contracts/catalogue-errors.mjs --check
```

Omit `--check` only for a reviewed baseline update. The fixtures were first
established during the TS-to-Rust migration; Git history preserves their
provenance. Current Rust and TypeScript consumers must satisfy the same recorded
contracts. The operation inventory is derived from the current SDK descriptors,
so newly advertised operations require coverage. No historical CLI checkout is
needed. Fixtures do not claim provider availability or live account entitlement.

Both successful and fault replays use the same strict request comparison. All
native request headers are compared, including Content-Type, Accept and absence
of credentials on downloads. JSON object key order is insignificant. Multipart
boundaries are normalized only after checking that the header and body's opening
and closing delimiters agree, with exact file metadata and bytes preserved.
When a fault response changes an accepted server-selected polling/result URL,
subsequent expectations follow that explicit URL; all other request fields remain
fixed. Unknown headers or extra requests fail.

The TypeScript projector excludes only the SDK-specific `user-agent` on the exact
Vercel image/video model routes. The native implementation preserves and asserts
`ai-gateway-auth-method: api-key` and `ai-gateway-protocol-version: 0.0.1`, matching
the reviewed SDK model protocol. Native video `FirstSseEvent` completion is
asserted separately from TS request metadata.
Negative controls deliberately change headers, bodies, completion and multipart
boundaries to prove that the comparison rejects them.

`gateway-discovery.json` is a small synthetic current GG offering used by the
installed native process proof. Dynamic GG image/video/music use that public
metadata protocol instead of frozen model-by-model wire vectors. The Rust GG
unit tests separately cover changing IDs, supported-interface intersection,
credential-free discovery, mutation resistance, original-job polling and no paid
retry. The static matrix retains BYOK and explicit native Tripo upload/rigging
adapters.

CI verifies the checked-in baseline; it does not accept or re-record new
expectations automatically. Header/body projections must stay explicit and
reviewable. Review any intended behavior change and update only the relevant
expectations; do not regenerate fixtures to hide a regression in either consumer.
