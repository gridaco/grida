// GRIDA-SEC-004 / GRIDA-SEC-008 / GRIDA-SEC-014 — shared custody and legacy retirement.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderCredentialStore } from "@grida/auth/providers";
import { AuthStore, type OAuthEntry } from "./auth/file";
import { SecretsStore } from "./secrets";

let home: string;
let state: string;
let filename: string;
const oauth: OAuthEntry = {
  type: "oauth",
  access: "synthetic-access",
  refresh: "synthetic-refresh",
  expires: 123456,
  account_id: "synthetic-account",
  metadata: { preserved: "yes" },
};

beforeEach(async () => {
  home = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "grida-provider-adoption-"))
  );
  state = path.join(home, "agent");
  await fs.mkdir(state, { mode: 0o755 });
  filename = path.join(state, "auth.json");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await fs.rm(home, { recursive: true, force: true });
});

async function legacy(value: unknown): Promise<void> {
  await fs.writeFile(filename, JSON.stringify(value), { mode: 0o600 });
}
function host() {
  return new SecretsStore(new AuthStore(state), home);
}
function canonical() {
  return new ProviderCredentialStore({ home });
}

describe("shared native provider adoption", () => {
  it("moves only API keys, preserves OAuth and retires private crash remnants", async () => {
    await legacy({
      fal: { type: "api", key: "synthetic-fal", metadata: { old: "metadata" } },
      chatgpt: oauth,
    });
    const orphan = path.join(state, ".auth.json.0123456789abcdef.tmp");
    await fs.writeFile(orphan, "synthetic-old-key", { mode: 0o600 });
    const unrelated = path.join(state, "keep.tmp");
    await fs.writeFile(unrelated, "unrelated");
    expect(await host()._getKey("fal")).toBe("synthetic-fal");
    expect(await canonical().read("fal")).toBe("synthetic-fal");
    expect(JSON.parse(await fs.readFile(filename, "utf8"))).toEqual({
      chatgpt: oauth,
    });
    await expect(fs.stat(orphan)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(unrelated, "utf8")).toBe("unrelated");
    expect((await fs.stat(state)).mode & 0o777).toBe(0o755);
    expect((await fs.stat(path.join(home, "providers"))).mode & 0o777).toBe(
      0o700
    );
  });

  it("keeps existing canonical values and removal-before-migration fences", async () => {
    await legacy({
      fal: { type: "api", key: "old-fal" },
      elevenlabs: { type: "api", key: "old-eleven" },
    });
    await canonical().set("fal", "new-fal");
    await canonical().remove("elevenlabs");
    expect(await host()._getKey("fal")).toBe("new-fal");
    expect(await host().has("elevenlabs")).toBe(false);
    expect(JSON.parse(await fs.readFile(filename, "utf8"))).toEqual({});
  });

  it("observes independent-client rotation/removal and host writes survive restart", async () => {
    const first = host();
    await first.set("fal", "first-key");
    await canonical().set("fal", "rotated-key");
    expect(await first._getKey("fal")).toBe("rotated-key");
    await canonical().remove("fal");
    expect(await first.has("fal")).toBe(false);
    await host().set("vercel", "new-vercel");
    expect(await canonical().read("vercel")).toBe("new-vercel");
    await host().delete("vercel");
    expect(await canonical().read("vercel")).toBeNull();
  });

  it("never consults retired legacy data again or resurrects a removed key", async () => {
    await legacy({ fal: { type: "api", key: "old-key" } });
    await host().has("fal");
    await canonical().remove("fal");
    // Simulates an unsupported old application's later stale write.
    await legacy({ fal: { type: "api", key: "resurrection-key" } });
    expect(await host().has("fal")).toBe(false);
    await fs.writeFile(filename, "malformed synthetic credential JSON");
    expect(await host().has("fal")).toBe(false);
  });

  it("does not import the legacy environment override", async () => {
    await legacy({ fal: { type: "api", key: "disk-key" }, chatgpt: oauth });
    vi.stubEnv(
      "GRIDA_AUTH_CONTENT",
      JSON.stringify({ fal: { type: "api", key: "env-key" } })
    );
    expect(await host()._getKey("fal")).toBe("disk-key");
    expect(JSON.parse(await fs.readFile(filename, "utf8"))).toEqual({
      chatgpt: oauth,
    });
  });

  it("retires previously absent whitespace keys without inventing a connection", async () => {
    await legacy({ fal: { type: "api", key: "   " }, chatgpt: oauth });
    expect(await host().has("fal")).toBe(false);
    expect(JSON.parse(await fs.readFile(filename, "utf8"))).toEqual({
      chatgpt: oauth,
    });
  });

  it("keeps pending migration fenced and resumes with newer OAuth intact", async () => {
    await legacy({ fal: { type: "api", key: "import-once" }, chatgpt: oauth });
    const rename = fs.rename.bind(fs);
    const failure = vi
      .spyOn(fs, "rename")
      .mockImplementation(async (from, to) => {
        if (to === filename)
          throw new Error("synthetic secret-bearing host error");
        return rename(from, to);
      });
    await expect(host().has("fal")).rejects.toMatchObject({
      code: "migration_failed",
    });
    await expect(canonical().read("fal")).rejects.toMatchObject({
      code: "migration_pending",
    });
    failure.mockRestore();
    const fresh = { ...oauth, access: "new-access", refresh: "new-refresh" };
    await new AuthStore(state).set("chatgpt", fresh);
    // An interrupted source may change; pending recovery only retires it.
    const changed = JSON.parse(await fs.readFile(filename, "utf8"));
    changed.fal.key = "must-not-reimport";
    await legacy(changed);
    expect(await host()._getKey("fal")).toBe("import-once");
    expect(JSON.parse(await fs.readFile(filename, "utf8"))).toEqual({
      chatgpt: fresh,
    });
  });

  it("serializes migration retirement with a second OAuth writer", async () => {
    await legacy({
      fal: { type: "api", key: "migration-key" },
      chatgpt: oauth,
    });
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const rename = fs.rename.bind(fs);
    let paused = false;
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (to === filename && !paused) {
        paused = true;
        entered.resolve();
        await release.promise;
      }
      return rename(from, to);
    });
    const importing = host().has("fal");
    await entered.promise;
    const fresh = { ...oauth, access: "concurrent-access" };
    let written = false;
    const writing = new AuthStore(state).set("chatgpt", fresh).then(() => {
      written = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(written).toBe(false);
    release.resolve();
    await Promise.all([importing, writing]);
    expect(JSON.parse(await fs.readFile(filename, "utf8"))).toEqual({
      chatgpt: fresh,
    });
  });

  it("preserves independent OAuth updates across AuthStore instances", async () => {
    await Promise.all([
      new AuthStore(state).set("oauth-a", oauth),
      new AuthStore(state).set("oauth-b", { ...oauth, account_id: "other" }),
    ]);
    expect(
      Object.keys(JSON.parse(await fs.readFile(filename, "utf8"))).sort()
    ).toEqual(["oauth-a", "oauth-b"]);
  });

  it("refuses the former API-key write path", async () => {
    const auth = new AuthStore(state);
    await expect(
      auth.set("fal", { type: "api", key: "not-written" })
    ).rejects.toThrow("shared provider");
    await expect(
      auth.writeAll({ fal: { type: "api", key: "not-written" } })
    ).rejects.toThrow("shared provider");
    await expect(fs.stat(filename)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["malformed", "symlink", "hardlink", "permissions"])(
    "refuses unsafe legacy %s without exposing or replacing content",
    async (kind) => {
      await legacy({ fal: { type: "api", key: "do-not-expose-this-key" } });
      if (kind === "malformed")
        await fs.writeFile(filename, "do-not-expose-this-key invalid JSON");
      if (kind === "permissions") await fs.chmod(filename, 0o644);
      if (kind === "hardlink")
        await fs.link(filename, path.join(state, "other.json"));
      if (kind === "symlink") {
        await fs.rename(filename, path.join(state, "other.json"));
        await fs.symlink(path.join(state, "other.json"), filename);
      }
      const error = await host()
        .has("fal")
        .then(
          () => null,
          (failure: unknown) => failure
        );
      expect(error).toMatchObject({ code: "migration_failed" });
      expect(String(error)).not.toContain("do-not-expose-this-key");
      expect(await canonical().read("fal")).toBeNull();
    }
  );

  it("isolates a direct host from the ambient Grida home", async () => {
    const untouched = path.join(home, "ambient-home");
    vi.stubEnv("GRIDA_HOME", untouched);
    const isolated = new SecretsStore(new AuthStore(state));
    await isolated.set("fal", "isolated-key");
    expect(await new ProviderCredentialStore({ home: state }).read("fal")).toBe(
      "isolated-key"
    );
    await expect(fs.stat(untouched)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
