---
format: md
---

# Contributing to Grida | Desktop release

This runbook is for Desktop release maintainers with `release` environment
approver rights. macOS and Windows use the
[Electron update feed](https://github.com/electron/update.electronjs.org).
Linux uses DEB and RPM packages.

> Triggering the workflow does **not** ship anything until an approver clicks "Approve and deploy" in the [`release` environment](https://github.com/gridaco/grida/settings/environments) gate.

---

## Cutting a release

1. **Stage the hosted release.** Coordinate with the editor deploy owner
   before the Desktop version bump reaches `main`. In the editor's Vercel
   project, open **Settings → Environments → Production → Branch Tracking**
   and disable **Auto-assign Custom Production Domains**. This keeps the
   current hosted editor live while the release commit builds. Record the
   prior setting and coordinate any other editor promotions during this
   window. [Staged production deployments](https://vercel.com/docs/deployments/promoting-a-deployment#staging-and-promoting-a-production-deployment)

2. **Bump the version and merge.** Set a new stable SemVer version such as
   `0.7.0` in the Desktop manifest and merge the release commit to `main`.
   The Electron build and the hosted editor both use this version. Check
   that the editor deployment for the release commit is staged and that
   the production domain still serves the previous deployment.
   [Desktop manifest](https://github.com/gridaco/grida/blob/main/desktop/package.json)

3. **Trigger the workflow from `main`.**

   ```sh
   gh workflow run realease-desktop-app.yml -R gridaco/grida --ref main -f prerelease=false
   ```

   Or via UI: **Actions → Publish Desktop App → Run workflow**. Confirm
   the run uses the commit selected for the staged editor. If `main`
   advances, review and match both builds to the new release commit.

4. **Approve in the environment gate.** The five platform jobs pause at the
   `release` environment. Open the run in Actions and choose
   **Review deployments → Approve and deploy**.

5. **Review and publish the draft.** The workflow assembles a GitHub draft
   release. Check the notes and built artifacts, then publish it.

6. **Verify the public release.** Check both macOS architectures (ZIP and
   DMG), Windows x64 (EXE and NUPKG), and both Linux architectures (DEB and
   RPM). Confirm the applicable updater feeds return the published version.
   For example, check both macOS architectures with this command.

   ```sh
   for ARCH in arm64 x64; do
     BASE="https://update.electronjs.org/gridaco/grida/darwin-$ARCH"
     echo "== darwin-$ARCH =="
     curl -s -w "\n%{http_code}\n" "$BASE/0.0.0"
     # WANT: 200 + JSON pointing at the new .zip

     curl -s -o /dev/null -w "%{http_code}\n" "$BASE/<just-released-version>"
     # WANT: 204 (no update — correct)
   done
   ```

   If the old-client request returns 204, either the release is marked prerelease or the tag isn't valid semver. See [Troubleshooting](#troubleshooting).

7. **Promote the staged editor.** Confirm the staged deployment's
   `/desktop/compatibility` returns the verified Desktop version, then
   promote that deployment in Vercel. Confirm the production endpoint
   serves the same version and run the [compatibility checks](#verify-compatibility).
   Restore the project's previous auto-assignment setting after checking
   that newer queued deployments serve a verified Desktop release.

## Cutting a prerelease

Use `-f prerelease=true` and keep the hosted deployment staged. The
prerelease is available through GitHub Releases for manual testing. The
Electron updater skips prereleases.

To make it stable, edit the GitHub release and clear **Set as a pre-release**.
Wait for the feed to recognize it, then verify the stable installers and feeds
before promoting the editor.

## Hosted renderer compatibility

The hosted editor serves `{ "desktopVersion": "0.7.0" }` from
`GET /desktop/compatibility`. That version comes from
`desktop/package.json` at build time. Electron Main compares it with its
installed version using the major and minor components. Older version
lines require an update. The same and newer lines may open the editor,
so a patch on the same line is optional. For example, a hosted version
of `0.7.2` admits `0.7.0` and `0.8.0`, while `0.6.9` must update.

Bump at least the minor version for changes to renderer-facing IPC,
including additions, or other native or hosted changes that could break
compatibility. Compatible renderer-only changes and compatible internal
fixes can ship without requiring an update. The bridge protocol and
capability checks govern which native calls and features a Desktop
build supports.

In packaged production builds, Electron Main checks compatibility before
opening the editor and handles the updater. It accepts the older
hosted deployment's 404 or same-origin `/sign-in?next=/desktop` redirect
during the transition. For a timeout, invalid response, or other failure,
it shows a local connection error with **Retry**. The bundled recovery
page and **Check for Updates…** work independently of the hosted UI.
Recovery can open the exact Desktop release page for the hosted version.
macOS and Windows also use the Electron update feed. On Linux, manual
checks look up the latest stable release with packages for the installed
architecture. Download and install the DEB or RPM from its release page.

Desktop `0.7.0` introduces Main-owned checks. Until the matching web
deployment goes live, `0.7.0` can open the previous hosted editor. After
promotion, the hosted layout gives older installations an update screen.

### Verify compatibility

- Before promotion, launch the new packaged Desktop against the live
  hosted editor. Verify the automatic update from an older installed
  build on macOS and Windows. Verify installation from the release page
  on Linux.
- After promotion, launch builds from an older line and the hosted line.
  The older line should reach recovery before making incompatible native
  calls. A same-line patch should open the editor. Verify that a newer
  build can open the renderer before relying on it for rollback.
- Exercise **Check for Updates…**, including available, current, and
  unavailable results. Reopen after installation and confirm that an
  open document can be saved before a user-initiated restart.

### Roll back the hosted editor

Restore the previous compatible production deployment in Vercel. The
renderer and its advertised Desktop version roll back together. Keep
published installers available. Check the live endpoint and launch both
an older build and an already-upgraded build against the restored editor.
[Vercel rollback](https://vercel.com/docs/instant-rollback)

---

## What lives where

| Concern                       | File / location                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow                      | [`.github/workflows/realease-desktop-app.yml`](https://github.com/gridaco/grida/blob/main/.github/workflows/realease-desktop-app.yml) |
| Build + signing config        | [`desktop/forge.config.ts`](https://github.com/gridaco/grida/blob/main/desktop/forge.config.ts)                                       |
| Hardened-runtime entitlements | [`desktop/build/entitlements.mac.plist`](https://github.com/gridaco/grida/blob/main/desktop/build/entitlements.mac.plist)             |
| In-app updater entry point    | [`desktop/src/main.ts`](https://github.com/gridaco/grida/blob/main/desktop/src/main.ts)                                               |
| pnpm native-module allowlist  | [`desktop/pnpm-workspace.yaml`](https://github.com/gridaco/grida/blob/main/desktop/pnpm-workspace.yaml) — `allowBuilds`               |
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
- **`allowBuilds` in `pnpm-workspace.yaml`** (not `package.json`). pnpm 11 replaced the old `onlyBuiltDependencies` list with the `allowBuilds` map and ignores the `pnpm` field in `package.json` entirely. The native deps (`electron`, `electron-winstaller`, `fs-xattr`, `macos-alias`) must be set to `true` so their install scripts run; pnpm otherwise silently disables native module builds. Removing them breaks the DMG maker (`Cannot find module '../build/Release/volume.node'`).
- **macOS builds one arch per runner** — `macos-apple-silicon` (`macos-26`, arm64) and `macos-intel` (`macos-15-intel`, x64) are separate matrix rows, each running a single-arch `publish --arch=…`. Do **not** collapse them into one parallel `--arch="x64,arm64"` invocation: it hits the maker-dmg race (electron/forge#3517 — `hdiutil` EAGAIN + appdmg "Target already exists"), which is why Intel was dropped in the first place (issue #947). Separate native runners also let pnpm resolve each arch's per-platform prebuilds (`@parcel/watcher-darwin-<arch>`). `macos-15-intel` is GitHub's last x86_64 image, retired **Aug 2027** (actions/runner-images#13045); revisit once Forge 8 GA (electron/forge#4082) fixes the race.

---

## Troubleshooting

**`update.electronjs.org` returns 204 for an old client → feed not serving the new release.**

1. Release marked prerelease — uncheck in the UI or re-publish with `prerelease=false`.
2. Tag not valid semver — re-tag with a valid version.
3. No asset matching `<platform>-<arch>` (e.g. `darwin-arm64`) on the release. Check artifact filenames in forge `makers` config.

**Workflow logs: `Cannot find module '../build/Release/volume.node'`**
The native dep is missing from `allowBuilds` (or set to `false`), or the config is in the wrong file. The `allowBuilds` map must be in `desktop/pnpm-workspace.yaml`, not `desktop/package.json` (pnpm 11 ignores the `pnpm` field in `package.json`). See [Hard constraints](#hard-constraints).

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
