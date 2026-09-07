// GRIDA-SEC-010 — command grammar and noninteractive authority regression checks.
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
    ["models", "list"],
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
