# Native account custody v1

**GRIDA-SEC-010** — every identity, token, registration and path is synthetic.

`custody.json` freezes the account-custody format used by the TypeScript CLI
0.2.0 at revision `b26ede1d62e21a0e24d52030538b8f7288ec9b4b`. It records the
ordered profile-hash preimage, file metadata, keyring metadata, a signed-in
keyring record, and a secret-free logout tombstone. The wire objects deliberately
retain their original camelCase keys; fixture metadata uses snake_case.

Current TypeScript and Rust process tests read the old file form. Rust custody
tests also read the keyring records through an in-memory backend. Tests replace
only the explicitly synthetic home binding with an owned temporary path and
recompute that profile's hash. The fixed preimage/hash is checked separately.
No existing account, native keychain or remote service is involved.

These bytes are compatibility input, not output regenerated from the current
serializer. Change them only as a reviewed versioned protocol decision. Current
TS/Rust process and native-keyring pairings separately cover locking, rotating
sessions, restart, and logout revisions across the continuing implementations.
