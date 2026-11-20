// GRIDA-SEC-004 / GRIDA-SEC-014 — global source, explicit trust and captured scope.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stringify } from "smol-toml";
import { afterEach, describe, expect, it } from "vitest";
import { NativeAgentHooks } from "./native-agent-hooks";
import { DesktopPersonalization } from "./desktop-personalization";
import { NativeAgentChat } from "./native-agent-chat";

const fixtures: string[] = [];
afterEach(async () => {
  await Promise.all(
    fixtures
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});
const active = { supportedEvents: ["before_tool"], hooks: [], results: [] };

async function fixture() {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "native-global-hooks-"))
  );
  fixtures.push(root);
  const home = path.join(root, "grida");
  const workspace = path.join(root, "project-a");
  const otherWorkspace = path.join(root, "project-b");
  await Promise.all(
    [home, workspace, otherWorkspace].map((file) =>
      fs.mkdir(file, { mode: 0o700 })
    )
  );
  const definition = {
    id: "inspect",
    event: "before_tool",
    tool: "read_file",
    executable: await fs.realpath("/bin/bash"),
    arguments: [],
    mode: "required",
    timeout_ms: 2000,
  };
  const file = path.join(home, "config.toml");
  const write = async (hooks: Record<string, unknown>[] = [definition]) =>
    fs.writeFile(file, stringify({ schema_version: 1, hooks }), {
      mode: 0o600,
    });
  const settings = NativeAgentHooks.settings(home);
  const trust = async (id = definition.id) => {
    const configured = (await settings.configuration()).hooks.find(
      (hook) => hook.id === id
    )!;
    await settings.trust(
      await settings.reviewConfigured(configured.id, configured.revision)
    );
  };
  return {
    root,
    home,
    workspace,
    otherWorkspace,
    definition,
    file,
    write,
    settings,
    trust,
  };
}

describe("global config.toml hooks", () => {
  it("uses one global source across workspaces after explicit trust", async () => {
    const f = await fixture();
    await f.write();
    const before = await f.settings.configuration();
    expect(before).toMatchObject({
      configPath: f.file,
      exists: true,
      activation: "new_connections",
      diagnostics: [],
      hooks: [{ id: "inspect", trusted: false, timeoutMs: 2000 }],
    });
    await expect(NativeAgentHooks.open(f.home, f.workspace)).rejects.toThrow(
      "native_hooks_review_required"
    );
    await f.trust();
    const first = await NativeAgentHooks.open(f.home, f.workspace);
    const second = await NativeAgentHooks.open(f.home, f.otherWorkspace);
    expect((await first.inspect(active)).saved).toEqual(
      (await second.inspect(active)).saved
    );
    expect((await f.settings.configuration()).hooks[0].trusted).toBe(true);
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(f.home, "agent", "hooks-trust.json"),
          "utf8"
        )
      )
    ).toEqual({ version: 1, revisions: [before.hooks[0].revision] });
    expect(await fs.readFile(f.file, "utf8")).toContain("[[hooks]]");
  });

  it("preserves reviewed hooks and permits rolling back to the hook-only schema", async () => {
    const f = await fixture();
    await f.write();
    await fs.appendFile(f.file, "# Keep the verification hook.\n");
    await f.trust();
    const source = await fs.readFile(f.file, "utf8");
    const receipt = path.join(f.home, "agent", "hooks-trust.json");
    const trusted = await fs.readFile(receipt);
    const before = await NativeAgentHooks.open(f.home, f.workspace);
    const setting = new DesktopPersonalization(f.file);
    await setting.set(true);
    const withDesktop = await fs.readFile(f.file, "utf8");
    expect(withDesktop).toBe(
      source + "\n[desktop]\ncomposer-predictions-enabled = true\n"
    );
    await setting.setPersonalization({ webSearch: "live" });
    await setting.setPersonalization({ fastMode: false });
    const after = await NativeAgentHooks.open(f.home, f.otherWorkspace);
    expect(await after.inspect(active)).toEqual(await before.inspect(active));
    expect(await fs.readFile(receipt)).toEqual(trusted);
    await fs.writeFile(
      f.file,
      withDesktop.slice(0, withDesktop.indexOf("\n[desktop]"))
    );
    expect(await fs.readFile(f.file, "utf8")).toBe(source);
    expect((await f.settings.configuration()).hooks[0].trusted).toBe(true);
    expect((await setting.get()).enabled).toBe(false);
  });

  it("accepts an existing 0755 Grida home and agent directory without a config", async () => {
    const f = await fixture();
    await fs.chmod(f.home, 0o755);
    await fs.mkdir(path.join(f.home, "agent"), { mode: 0o755 });
    expect(await f.settings.configuration()).toMatchObject({
      exists: false,
      hooks: [],
      diagnostics: [],
    });
    await expect(
      NativeAgentHooks.open(f.home, f.workspace)
    ).resolves.toBeDefined();
    await f.write();
    await f.trust();
    expect((await f.settings.configuration()).hooks[0].trusted).toBe(true);
    expect((await fs.stat(f.home)).mode & 0o777).toBe(0o755);
    expect((await fs.stat(path.join(f.home, "agent"))).mode & 0o777).toBe(
      0o755
    );
  });

  it("does not discover or promote a legacy workspace hooks.json", async () => {
    const f = await fixture();
    await fs.writeFile(
      path.join(f.home, "hooks.json"),
      "malformed legacy data"
    );
    await fs.writeFile(
      path.join(f.workspace, "hooks.json"),
      "malformed project data"
    );
    const owner = await NativeAgentHooks.open(f.home, f.workspace);
    expect(await owner.inspect(active)).toMatchObject({
      active: [],
      saved: [],
    });
    expect(await f.settings.configuration()).toMatchObject({
      exists: false,
      hooks: [],
      diagnostics: [],
    });
    expect(await fs.readFile(path.join(f.home, "hooks.json"), "utf8")).toBe(
      "malformed legacy data"
    );
  });

  it("creates only the canonical config and never trusts it by opening it", async () => {
    const f = await fixture();
    expect(await f.settings.ensureConfig()).toBe(f.file);
    expect(await f.settings.configuration()).toMatchObject({
      exists: true,
      hooks: [],
      diagnostics: [],
    });
    await expect(
      fs.stat(path.join(f.home, "agent", "hooks-trust.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await f.write();
    await f.settings.ensureConfig();
    expect((await f.settings.configuration()).hooks[0].trusted).toBe(false);
    expect((await fs.stat(f.file)).mode & 0o777).toBe(0o600);
  });

  it("invalidates trust when command arguments change and refuses stale review", async () => {
    const f = await fixture();
    await f.write();
    await f.trust();
    const initial = (await f.settings.configuration()).hooks[0];
    const review = await f.settings.reviewConfigured(
      initial.id,
      initial.revision
    );
    await f.write([{ ...f.definition, arguments: ["changed"] }]);
    await expect(f.settings.trust(review)).rejects.toThrow(
      "native_hook_revision_changed"
    );
    const changed = (await f.settings.configuration()).hooks[0];
    expect(changed.trusted).toBe(false);
    expect(changed.revision).not.toBe(initial.revision);
    await expect(NativeAgentHooks.open(f.home, f.workspace)).rejects.toThrow(
      "native_hooks_review_required"
    );
    await f.trust();
    await expect(
      NativeAgentHooks.open(f.home, f.workspace)
    ).resolves.toBeDefined();
  });

  it("rejects review handles from another owner and retired JSON mutation", async () => {
    const f = await fixture();
    await f.write();
    const hook = (await f.settings.configuration()).hooks[0];
    const review = await f.settings.reviewConfigured(hook.id, hook.revision);
    await expect(
      NativeAgentHooks.settings(f.home).trust(review)
    ).rejects.toThrow("native_hook_review_unavailable");
    await expect(f.settings.review(f.file)).rejects.toThrow(
      "native_hooks_config_toml_only"
    );
    await expect(f.settings.install(review)).rejects.toThrow(
      "native_hooks_config_toml_only"
    );
    await expect(f.settings.remove(hook.id, hook.revision)).rejects.toThrow(
      "native_hooks_config_toml_only"
    );
  });

  it.each([
    { event: "unsupported" },
    { timeout_ms: 0 },
    { timeout_ms: 30001 },
    { mode: "optional" },
    { arguments: [123] },
    { event: "before_input", tool: "read_file" },
    { async: true },
    { matcher: ".*" },
    { executable: "relative-program" },
  ])(
    "refuses malformed/unsupported definitions without partial activation (%j)",
    async (change) => {
      const f = await fixture();
      await f.write([{ ...f.definition, ...change }]);
      expect((await f.settings.configuration()).diagnostics).not.toEqual([]);
      await expect(NativeAgentHooks.open(f.home, f.workspace)).rejects.toThrow(
        "native_hooks_configuration_invalid"
      );
      await expect(
        fs.stat(path.join(f.home, "agent", "hooks-trust.json"))
      ).rejects.toMatchObject({ code: "ENOENT" });
    }
  );

  it("reports malformed TOML, duplicate IDs and excess definitions", async () => {
    const f = await fixture();
    await fs.writeFile(f.file, "[broken", { mode: 0o600 });
    expect((await f.settings.configuration()).diagnostics).toEqual([
      "config.toml is not valid UTF-8 TOML. Correct its syntax and reload.",
    ]);
    await f.write([f.definition, f.definition]);
    expect((await f.settings.configuration()).diagnostics).not.toEqual([]);
    await f.write(
      Array.from({ length: 9 }, (_, index) => ({
        ...f.definition,
        id: `hook-${index}`,
      }))
    );
    expect((await f.settings.configuration()).diagnostics).not.toEqual([]);
  });

  it.skipIf(process.platform === "win32")(
    "refuses user-owned executables and writable or symlinked configuration",
    async () => {
      const f = await fixture();
      const local = path.join(f.root, "program");
      await fs.writeFile(local, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
      await f.write([{ ...f.definition, executable: local }]);
      expect((await f.settings.configuration()).diagnostics).not.toEqual([]);
      await f.write();
      await fs.chmod(f.file, 0o666);
      expect((await f.settings.configuration()).diagnostics).not.toEqual([]);
      await fs.chmod(f.file, 0o600);
      await fs.rename(f.file, f.file + ".real");
      await fs.symlink(f.file + ".real", f.file);
      expect((await f.settings.configuration()).diagnostics).not.toEqual([]);
    }
  );

  it("keeps a worker selection frozen while fresh connections load a changed trusted source", async () => {
    const f = await fixture();
    await f.write();
    await f.trust();
    const worker = await NativeAgentHooks.open(f.home, f.workspace);
    const original = (await worker.inspect(active)).saved[0];
    await f.write([{ ...f.definition, arguments: ["later"] }]);
    expect((await worker.inspect(active)).activation).toBe("restart_required");
    await f.trust();
    const fresh = await NativeAgentHooks.open(f.home, f.workspace);
    expect((await fresh.inspect(active)).saved[0].revision).not.toBe(
      original.revision
    );
    // Existing worker reports pending source changes without replacing its selection.
    expect((await worker.inspect(active)).activation).toBe("restart_required");
    expect((await fresh.inspect(active)).activation).toBe("current");
  });
});

it.runIf(Boolean(process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES))(
  "runs a trusted global completion policy in a real native workspace worker",
  async () => {
    const f = await fixture();
    await f.write([
      {
        ...f.definition,
        event: "before_input",
        tool: undefined,
        executable: "/bin/sh",
        arguments: [
          "-c",
          'printf \'%s\' \'{"decision":"deny","reason":"Global policy fixture"}\'',
        ],
      },
    ]);
    await f.trust();
    await new DesktopPersonalization(f.file).set(true);
    const hooks = await NativeAgentHooks.open(f.home, f.workspace);
    const resourcesPath = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES!;
    const plan = await hooks.launch(resourcesPath, {
      id: "global-hook-fixture",
      primary: { id: "project", name: "Project", path: f.workspace },
      additionalReadRoots: [],
      protectedPaths: [f.home],
    });
    if (plan) fixtures.push(plan.command.temporaryParent);
    const chat = await NativeAgentChat.start({
      resourcesPath,
      stateDirectory: path.join(f.root, "state"),
      cwd: f.workspace,
      provider: "openai-compatible",
      endpoint: "http://127.0.0.1:1/v1",
      model: "fixture",
      hooks,
      workspace: {
        id: "global-hook-fixture",
        primary: { id: "project", name: "Project", path: f.workspace },
        additionalReadRoots: [],
        protectedPaths: [f.home],
      },
    });
    try {
      const session = await chat.create();
      await chat.submit(
        session,
        "global-check",
        "This must be denied before any provider call."
      );
      let inspection = await chat.inspectHooks(session.id);
      const deadline = Date.now() + 5000;
      while (
        !inspection.results?.some((result) => result.status === "denied") &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        inspection = await chat.inspectHooks(session.id);
      }
      expect(inspection.active).toHaveLength(1);
      expect(inspection.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "inspect",
            event: "before_input",
            status: "denied",
            reason: "Global policy fixture",
          }),
        ])
      );
    } finally {
      await chat.close();
    }
  },
  15000
);
