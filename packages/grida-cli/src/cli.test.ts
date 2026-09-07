// GRIDA-SEC-010 / GRIDA-SEC-013 — command grammar and explicit authority regression checks.
import { describe, expect, it } from "vitest";
import { Cli } from "./cli";

describe("CLI grammar", () => {
  it("keeps help/version/docs independent of configured accounts", () => {
    expect(Cli.parse([])).toMatchObject({ command: "help", topic: "" });
    expect(Cli.parse(["--version"])).toMatchObject({ command: "version" });
    expect(Cli.parse(["account", "credits", "--help"])).toMatchObject({
      command: "help",
      topic: "account credits",
    });
    expect(Cli.parse(["help", "auth", "storage"])).toMatchObject({
      command: "help",
      topic: "auth storage",
    });
    const docs = Cli.parse(["docs", "auth", "storage"]);
    expect(docs).toMatchObject({ command: "docs", topic: "auth storage" });
    expect(Cli.docsUrl("account credits")).toBe(
      "https://grida.co/docs/wg/cli/v1"
    );
    expect(Cli.docsUrl("auth storage")).toBe(
      "https://grida.co/docs/wg/cli/credential-custody"
    );
  });

  it("keeps numeric slugs distinct from organization IDs", () => {
    expect(
      Cli.parse(["account", "credits", "--org", "123", "--json"])
    ).toMatchObject({ selector: { name: "123" }, json: true });
    expect(
      Cli.parse(["--json", "account", "credits", "--org-id=123"])
    ).toMatchObject({ selector: { id: 123 }, json: true });
    expect(Cli.parse(["account", "credits"])).not.toHaveProperty("selector");
  });

  it.each([
    ["account", "credits", "--org", "studio", "--org-id", "1"],
    ["account", "credits", "--org-id", "0"],
    ["account", "credits", "--org-id", "01"],
    ["account", "credits", "--org-id", "9007199254740992"],
    ["account", "credits", "--org", "UPPER"],
    ["account", "credits", "--org", "two--hyphens"],
    ["account", "credits", "--org", ""],
    ["account", "view", "--org", "studio"],
    ["auth", "logout", "--no-browser"],
    ["auth", "login", "--storage", "automatic"],
    ["auth", "storage", "migrate", "file", "extra"],
    ["auth", "storage", "migrate"],
    ["account", "view", "--json", "--json"],
    ["auth", "status", "--token", "secret-do-not-echo"],
    ["secret-do-not-echo"],
    ["models", "missing"],
    ["docs", "missing"],
  ])("rejects invalid invocation before host work: %j", (...argv) => {
    let error: unknown;
    try {
      Cli.parse(argv);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Cli.Failure);
    expect(error).toMatchObject({ code: "invalid_usage" });
    expect(String(error)).not.toContain("secret-do-not-echo");
  });

  it.each(["--json", "--no-input"])(
    "refuses interactive login with %s",
    (option) => {
      expect(() => Cli.parse(["auth", "login", option])).toThrow(
        expect.objectContaining({ code: "interaction_required" })
      );
    }
  );

  it("requires an explicit storage choice and manual-browser mode", () => {
    expect(Cli.parse(["auth", "login"])).toMatchObject({
      storage: undefined,
      noBrowser: false,
    });
    expect(
      Cli.parse(["auth", "login", "--storage", "file", "--no-browser"])
    ).toMatchObject({ storage: "file", noBrowser: true });
    expect(
      Cli.parse(["auth", "storage", "migrate", "keyring", "--no-input"])
    ).toMatchObject({ backend: "keyring", noInput: true });
  });
});

describe("media command grammar", () => {
  it("keeps discovery credential-free and provider selection explicit", () => {
    expect(Cli.parse(["models", "list"])).toMatchObject({
      command: "models list",
      available: false,
    });
    expect(
      Cli.parse([
        "models",
        "list",
        "--provider",
        "gg",
        "--available",
        "--org",
        "studio",
      ])
    ).toMatchObject({
      provider: "gg",
      available: true,
      selector: { name: "studio" },
    });
    expect(
      Cli.parse([
        "models",
        "inspect",
        "--provider",
        "fal",
        "--model",
        "fal-ai/trellis-2",
      ])
    ).toMatchObject({ command: "models inspect", model: "fal-ai/trellis-2" });
    expect(Cli.docsUrl("models inspect")).toBe(
      "https://grida.co/docs/wg/cli/media"
    );
  });
  it("accepts explicit file input and a separately owned stdin key", () => {
    expect(
      Cli.parse([
        "generate",
        "--provider",
        "elevenlabs",
        "--model",
        "eleven_v3",
        "--input",
        "@speech.json",
        "--out",
        "./speech",
        "--key-stdin",
        "--json",
        "--no-input",
      ])
    ).toMatchObject({
      command: "generate",
      keyStdin: true,
      input: "@speech.json",
      out: "./speech",
      json: true,
    });
  });
  it.each([
    ["models", "list", "--available"],
    ["models", "list", "--provider", "fal", "--org", "studio"],
    ["models", "inspect", "--model", "x"],
    ["models", "inspect", "--provider", "auto", "--model", "x"],
    ["voices", "list", "--provider", "fal"],
    ["providers", "list", "--key-stdin"],
    [
      "generate",
      "--provider",
      "fal",
      "--model",
      "x",
      "--input",
      "-",
      "--out",
      "result",
      "--key-stdin",
    ],
    [
      "generate",
      "--provider",
      "gg",
      "--model",
      "x",
      "--input",
      "@input.json",
      "--out",
      "result",
      "--key-stdin",
    ],
    [
      "generate",
      "--provider",
      "fal",
      "--model",
      "x",
      "--input",
      "@input.json",
      "--out",
      "result",
      "--org-id",
      "1",
    ],
    [
      "generate",
      "--provider",
      "fal",
      "--model",
      "x",
      "--input",
      '{"prompt":"secret"}',
      "--out",
      "result",
    ],
    ["generate", "--provider", "fal", "--model", "x", "--input", "@input.json"],
  ])("rejects ambiguous authority/input before host work: %j", (...argv) => {
    expect(() => Cli.parse(argv)).toThrow(
      expect.objectContaining({ code: "invalid_usage" })
    );
  });
});
