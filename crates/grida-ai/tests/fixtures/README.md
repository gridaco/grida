# Migration contract vectors

`media-wire-vectors.json` records synthetic provider request/response exchanges
and public results for all 112 bundled operations. `input-vectors.jsonl` records
valid, missing, malformed and boundary inputs through the TypeScript public
parser. `error-vectors.jsonl` records status, malformed responses, hostile origins,
observed receipts and cancellation failures. The Rust tests replay these without contacting providers or accounts.

Generate or verify against the immutable TypeScript reference prepared by the
repository conformance runner:

```sh
node scripts/conformance/catalogue-media.mjs --reference --check
node scripts/conformance/catalogue-inputs.mjs --reference --check
node scripts/conformance/catalogue-errors.mjs --reference --check
```

Omit `--check` only for a reviewed baseline update. Omit `--reference` to check
the current TypeScript consumers against the same recorded contracts. The
reference revision and digest are owned by `scripts/conformance/baseline.json`.
Fixtures do not claim provider availability or live account entitlement.

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
the pinned SDK's model protocol. Native video `FirstSseEvent` completion is
asserted separately from TS request metadata.
Negative controls deliberately change headers, bodies, completion and multipart
boundaries to prove that the comparison rejects them.

CI verifies the checked-in baseline; it does not accept or re-record new
expectations automatically. Header/body projections must stay explicit and
reviewable. The reference's source and every pinned package's complete built
`dist` tree are fingerprinted before execution, including the CJS chunks and
model data consumed by these scripts. Run `prepare.mjs` to rebuild the reference
after changing fingerprint coverage, never merely replace its build digest.
