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

1. **Bump the version.** Edit [`desktop/package.json`](https://github.com/gridaco/grida/blob/main/desktop/package.json) `"version"` and commit on `main`. Plain semver only (`0.2.0`, not `desktop-v0.2.0`) — the autoupdate feed runs `semver.valid()` on the tag and silently skips anything else. Don't reuse an existing tag.

2. **Trigger the workflow.**

   ```sh
   gh workflow run realease-desktop-app.yml -R gridaco/grida -f prerelease=false
   ```

   Or via UI: **Actions → Publish Desktop App → Run workflow**.

3. **Approve in the environment gate.** The five platform jobs pause at the
   `release` environment. Open the run in Actions and choose
   **Review deployments → Approve and deploy**.

4. **Review and publish the draft.** The workflow assembles a GitHub draft
   release. Check the notes and built artifacts, then publish it.

5. **Verify the public release.** Check both macOS architectures (ZIP and
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

## Cutting a prerelease

Same as above but with `-f prerelease=true`. The release shows up on GitHub Releases marked as a prerelease and `update.electronjs.org` **skips it for installed users** — prereleases are for manual download / testing only. Useful when you want a build out for QA without auto-shipping it to everyone.

To promote a prerelease to stable: edit the GitHub Release in the UI and uncheck "Set as a pre-release." The feed will pick it up on the next poll (~6h default).

## Hosted renderer compatibility

Desktop patch releases are optional within a supported major and minor
version line. A new major or minor line becomes required for older builds
when the hosted editor activates its minimum supported version. Publishing
a binary and activating the minimum are separate release steps. Patch
releases can advance the installer target while keeping the same minimum.
The bridge protocol and capability checks still govern which calls and
features a compatible Desktop build supports.

The hosted editor serves the policy from `GET /desktop/compatibility`.
Set the following variables on the production editor deployment:

| Variable                        | Value                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GRIDA_DESKTOP_MINIMUM_VERSION` | Start of the supported version line, such as `0.7.0`. Leave it unset during the initial rollout.                                   |
| `GRIDA_DESKTOP_UPDATE_VERSION`  | Exact stable Desktop release with verified installers, such as `0.7.0`. Use a build at or above the minimum when a minimum is set. |

The endpoint returns `minimumSupportedVersion` and `updateVersion` as
version strings or `null`. With both variables unset, the endpoint
publishes an inactive policy. An update version by itself supplies
an optional installer. The hosted layout uses the same policy to give
older clients an update screen with a link to the selected release.
Electron Main checks the policy before opening the hosted editor in
packaged production builds and handles the updater. It accepts the older
hosted deployment's 404 or same-origin `/sign-in?next=/desktop` redirect
during the transition. For a timeout, invalid response, or other failure,
it shows a local connection error with **Retry**. The bundled recovery page and the
native **Check for Updates…** menu work independently of the hosted UI.
The macOS and Windows updater checks the release feed at launch and in the
background. On Linux, manual checks use the installer target from the
policy.

### Activate a version line

1. **Ship the transition first.** Deploy the policy endpoint and hosted
   recovery with the previous minimum, or with the minimum unset on the
   first rollout. Verify the new packaged app against the current hosted
   editor. The first release with Main-owned compatibility checks is
   Desktop `0.7.0`.
2. **Verify that users can upgrade.** Publish the stable release. Open its
   exact release page and verify the installers for macOS arm64/x64,
   Windows x64, and Linux arm64/x64 in both package formats. Check the
   macOS and Windows updater from an older installed build. On Linux,
   verify the manual installer path. Exercise **Check for Updates…**,
   including available, current, and unavailable results. Exercise startup
   recovery and reopening after installation. Confirm that an open document
   can be saved before a user-initiated restart.
3. **Activate the minimum.** The release maintainer coordinates the
   production editor deployment with its deploy owner. Set the verified
   update version and the new minimum alongside any renderer changes that
   require the new line. For the `0.7` activation, set both values to
   `0.7.0` if that is the verified installer. Check the live endpoint and
   launch supported and below-minimum builds. Below-minimum builds should
   reach recovery before incompatible native calls. Builds from the
   supported line should open the editor.

### Roll back the minimum

Restore a hosted renderer that supports the previous line before lowering
the floor, or deploy the compatible renderer and previous policy together.
Keep the verified installer target reachable throughout. Check the live
policy and launch both an older build and an already-upgraded build against
the rollback deployment. If only the installer target was wrong, restore a
verified release that meets the current floor.

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
