---
id: TC-DESKTOP-BROWSER-012
title: Development TLS trust binds one browser host and certificate
module: desktop
area: browser
tags: [browser, tls, certificates, local-development, reset]
status: untested
severity: high
date: 2026-11-18
updated: 2026-11-18
automatable: partial
covered_by:
  - desktop/src/main/browser-site-policy.test.ts
  - desktop/src/main/browser-host.test.ts
---

## Behavior

A native certificate choice can trust the exact hostname and X.509 certificate
for the built-in browser session. It does not disable certificate validation
for other certificates, hosts, Desktop sign-in or provider networking. The
fingerprint is the conventional DER SHA-256 fingerprint. Reset forgets the
exception, but cached Chromium trust can require a Grida restart to end fully.

## Steps

1. Open a controlled HTTPS development server with an untrusted certificate,
   including from an initially blank browser tab. Expected: a native prompt
   identifies the hostname, certificate error and SHA-256 fingerprint. Compare
   the fingerprint with the server certificate's DER SHA-256 value.
2. Cancel once, then retry and explicitly trust it. Expected: cancellation does
   not trust the certificate; acceptance allows that host/certificate within
   the isolated browser session.
3. Use a different hostname or change the development certificate. Expected:
   the previous exception does not silently authorize the different pair.
4. While a certificate prompt is open, navigate/close its page or replace the
   owning workbench document. Expected: a late answer grants no replacement
   document authority.
5. Reset website permissions, then repeat the reset. Expected: saved exceptions
   are removed and open pages reload. Once any certificate was accepted, each
   reset still explains that restarting Grida may be needed to end cached trust;
   immediate TLS revocation is not promised.
6. Relaunch Grida and revisit the untrusted server. Expected: the memory-only
   exception is gone and a new trust choice is required. Desktop account and
   provider networking retain their separate certificate policy.

## Notes

This case is untested. A reset returning successfully is not evidence that a
previously cached TLS verification result was immediately revoked.
