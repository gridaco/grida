// GRIDA-SEC-004 — explicitly captured Desktop outbound MCP launch profile.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { NativeMcpLaunch } from "./native-mcp-launch";

const token = "synthetic.peer.bearer==";
const invalid = "native_desktop_mcp_profile_invalid";
const endpoint = "http://127.0.0.1:8123/mcp";

it.skipIf(process.platform === "win32")(
  "accepts one complete trusted profile and refuses ambient, ambiguous and unsafe options",
  async () => {
    const fixture = await directories();
    try {
      const { browser, root, options } = fixture;
      await expect(
        NativeMcpLaunch.configure([], browser, "gateway")
      ).resolves.toBeUndefined();
      await expect(
        NativeMcpLaunch.configure(["--", ...options], browser, "gateway")
      ).resolves.toBeUndefined();
      const denied = [
        options.slice(0, -1),
        [...options, options[0]],
        [...options, options.at(-1)!],
        [...options, "--native-chat-mcp-bearer=arbitrary"],
        [...options.slice(0, -1), "--native-chat-mcp-tool=bad\n"],
        ...[
          "http://localhost:8123/mcp",
          "http://127.1:8123/mcp",
          "http://127.0.0.1:8123/mcp?extra=1",
          "http://127.0.0.1:8123/%2e%2e/mcp",
          "http://127.0.0.1:8123/mcp#",
          "https://127.0.0.1:8123/mcp",
        ].map((bad) => options.map((option) => option.replace(endpoint, bad))),
        options.map((option) => option.replace(root, browser)),
      ];
      for (const argv of denied)
        await expect(
          NativeMcpLaunch.configure(argv, browser, "gateway")
        ).rejects.toThrow(invalid);
      await expect(
        NativeMcpLaunch.configure(options, browser, "chatgpt")
      ).rejects.toThrow(invalid);
      await expect(
        NativeMcpLaunch.configure(options, browser, "gateway")
      ).rejects.toThrow(invalid);
      await fs.writeFile(fixture.bearer, token, { mode: 0o600 });
      const profile = (await NativeMcpLaunch.configure(
        options,
        browser,
        "gateway"
      ))!;
      expect(profile.forWorkspace(browser)).toBeUndefined();
      expect(profile.forWorkspace(root)).toBe(profile);
      const args: string[] = [];
      const environment: NodeJS.ProcessEnv = {};
      await profile.extendChild(root, "a".repeat(64), args, environment);
      expect(args).toEqual([
        "--mcp-endpoint",
        endpoint,
        "--mcp-token-env",
        "GRIDA_DESKTOP_MCP_BEARER",
        "--mcp-source",
        "local",
        "--mcp-tool",
        "lookup",
      ]);
      expect(environment).toEqual({ GRIDA_DESKTOP_MCP_BEARER: token });
      await expect(
        profile.extendChild(root, "b".repeat(64), [], {})
      ).rejects.toThrow("native_desktop_mcp_gateway_scope_changed");
      await fs.rename(root, `${root}-old`);
      await fs.mkdir(root);
      await expect(
        profile.extendChild(root, "a".repeat(64), [], {})
      ).rejects.toThrow(invalid);
    } finally {
      await fixture.clean();
    }
  }
);

it.skipIf(process.platform === "win32")(
  "requires a bounded private credential and refuses a replaced file before spawn",
  async () => {
    const fixture = await directories();
    try {
      const { browser, root, bearer, options } = fixture;
      const configure = () =>
        NativeMcpLaunch.configure(options, browser, "gateway");
      const elsewhere = path.join(fixture.base, "outside");
      await fs.writeFile(elsewhere, token, { mode: 0o600 });
      await fs.symlink(elsewhere, bearer);
      await expect(configure()).rejects.toThrow(invalid);
      await fs.unlink(bearer);
      await fs.link(elsewhere, bearer);
      await expect(configure()).rejects.toThrow(invalid);
      await fs.unlink(bearer);
      await fs.writeFile(bearer, token, { mode: 0o644 });
      await expect(configure()).rejects.toThrow(invalid);
      await fs.chmod(bearer, 0o600);
      await fs.writeFile(bearer, "x".repeat(4097));
      await expect(configure()).rejects.toThrow(invalid);
      await fs.writeFile(bearer, `${token}\n`);
      await expect(configure()).rejects.toThrow(invalid);
      await fs.writeFile(bearer, token);
      const profile = (await configure())!;
      await fs.rename(elsewhere, bearer);
      await expect(
        profile.extendChild(root, "a".repeat(64), [], {})
      ).rejects.toThrow(invalid);
    } finally {
      await fixture.clean();
    }
  }
);

async function directories() {
  const base = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "grida-mcp-launch-")
  );
  const browser = path.join(base, "browser");
  const root = path.join(base, "workspace");
  await Promise.all(
    [browser, root].map((directory) => fs.mkdir(directory, { mode: 0o700 }))
  );
  return {
    base,
    browser,
    root,
    bearer: path.join(browser, "native-mcp.bearer"),
    options: [
      `--native-chat-mcp-root=${root}`,
      `--native-chat-mcp-endpoint=${endpoint}`,
      "--native-chat-mcp-source=local",
      "--native-chat-mcp-tool=lookup",
    ],
    clean: () => fs.rm(base, { recursive: true, force: true }),
  };
}
