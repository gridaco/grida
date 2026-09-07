# Offline AI package proof

> **GRIDA-SEC-004 / GRIDA-SEC-006** — explicit provider transport and scoped GG
> authority are bound by [SECURITY.md](../../SECURITY.md).
> **GRIDA-GG: provider** — this proof never contacts a provider or gateway.

```sh
node scripts/ai-local/proof.mjs
```

Requires Node 24+, its bundled npm, a POSIX `tar`, and the repository's installed
dependencies. It does not install dependencies, read dotenv files, start a
service, use a developer credential store, or change the workspace install graph.

The runner builds current [`@grida/ai`](../../packages/grida-ai/README.md) and
[`@grida/ai-models`](../../packages/grida-ai-models/README.md) into a private
temporary directory. It runs actual `npm pack` with lifecycle scripts disabled,
offline mode, empty npm configuration, and a constructed environment. It then
extracts those archives and copies their declared production dependencies and
required peers from the installed graph. Versions must satisfy the declaring
manifest. Nested dependencies retain their resolution; no workspace symlinks or
application packages are supplied. Optional dependencies absent from the current
platform remain absent.

The public consumer runs once using ESM imports and once using CJS `require`.
Both root and `/providers` exports must work; private media implementations and Grida
agent, daemon, auth, account, CLI, Desktop and framework packages are unavailable.
Synthetic transports exercise OpenRouter, Vercel, fal and scoped GG image
generation and video submit/poll/result chains, input capability discovery, credential-free result downloads,
explicit provider selection, missing credentials, single submission on failure,
safe error projection, cleared GG authority, and video cancellation during a
stalled credential lookup without a late submission. Returned PNG signature bytes
and synthetic video bytes test transport and result contracts, not media decoding
or real model quality. Music exercises both existing GG Lyria models, text/seed
validation, token rotation/clearing, safe failures, bounded responses, and late
response cancellation. It grants no download destination. Synthetic MP3 prefix
bytes test the transport contract without producing or decoding a recording.
Sound effects exercise the existing ElevenLabs BYOK model, exact option forwarding
and omission, key rotation/removal, safe failures, bounded MP3 responses, and
cancellation during key lookup and submission. The provider key never enters a
download lane or result; synthetic signature bytes carry no recording.

Separate `.mts` and `.cts` consumers compile through the packed public exports
with NodeNext resolution, `types: []`, and `skipLibCheck: false`. Source and emitted
declarations are also checked for Node and Grida host imports. This does not
certify every browser/runtime or a standalone npm release: these packages remain
private, and packed `workspace:*` dependencies are supplied explicitly by this
proof. Shipping a public CLI requires bundling or another deliberate distribution
step.

The normal Node dependency branch is preserved. The pinned upstream AI SDK loads
Vercel OIDC helpers that import filesystem modules. Runtime guards allow package
module loading, but reject ambient credential environment lookups and filesystem
state reads, existence/metadata probes, or writes. The pinned OIDC path's
`existsSync`, `readFileSync`, `mkdirSync`, `writeFileSync`, and `chmodSync` operations
are covered. Positive controls verify the guards before the SDK loads; importing
and exercising the SDK must then cause zero rejected accesses. Global fetch,
HTTP/socket and DNS entry points are denied, so only the injected synthetic
transport can service a provider operation. These are test tripwires, not an OS
sandbox or protection against hostile dependency code.

The runner removes its temporary package trees, archives, HOME and build output
on completion or a handled failure. It writes a local, ignored report to
`.cache/ai-local/result.json` containing source hashes, package versions, archive
integrities, case names and counts. It verifies source hashes again at the end so
concurrent source changes cannot receive a successful report. No tokens, prompts,
response bodies or generated media are retained in the report.
