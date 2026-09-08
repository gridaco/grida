# Installed CLI media proof

> **GRIDA-SEC-013 / GRIDA-SEC-006** — synthetic provider authority and an owned GG HTTP fixture.
> **GRIDA-GG: token** — fresh synthetic scoped grants stay in invocation memory.
> See [SECURITY.md](https://github.com/gridaco/grida/blob/main/SECURITY.md).

This proof packs and installs the real private `grida` package, then invokes its
bin in independent Node processes with an isolated home and environment. It
copies the built artifact; build current workspace dependencies and the CLI
before running it. No source import or replacement custody implementation is used.

```sh
pnpm --filter grida... build
node scripts/cli-media-local/proof.mjs
node --test scripts/cli-media-local/network.test.mjs scripts/cli-local/network.test.mjs
```

Node 24+, its bundled npm, and permission to bind the owned loopback API port
`3041` plus at least one registered callback port (`55435` or `55436`) are required.
An occupied API port or both occupied callback ports fail the proof; it does not
stop or adopt another service. npm installation is offline, ignores lifecycle scripts,
and omits the optional keyring binding. No Docker or hosted service is needed.

The proof checks offline discovery and schemas, explicit provider presence and
stdin keys, shared TOML configuration/removal across restarts and concurrent
processes, overrides that bypass corrupt storage, stored-key generation,
image/video/music/SFX/speech/3D artifacts and receipts, paginated voice
projection, every existing 3D input contract, invalid-input/output preflight,
access-denied errors and cancellation without retry. The GG fixture checks the
account token on account/mint routes and a distinct scoped token on media routes.
Independent music processes remint; GG credentials are absent from durable
profile files. Tiny signature bytes prove byte transport and persistence, not
media codec validity.

Provider configuration uses distinct synthetic keys and the real SDK credential
policy. OpenRouter, Vercel and fal each make exactly one authenticated registration
read against their fixed synthetic key/credits/pricing response. ElevenLabs makes
no registration request and reports `not_supported`. Accepted checks report only
safe verification metadata; they do not establish remaining credits or future
generation access. Rejected, denied, rate-limited and malformed responses preserve
the existing credential file byte for byte. Invalid formats and placeholders from
stdin, environment and manually edited owned TOML fail before DNS. Provider lists,
availability reads and removal make no verification request; generation fixtures
permit only the media operation's own requests.

Provider DNS and HTTPS sockets are synthetic. The preload asserts the actual
CLI transport's destination, credential lane, pinned lookup and TLS options,
then supplies bounded synthetic responses. A failed wire assertion is recorded
separately and cannot pass as an expected CLI error. Raw sockets, TLS, other DNS
families, subprocesses and module resolution outside the installation remain
tripwired by the reused
[base CLI guard](https://github.com/gridaco/grida/blob/main/scripts/cli-local/network.cjs).
The extension permits actual client TCP only to the owned `127.0.0.1:3041` listener.
These guards are test instrumentation, not an OS sandbox or a complete filesystem
access monitor.

The OAuth code exchange is synthetic; manual login uses the real native callback
and production file-custody owner. Auth identity, membership, scoped mint and GG
media requests use the owned HTTP listener. This tests installed composition,
not Supabase issuer/consent/RLS/signature security, TLS certificate handling, or
provider acceptance. The existing
[local OAuth proof](https://github.com/gridaco/grida/tree/main/scripts/auth-local)
owns real local Supabase verification. No provider account, paid request, ambient
credential, system browser or OS keyring is used here.

The runner bounds children, closes its listeners and removes its source copy,
installation, profiles and outputs before writing the ignored safe report at
`.cache/cli-media-local/result.json`. The report records source/dist hashes,
archive/bin hashes, runtime, passed cases and safe request paths. It contains no
credential contents or model inputs. This run is platform evidence for the actual
reported Node/platform combination, not certification of every supported OS.
