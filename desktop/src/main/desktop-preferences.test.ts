// GRIDA-SEC-005 — native preference persistence and forward-safety pins.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DesktopPreferences } from "./desktop-preferences";

describe("DesktopPreferences", () => {
  let userDataPath: string;

  beforeEach(async () => {
    userDataPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "grida-desktop-preferences-")
    );
  });

  afterEach(async () => {
    await fs.rm(userDataPath, { recursive: true, force: true });
  });

  it("starts with onboarding incomplete without eagerly creating a file", async () => {
    const preferences = await createPreferences();

    expect(preferences.isOnboardingComplete()).toBe(false);
    expect(preferences.needsLegacyRendererOnboardingMigration()).toBe(true);
    await expect(fs.access(filePath())).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("migrates renderer onboarding completion exactly once", async () => {
    const preferences = await createPreferences();

    await preferences.completeLegacyRendererOnboardingMigration(true);

    expect(preferences.isOnboardingComplete()).toBe(true);
    expect(preferences.needsLegacyRendererOnboardingMigration()).toBe(false);
    await expect(readPersisted()).resolves.toEqual({
      schema_version: 1,
      onboarding: {
        completed_version: DesktopPreferences.onboarding_version,
      },
      migrations: {
        renderer_onboarding_v1: true,
      },
    });

    await preferences.resetOnboarding();
    expect(preferences.isOnboardingComplete()).toBe(false);
    expect(preferences.needsLegacyRendererOnboardingMigration()).toBe(false);
  });

  it("records an absent renderer completion without completing onboarding", async () => {
    const preferences = await createPreferences();

    await preferences.completeLegacyRendererOnboardingMigration(false);

    expect(preferences.isOnboardingComplete()).toBe(false);
    expect(preferences.needsLegacyRendererOnboardingMigration()).toBe(false);
    await expect(readPersisted()).resolves.toMatchObject({
      onboarding: { completed_version: 0 },
      migrations: { renderer_onboarding_v1: true },
    });
  });

  it("persists versioned onboarding completion across instances", async () => {
    const preferences = await createPreferences();
    await preferences.completeOnboarding();

    expect((await createPreferences()).isOnboardingComplete()).toBe(true);
    await expect(readPersisted()).resolves.toEqual({
      schema_version: 1,
      onboarding: {
        completed_version: DesktopPreferences.onboarding_version,
      },
      migrations: {
        renderer_onboarding_v1: true,
      },
    });
  });

  it.runIf(process.platform !== "win32")(
    "writes owner-only preferences where file modes are supported",
    async () => {
      const preferences = await createPreferences();
      await preferences.completeOnboarding();

      const stat = await fs.stat(filePath());
      expect(stat.mode & 0o777).toBe(0o600);
    }
  );

  it("serializes mutations in invocation order", async () => {
    const preferences = await createPreferences();

    await Promise.all([
      preferences.completeOnboarding(),
      preferences.resetOnboarding(),
    ]);

    expect(preferences.isOnboardingComplete()).toBe(false);
    await expect(readPersisted()).resolves.toMatchObject({
      onboarding: { completed_version: 0 },
    });
  });

  it("publishes memory only after a durable write and recovers its queue", async () => {
    const blockedPath = path.join(userDataPath, "blocked");
    const preferences = await DesktopPreferences.open({
      user_data_path: blockedPath,
    });
    await fs.writeFile(blockedPath, "not a directory");

    await expect(preferences.completeOnboarding()).rejects.toThrow(
      /ENOTDIR|not a directory/i
    );
    expect(preferences.isOnboardingComplete()).toBe(false);

    await fs.rm(blockedPath);
    await fs.mkdir(blockedPath);
    await expect(preferences.completeOnboarding()).resolves.toBeUndefined();
    expect(preferences.isOnboardingComplete()).toBe(true);
  });

  it("resets onboarding without clearing unrelated schema state", async () => {
    await fs.writeFile(
      filePath(),
      JSON.stringify({
        schema_version: 1,
        onboarding: {
          completed_version: 1,
          future_onboarding_field: true,
        },
        another_preference: { enabled: true },
      })
    );
    const preferences = await createPreferences();

    await preferences.resetOnboarding();

    expect(preferences.isOnboardingComplete()).toBe(false);
    await expect(readPersisted()).resolves.toEqual({
      schema_version: 1,
      onboarding: {
        completed_version: 0,
        future_onboarding_field: true,
      },
      migrations: {
        renderer_onboarding_v1: true,
      },
      another_preference: { enabled: true },
    });
  });

  it("migrates the former native onboarding file once", async () => {
    await fs.writeFile(
      path.join(userDataPath, "onboarding.json"),
      JSON.stringify({ version: 1, completed: true })
    );

    expect((await createPreferences()).isOnboardingComplete()).toBe(true);
    expect(
      (await createPreferences()).needsLegacyRendererOnboardingMigration()
    ).toBe(false);

    const preferences = await createPreferences();
    await preferences.resetOnboarding();
    expect((await createPreferences()).isOnboardingComplete()).toBe(false);
  });

  it.each([
    ["malformed JSON", "{"],
    [
      "a stale schema",
      JSON.stringify({
        schema_version: 0,
        onboarding: { completed_version: 1 },
      }),
    ],
  ])("fails open to incomplete onboarding for %s", async (_label, content) => {
    await fs.writeFile(filePath(), content);

    expect((await createPreferences()).isOnboardingComplete()).toBe(false);
  });

  it("reads but never overwrites a newer compatible schema", async () => {
    const future = {
      schema_version: 2,
      onboarding: {
        completed_version: 0,
        future_onboarding_field: true,
      },
      future_preference: { enabled: true },
    };
    await fs.writeFile(filePath(), JSON.stringify(future));

    const preferences = await createPreferences();

    expect(preferences.isOnboardingComplete()).toBe(true);
    expect(preferences.needsLegacyRendererOnboardingMigration()).toBe(false);
    await expect(preferences.resetOnboarding()).rejects.toThrow(
      "written by a newer Grida version"
    );
    await expect(readPersisted()).resolves.toEqual(future);
  });

  it("skips unknown future onboarding without overwriting its file", async () => {
    const future = {
      schema_version: 2,
      first_run: { state: "future-shape" },
    };
    await fs.writeFile(filePath(), JSON.stringify(future));

    const preferences = await createPreferences();

    expect(preferences.isOnboardingComplete()).toBe(true);
    expect(preferences.needsLegacyRendererOnboardingMigration()).toBe(false);
    await expect(preferences.completeOnboarding()).rejects.toThrow(
      "written by a newer Grida version"
    );
    await expect(readPersisted()).resolves.toEqual(future);
  });

  async function createPreferences(): Promise<DesktopPreferences> {
    return await DesktopPreferences.open({ user_data_path: userDataPath });
  }

  async function readPersisted(): Promise<unknown> {
    return JSON.parse(await fs.readFile(filePath(), "utf8"));
  }

  function filePath(): string {
    return path.join(userDataPath, "preferences.json");
  }
});
