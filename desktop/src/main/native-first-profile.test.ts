// GRIDA-SEC-004 / GRIDA-SEC-005 — disposable managed profile fixtures.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProtectedRoots } from "@grida/daemon/server";
import { afterEach, expect, it, vi } from "vitest";
import { NativeFirstProfile } from "./native-first-profile";

const roots: string[] = [];
const ordinary = { supported: true, allowBirth: false };
const provisioning = { ...ordinary, allowBirth: true };

function fixture() {
  const appData = fs.mkdtempSync(
    path.join(fs.realpathSync.native(os.tmpdir()), "grida-first-profile-")
  );
  roots.push(appData);
  const old = path.join(appData, "Grida");
  const source = path.join(old, "sessions.db");
  fs.mkdirSync(old, { mode: 0o700 });
  fs.writeFileSync(source, "existing data", { mode: 0o600 });
  return { appData, source, legacy: () => new ProtectedRoots([old]) };
}

/** A managed predecessor build recorded its profile with a version-2 receipt
 * over the same directory identities. This build never writes one. */
function predecessorReceipt(
  appData: string,
  legacy: () => ProtectedRoots
): void {
  const paths = NativeFirstProfile.open(appData, legacy, provisioning)!;
  const record = path.join(paths.root, "profile.json");
  const bytes = fs.readFileSync(record, "utf8");
  fs.writeFileSync(record, bytes.replace('"version":1', '"version":2'));
}

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

it.skipIf(!process.geteuid?.())(
  "reopens a predecessor-recorded profile for cutover and makes promotion exact and sticky",
  () => {
    const { appData, legacy, source } = fixture();
    predecessorReceipt(appData, legacy);
    const successor = NativeFirstProfile.open(appData, legacy, ordinary)!;
    expect(successor.mode).toBe("cutover");
    const promotion = {
      sourceId: "a".repeat(64),
      scratchId: "b".repeat(64),
      claimId: "f345a176-3d02-45ab-b2af-1f44f6fa44e1",
    };
    NativeFirstProfile.beginPromotion(successor, promotion);
    NativeFirstProfile.beginPromotion(successor, promotion);
    expect(NativeFirstProfile.open(appData, legacy, ordinary)).toEqual(
      successor
    );
    expect(() =>
      NativeFirstProfile.beginPromotion(successor, {
        ...promotion,
        claimId: "d3c5bcb1-555b-4374-ad7e-716cf44b1d7c",
      })
    ).toThrow("native_first_profile_invalid");
    expect(fs.readFileSync(source, "utf8")).toBe("existing data");
  }
);

it.skipIf(!process.geteuid?.())("creates only native receipts", () => {
  const { appData, legacy } = fixture();
  const paths = NativeFirstProfile.open(appData, legacy, provisioning)!;
  expect(paths.mode).toBe("native");
  expect(() =>
    NativeFirstProfile.beginPromotion(paths, {
      sourceId: "a".repeat(64),
      scratchId: "b".repeat(64),
      claimId: "f345a176-3d02-45ab-b2af-1f44f6fa44e1",
    })
  ).toThrow("native_first_profile_invalid");
});

it.skipIf(!process.geteuid?.())(
  "only the managed build can create a scope, and ordinary Stable can reopen it",
  () => {
    const { appData, legacy, source } = fixture();
    const lazyLegacy = vi.fn<typeof legacy>(legacy);
    expect(
      NativeFirstProfile.open(appData, lazyLegacy, ordinary)
    ).toBeUndefined();
    expect(
      NativeFirstProfile.open(appData, lazyLegacy, {
        ...ordinary,
        supported: false,
      })
    ).toBeUndefined();
    expect(lazyLegacy).not.toHaveBeenCalled();
    expect(fs.readdirSync(appData)).toEqual(["Grida"]);
    const paths = NativeFirstProfile.open(appData, legacy, provisioning)!;
    fs.writeFileSync(path.join(paths.browser, "retained"), "native state");
    expect(NativeFirstProfile.open(appData, legacy, ordinary)).toEqual(paths);
    const hasLegacyInstall = vi.fn<() => boolean>(() => true);
    expect(
      NativeFirstProfile.open(appData, legacy, {
        ...provisioning,
        hasLegacyInstall,
      })
    ).toEqual(paths);
    expect(hasLegacyInstall).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(paths.browser, "retained"), "utf8")).toBe(
      "native state"
    );
    expect(fs.readFileSync(source, "utf8")).toBe("existing data");
    expect(() =>
      NativeFirstProfile.open(appData, legacy, {
        supported: false,
        allowBirth: false,
      })
    ).toThrow("native_first_profile_invalid");
  }
);

it.skipIf(!process.geteuid?.())(
  "refuses partial roots, replaced stores, and aliased legacy homes",
  () => {
    const { appData, legacy } = fixture();
    const managed = path.join(appData, "Grida Native");
    fs.mkdirSync(managed, { mode: 0o700 });
    for (const policy of [ordinary, provisioning])
      expect(() => NativeFirstProfile.open(appData, legacy, policy)).toThrow(
        /ENOENT/
      );
    expect(fs.readdirSync(managed)).toEqual([]);
    fs.rmdirSync(managed);

    const denyManaged = () => new ProtectedRoots([managed]);
    expect(() =>
      NativeFirstProfile.open(appData, denyManaged, provisioning)
    ).toThrow("native_first_profile_invalid");
    expect(fs.existsSync(managed)).toBe(false);
    fs.symlinkSync(path.join(appData, "Grida"), managed);
    expect(() =>
      NativeFirstProfile.open(appData, legacy, provisioning)
    ).toThrow("native_first_profile_invalid");
    fs.unlinkSync(managed);

    const paths = NativeFirstProfile.open(appData, legacy, provisioning)!;
    fs.renameSync(paths.browser, paths.browser + "-preserved");
    fs.mkdirSync(paths.browser, { mode: 0o700 });
    expect(() => NativeFirstProfile.open(appData, legacy, ordinary)).toThrow(
      "native_first_profile_invalid"
    );
    fs.rmdirSync(paths.browser);
    fs.renameSync(paths.browser + "-preserved", paths.browser);
    expect(NativeFirstProfile.open(appData, legacy, ordinary)).toEqual(paths);
    fs.writeFileSync(path.join(managed, "profile.json"), "incomplete");
    expect(() =>
      NativeFirstProfile.open(appData, legacy, provisioning)
    ).toThrow("native_first_profile_invalid");
  }
);
