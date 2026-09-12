// GRIDA-SEC-014 — shared provider custody retains explicit host authority.
// GRIDA-SEC-010 / GRIDA-SEC-013 — command grammar and explicit authority regression checks.
import { describe, expect, expectTypeOf, it } from "vitest";
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
      "https://grida.co/docs/cli/account"
    );
    expect(Cli.docsUrl("auth storage")).toBe("https://grida.co/docs/cli/auth");
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

describe("rigging command grammar", () => {
  it("types model identity and mesh options according to the accepted command", () => {
    const common = { provider: "tripo", json: false, noInput: false } as const;
    const inspect = { ...common, command: "rigging inspect" } as const;
    expectTypeOf({
      ...inspect,
      feature: "rig-check" as const,
    }).toExtend<Cli.RiggingInvocation>();
    expectTypeOf({
      ...inspect,
      feature: "rigging" as const,
      model: "tripo/rig-v1.0",
    }).toExtend<Cli.RiggingInvocation>();
    expectTypeOf({
      ...inspect,
      feature: "rigging" as const,
    }).not.toExtend<Cli.RiggingInvocation>();
    expectTypeOf({
      ...inspect,
      feature: "rig-check" as const,
      model: "tripo/rig-v1.0",
    }).not.toExtend<Cli.RiggingInvocation>();

    const run = {
      ...common,
      command: "rigging run",
      model: "tripo/rig-v1.0",
      out: "./rigged",
      keyStdin: false,
    } as const;
    const mesh = { ...run, mesh: "./character.glb" };
    expectTypeOf({
      ...mesh,
      rigType: "biped",
      spec: "mixamo",
    }).toExtend<Cli.RiggingInvocation>();
    expectTypeOf(mesh).not.toExtend<Cli.RiggingInvocation>();
    expectTypeOf({
      ...mesh,
      rigType: "biped",
    }).not.toExtend<Cli.RiggingInvocation>();
    expectTypeOf({
      ...mesh,
      spec: "mixamo",
    }).not.toExtend<Cli.RiggingInvocation>();

    const input = { ...run, input: "@input.json" };
    expectTypeOf(input).toExtend<Cli.RiggingInvocation>();
    expectTypeOf({
      ...input,
      rigType: "biped",
    }).not.toExtend<Cli.RiggingInvocation>();
    expectTypeOf({
      ...input,
      spec: "mixamo",
    }).not.toExtend<Cli.RiggingInvocation>();
    expectTypeOf({
      ...input,
      mesh: "./character.glb",
    }).not.toExtend<Cli.RiggingInvocation>();
  });

  const run = [
    "rigging",
    "run",
    "--provider",
    "tripo",
    "--model",
    "tripo/rig-v1.0",
    "--out",
    "./rigged",
  ];
  it("keeps eligibility model-free and paid rigging explicit", () => {
    expect(Cli.parse(["rigging"])).toMatchObject({
      command: "help",
      topic: "rigging",
    });
    expect(
      Cli.parse([
        "rigging",
        "check",
        "--provider",
        "tripo",
        "--mesh",
        "./character.glb",
      ])
    ).toEqual({
      command: "rigging check",
      provider: "tripo",
      mesh: "./character.glb",
      keyStdin: false,
      json: false,
      noInput: false,
    });
    expect(
      Cli.parse([
        ...run,
        "--mesh",
        "./character.glb",
        "--rig-type",
        "biped",
        "--spec",
        "mixamo",
      ])
    ).toMatchObject({
      command: "rigging run",
      model: "tripo/rig-v1.0",
      rigType: "biped",
      spec: "mixamo",
    });
    expect(
      Cli.parse([...run, "--input", "@input.json", "--key-stdin"])
    ).toMatchObject({ input: "@input.json", keyStdin: true });
    expect(
      Cli.parse([
        "rigging",
        "inspect",
        "--provider",
        "tripo",
        "--feature",
        "rig-check",
      ])
    ).not.toHaveProperty("model");
  });
  it.each([
    [
      "rigging",
      "check",
      "--provider",
      "tripo",
      "--mesh",
      "x.glb",
      "--model",
      "rig-check",
    ],
    [
      "rigging",
      "inspect",
      "--provider",
      "tripo",
      "--feature",
      "rig-check",
      "--model",
      "rig-check",
    ],
    ["rigging", "inspect", "--provider", "tripo", "--feature", "rigging"],
    ["rigging", "check", "--provider", "fal", "--mesh", "x.glb"],
    ["rigging", "check", "--provider", "tripo", "--mesh", "-"],
    ["rigging", "check", "--provider", "tripo", "--input", "-", "--key-stdin"],
    [...run, "--input", "-", "--mesh", "x.glb"],
    [...run, "--input", "-", "--rig-type", "biped"],
    [...run, "--mesh", "x.glb", "--spec", "tripo"],
    [...run, "--input", "-", "--out", "./other"],
  ])("rejects mixed or missing explicit authority: %j", (...args) => {
    expect(() => Cli.parse(args)).toThrow(Cli.Failure);
  });
});

describe("media command grammar", () => {
  const friendly = [
    "generate",
    "--provider",
    "openrouter",
    "--model",
    "openai/gpt-image-2",
    "--out",
    "./result",
  ];
  it("accepts ordered references and parameters without requiring JSON", () => {
    expect(
      Cli.parse([
        ...friendly,
        "--prompt",
        "  a=b\n",
        "--reference",
        "./first.png",
        "--reference",
        "./second.png",
        "--param",
        "quality=high",
        "--param",
        "seed=0",
      ])
    ).toMatchObject({
      command: "generate",
      request: {
        prompt: "  a=b\n",
        references: ["./first.png", "./second.png"],
        parameters: [
          { field: "quality", value: "high" },
          { field: "seed", value: "0" },
        ],
      },
    });
  });
  it.each([
    ["--prompt", "a", "--prompt", "b"],
    ["--prompt", "a", "--prompt-file", "./b.txt"],
    ["--text", "a", "--text-file", "./b.txt"],
    ["--prompt", "a", "--text", "b"],
    ["--reference", "a.png", "--image", "b.png"],
    ["--image", "-"],
    ["--reference", "-"],
    ["--prompt", "a", "--input", "@request.json"],
    ["--prompt-file", "-", "--key-stdin"],
    ["--text-file", "-", "--key-stdin"],
    ["--param", "seed=1", "--param", "seed=2"],
    ["--param", "seed"],
    ["--param", "__proto__=bad"],
  ])("rejects ambiguous request construction %j", (...flags) => {
    expect(() => Cli.parse([...friendly, ...flags])).toThrow(Cli.Failure);
  });
  it("allocates stdin to text or a key, never both", () => {
    expect(Cli.parse([...friendly, "--prompt-file", "-"])).toMatchObject({
      request: { promptFile: "-" },
    });
    expect(
      Cli.parse([...friendly, "--prompt-file", "./prompt.txt", "--key-stdin"])
    ).toMatchObject({
      request: { promptFile: "./prompt.txt" },
      keyStdin: true,
    });
  });
  it("keeps provider persistence explicit and keys off argv", () => {
    expect(
      Cli.parse(["providers", "configure", "fal", "--help"])
    ).toMatchObject({
      command: "help",
      topic: "providers configure",
    });
    expect(
      Cli.parse(["providers", "configure", "fal", "--key-stdin", "--json"])
    ).toMatchObject({
      command: "providers configure",
      provider: "fal",
      keyStdin: true,
    });
    expect(
      Cli.parse(["providers", "remove", "fal", "--no-input"])
    ).toMatchObject({
      command: "providers remove",
      provider: "fal",
    });
    expect(() =>
      Cli.parse(["providers", "configure", "fal", "--json"])
    ).toThrow(expect.objectContaining({ code: "interaction_required" }));
    for (const args of [
      ["configure", "gg", "--key-stdin"],
      ["configure", "fal", "synthetic-secret"],
      ["configure", "fal", "--key", "synthetic-secret"],
      ["remove", "fal", "--key-stdin"],
    ])
      expect(() => Cli.parse(["providers", ...args])).toThrow(
        expect.objectContaining({ code: "invalid_usage" })
      );
  });
  it("keeps discovery credential-free and provider selection explicit", () => {
    expect(Cli.parse(["models", "list", "--provider", "tripo"])).toMatchObject({
      command: "models list",
      provider: "tripo",
    });
    expect(Cli.parse(["models", "list"])).toMatchObject({
      command: "models list",
      available: false,
      localImage: false,
    });
    expect(Cli.parse(["models", "list", "--local-image"])).toMatchObject({
      command: "models list",
      localImage: true,
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
      "https://grida.co/docs/cli/models"
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
    ["providers", "list", "--local-image"],
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
