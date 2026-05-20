---
format: md
---

# Contributing to Grida | Desktop release

Runbook for cutting desktop releases — macOS / Windows / Linux signed, notarized, autoupdating via [`update.electronjs.org`](https://github.com/electron/update.electronjs.org). Target audience: maintainers with `release` environment approver rights.

> Triggering the workflow does **not** ship anything until an approver clicks "Approve and deploy" in the [`release` environment](https://github.com/gridaco/grida/settings/environments) gate.

---

## Cutting a release

1. **Bump the version.** Edit [`desktop/package.json`](https://github.com/gridaco/grida/blob/main/desktop/package.json) `"version"` and commit on `main`. Plain semver only (`0.2.0`, not `desktop-v0.2.0`) — the autoupdate feed runs `semver.valid()` on the tag and silently skips anything else. Don't reuse an existing tag.

2. **Trigger the workflow.**

   ```sh
   gh workflow run realease-desktop-app.yml -R gridaco/grida -f prerelease=false
   ```

   Or via UI: **Actions → Publish Desktop App → Run workflow**.

3. **Approve in the environment gate.** Each platform job (mac/win/linux) pauses at the `release` environment. Open the run in Actions and click "Review deployments → Approve and deploy."

4. **Verify.** When the run finishes, the GitHub Release page has `Grida-darwin-arm64-<version>.zip`, `Grida-darwin-x64-<version>.zip`, the `.dmg` siblings, Windows `.exe` + nupkg, and Linux `.deb` / `.rpm`. Confirm the feed serves it:

   ```sh
   BASE=https://update.electronjs.org/gridaco/grida/darwin-arm64
   curl -s -w "\n%{http_code}\n" "$BASE/0.0.0"
   # WANT: 200 + JSON pointing at the new .zip

   curl -s -o /dev/null -w "%{http_code}\n" "$BASE/<just-released-version>"
   # WANT: 204 (no update — correct)
   ```

   If the old-client request returns 204, either the release is marked prerelease or the tag isn't valid semver. See [Troubleshooting](#troubleshooting).

## Cutting a prerelease

Same as above but with `-f prerelease=true`. The release shows up on GitHub Releases marked as a prerelease and `update.electronjs.org` **skips it for installed users** — prereleases are for manual download / testing only. Useful when you want a build out for QA without auto-shipping it to everyone.

To promote a prerelease to stable: edit the GitHub Release in the UI and uncheck "Set as a pre-release." The feed will pick it up on the next poll (~6h default).

---

## What lives where

| Concern                       | File / location                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow                      | [`.github/workflows/realease-desktop-app.yml`](https://github.com/gridaco/grida/blob/main/.github/workflows/realease-desktop-app.yml) |
| Build + signing config        | [`desktop/forge.config.ts`](https://github.com/gridaco/grida/blob/main/desktop/forge.config.ts)                                       |
| Hardened-runtime entitlements | [`desktop/build/entitlements.mac.plist`](https://github.com/gridaco/grida/blob/main/desktop/build/entitlements.mac.plist)             |
| In-app updater wiring         | [`desktop/src/main.ts`](https://github.com/gridaco/grida/blob/main/desktop/src/main.ts) — `updateElectronApp({ notifyUser: true })`   |
| pnpm native-module allowlist  | [`desktop/pnpm-workspace.yaml`](https://github.com/gridaco/grida/blob/main/desktop/pnpm-workspace.yaml) — `onlyBuiltDependencies`     |
| Apple secrets                 | `release` environment on `gridaco/grida` — `gh secret list --env release --repo gridaco/grida`                                        |

Secrets (all 6 env-scoped, not repo-wide):

```text
APPLE_CERTIFICATE_P12         base64 of the .p12
APPLE_CERTIFICATE_PASSWORD    .p12 export password
APPLE_SIGNING_IDENTITY        "Developer ID Application: <Name> (TEAMID)" (no quotes)
APPLE_API_KEY_P8              raw .p8 PEM contents
APPLE_API_KEY_ID              10-char Key ID (also in .p8 filename)
APPLE_API_ISSUER              Issuer UUID — App Store Connect → Integrations
```

Rotating any of these is a `gh secret set <NAME> --env release --repo gridaco/grida` away. The code reads from env vars only — no code changes needed when secrets rotate.

---

## Hard constraints

These are silent footguns. Pinned, do not change without a plan:

- **`appBundleId: "co.grida.desktop"`** in `forge.config.ts`. Changing it strands every installed user (Squirrel won't apply updates across bundle-id boundaries). Insiders use `co.grida.insiders` — separate track on purpose.
- **Plain semver tags.** `update.electronjs.org` skips tags that don't pass `semver.valid()`. No `desktop-v…` or other prefixes.
- **`hardenedRuntime: true`** in `osxSign.optionsForFile`. Required for notarization; required for the entitlements plist to apply.
- **`onlyBuiltDependencies` in `pnpm-workspace.yaml`** (not `package.json`). pnpm 10 silently disables native module builds without it; in pnpm 10, when both files exist, only the workspace file's list is consulted. Removing it breaks the DMG maker (`Cannot find module '../build/Release/volume.node'`).

---

## Troubleshooting

**`update.electronjs.org` returns 204 for an old client → feed not serving the new release.**

1. Release marked prerelease — uncheck in the UI or re-publish with `prerelease=false`.
2. Tag not valid semver — re-tag with a valid version.
3. No asset matching `<platform>-<arch>` (e.g. `darwin-arm64`) on the release. Check artifact filenames in forge `makers` config.

**Workflow logs: `Cannot find module '../build/Release/volume.node'`**
`onlyBuiltDependencies` is missing or in the wrong file. Must be in `desktop/pnpm-workspace.yaml`, not `desktop/package.json`. See [Hard constraints](#hard-constraints).

**Workflow logs: `Error parsing workflow file ... HTTP 422` on `workflow_dispatch`.**
A step `if:` references `${{ secrets.* }}` directly — not allowed. Map secrets to job-level `env:` booleans (`HAS_SIGNING: ${{ secrets.APPLE_CERTIFICATE_P12 != '' }}`) and gate on `env.HAS_SIGNING == 'true'`.

**Notarization rejects the upload (`The signature does not include a secure timestamp` or similar).**
Hardened runtime not enabled, or entitlements plist not applied. Check `forge.config.ts` `osxSign.optionsForFile` returns `hardenedRuntime: true` and points at [`build/entitlements.mac.plist`](https://github.com/gridaco/grida/blob/main/desktop/build/entitlements.mac.plist).

**Squirrel error in user logs: `Code signature at URL ... did not pass validation`.**
The downloaded update's signature doesn't satisfy the installed app's Designated Requirement. Most likely the Team ID changed — see [Apple credential rotation](#apple-credential-rotation). For the existing fleet, a manual reinstall is the only path forward.

---

## Local end-to-end test (when changing release config)

When editing `forge.config.ts`, `entitlements.mac.plist`, the workflow, or the pnpm allowlist — run a full local signed+notarized build before merging. Catches the same failures CI would hit without burning the notary quota or polluting the Releases tab.

Assumes you have the cert and API key under `~/.applesecrets/` (or wherever; adjust paths).

```sh
# Temp keychain — mirrors what apple-actions/import-codesign-certs does in CI
KEYCHAIN="$TMPDIR/grida-build.keychain-db"
KCPASS="$(uuidgen)"
security create-keychain -p "$KCPASS" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$KCPASS" "$KEYCHAIN"
security import ~/.applesecrets/certificate.p12 \
  -P "$(tr -d '\n' < ~/.applesecrets/p12password)" \
  -A -t cert -f pkcs12 -k "$KEYCHAIN" >/dev/null
security set-key-partition-list -S apple-tool:,apple: -s -k "$KCPASS" "$KEYCHAIN" >/dev/null
EXISTING="$(security list-keychains -d user | tr -d '"' | xargs)"
security list-keychains -d user -s "$KEYCHAIN" $EXISTING

# Env (forge reads these)
export APPLE_SIGNING_IDENTITY="$(tr -d '"\n' < ~/.applesecrets/codesigning-identity-string-with-quotes)"
export APPLE_API_KEY="$HOME/.applesecrets/AuthKey_XXXXXXXXXX.p8"
export APPLE_API_KEY_ID="XXXXXXXXXX"
export APPLE_API_ISSUER="<uuid>"

# Build — does NOT publish
cd desktop && pnpm make --arch=arm64

# Verify the .app
APP="out/Grida-darwin-arm64/Grida.app"
codesign --verify --deep --strict --verbose=2 "$APP"   # valid on disk + satisfies DR
spctl -a -vvv -t install "$APP"                        # accepted + source=Notarized Developer ID
xcrun stapler validate "$APP"                          # "validate action worked"

# Cleanup
security list-keychains -d user -s $EXISTING
security delete-keychain "$KEYCHAIN"
```

Notarization takes 1–5 minutes. Forge calls `notarytool` and waits.

> `pnpm make` builds locally only. `pnpm run publish:prerelease` pushes to GitHub Releases — **don't run that locally.** Releases go through the workflow.

---

## Apple credential rotation

The 6 secrets above are independent of code. Rotating a cert, switching the App Store Connect API key, or moving to a different Apple Developer account is a `gh secret set` for each value. No code changes.

> [!WARNING]
> If the new cert has a **different Team ID** from the previous one, autoupdate breaks for existing installs: Squirrel.Mac validates each update against the installed app's Designated Requirement (which includes Team ID), the check fails, the update is silently rejected. Existing users keep working on their last build with the old Team ID but stop receiving updates — they must manually re-download from grida.co to get on the new track.
>
> If a Team ID change is planned: add an in-app banner ("this version stopped receiving updates, please reinstall") _before_ you rotate, so existing users see your messaging while still on the old build. `appBundleId` is independent of Team ID and stays stable across rotations.
