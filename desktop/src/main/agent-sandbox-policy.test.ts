// GRIDA-SEC-014 — explicit provider-root forwarding and host isolation.
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { DesktopAgentSandboxPolicy } from "./agent-sandbox-policy";

describe("DesktopAgentSandboxPolicy", () => {
  it("is socketless and gives the sidecar tree no direct Internet hosts", () => {
    const policy = DesktopAgentSandboxPolicy.build({
      userData: "/Users/test/.grida/agent",
      providerRoot: "/isolated-grida/providers",
      mediaRoot: "/Users/test/Library/Application Support/Grida/Media",
      home: "/Users/test",
      ggHost: "grida.co",
    });

    expect(policy.filesystem.allow_read).toContain("/isolated-grida/providers");
    expect(policy.filesystem.allow_write).toContain(
      "/isolated-grida/providers"
    );
    expect(policy.network.allow_local_binding).toBe(false);
    expect(policy.network.allowed_domains).toEqual([]);
    expect(policy.filesystem.allow_read).toContain(
      "/Users/test/Library/Application Support/Grida/Media"
    );
    expect(policy.filesystem.allow_write).toContain(
      "/Users/test/Library/Application Support/Grida/Media"
    );
  });

  it("keeps the native browser profile outside retained sidecar custody", () => {
    const desktopStateRoot = "/isolated-grida/browser";
    const policy = DesktopAgentSandboxPolicy.build({
      userData: "/isolated-grida/agent",
      mediaRoot: "/isolated-grida/media",
      desktopStateRoot,
      home: "/Users/test",
      ggHost: "grida.co",
    });
    expect(policy.filesystem.deny_read).toContain(desktopStateRoot);
    expect(policy.filesystem.deny_write).toContain(desktopStateRoot);
    expect(policy.filesystem.allow_write).not.toContain(desktopStateRoot);
  });

  it("adds literal legacy-state read and write denials only when supplied", () => {
    const launch = {
      userData: "/isolated/agent",
      mediaRoot: "/isolated/media",
      home: "/Users/test",
      ggHost: "grida.co",
    };
    const root = "/Users/test/.grida";
    const ordinary = DesktopAgentSandboxPolicy.build(launch);
    const preview = DesktopAgentSandboxPolicy.build({
      ...launch,
      legacyStateRoots: [root],
    });
    expect(ordinary.filesystem.deny_read).not.toContain(root);
    expect(ordinary.filesystem.deny_write).not.toContain(root);
    expect(preview.filesystem.deny_read).toContain(root);
    expect(preview.filesystem.deny_write).toContain(root);
    expect(() =>
      DesktopAgentSandboxPolicy.build({
        ...launch,
        legacyStateRoots: [root + "[old]"],
      })
    ).toThrow("native_desktop_legacy_state_path_not_literal");
  });

  it.runIf(
    process.platform === "darwin" &&
      Boolean(process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES)
  )(
    "keeps Media nested in the ordinary browser root writable under Seatbelt",
    async () => {
      const root = await fs.mkdtemp(
        path.join(await fs.realpath(os.tmpdir()), "grida-ordinary-seatbelt-")
      );
      const browser = path.join(root, "Application Support", "Grida");
      const mediaRoot = path.join(browser, "Media");
      const native = path.join(browser, "native-chat");
      const agent = path.join(root, "agent");
      const scratch = path.join(root, "scratch");
      const legacy = path.join(agent, "sessions.db");
      const { RetainedServiceSandbox } =
        await import("./retained-service-sandbox");
      try {
        await Promise.all(
          [mediaRoot, native, agent, scratch].map((directory) =>
            fs.mkdir(directory, { recursive: true })
          )
        );
        const protectedFiles = [
          path.join(native, "runtime.sqlite"),
          legacy,
          path.join(scratch, "input.png"),
        ];
        await Promise.all(
          protectedFiles.map((file) => fs.writeFile(file, "retained"))
        );
        const output = path.join(mediaRoot, "new.bin");
        const script = path.join(root, "probe.cjs");
        await fs.writeFile(
          script,
          `
          const assert = require('node:assert/strict');
          const fs = require('node:fs');
          fs.writeFileSync(${JSON.stringify(output)}, 'new media');
          assert.equal(fs.readFileSync(${JSON.stringify(output)}, 'utf8'), 'new media');
          for (const file of ${JSON.stringify(protectedFiles)}) {
            assert.throws(() => fs.readFileSync(file), { code: 'EPERM' });
            assert.throws(() => fs.writeFileSync(file, 'changed'), { code: 'EPERM' });
          }
        `
        );
        const policy = DesktopAgentSandboxPolicy.build({
          home: root,
          userData: agent,
          mediaRoot,
          desktopStateRoot: native,
          legacyStateRoots: [legacy, scratch],
          ggHost: "grida.co",
        });
        const sandbox = new RetainedServiceSandbox({
          network: {
            allowedDomains: [],
            deniedDomains: [],
            allowLocalBinding: false,
          },
          filesystem: {
            denyRead: policy.filesystem.deny_read,
            allowRead: policy.filesystem.allow_read,
            denyWrite: policy.filesystem.deny_write,
            allowWrite: policy.filesystem.allow_write,
          },
        });
        const plan = sandbox.prepare(process.execPath, [script]);
        plan.recheck();
        await promisify(execFile)(plan.executable, plan.arguments, {
          env: { HOME: root, PATH: "/usr/bin:/bin" },
          timeout: 5000,
        });
        expect(await fs.readFile(output, "utf8")).toBe("new media");
        expect(
          await Promise.all(
            protectedFiles.map((file) => fs.readFile(file, "utf8"))
          )
        ).toEqual(["retained", "retained", "retained"]);
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
    15_000
  );
});
