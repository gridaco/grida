// GRIDA-SEC-004 / GRIDA-SEC-014 — trust, captured scope and immutable hook selection.
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NativeAgentHooks } from "./native-agent-hooks";
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

it.runIf(Boolean(process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES))(
  "runs an explicitly registered Desktop check through the native worker and reopens it observationally",
  async () => {
    const f = await fixture();
    await fs.writeFile(
      f.file,
      JSON.stringify({
        ...f.draft,
        event: "before_input",
        tool: undefined,
        executable: "/bin/sh",
        arguments: [
          "-c",
          `if test -f manifest.json; then printf '%s' '{"decision":"allow"}'; else printf '%s' '{"decision":"deny","reason":"Manifest missing"}'; fi`,
        ],
      })
    );
    await f.owner.install(await f.owner.review(f.file));
    let requests = 0;
    const server = createServer((request, response) => {
      request.resume();
      request.on("end", () => {
        requests++;
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          `data: ${JSON.stringify({ id: "fixture", choices: [{ index: 0, delta: { role: "assistant", content: "Manifest checked." }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: "fixture", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`
        );
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("fixture_address");
    const launch = async () =>
      NativeAgentChat.start({
        cwd: f.workspace,
        resourcesPath: process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES!,
        stateDirectory: path.join(f.root, "state"),
        provider: "openai-compatible",
        endpoint: `http://127.0.0.1:${address.port}/v1`,
        model: "fixture",
        hooks: await NativeAgentHooks.open(f.directory, f.workspace),
        workspace: {
          id: "hook-fixture",
          primary: { id: "project", name: "Project", path: f.workspace },
          additionalReadRoots: [],
          protectedPaths: [],
        },
      });
    let chat: NativeAgentChat | undefined;
    const settled = async (
      owner: NativeAgentChat,
      session: Awaited<ReturnType<NativeAgentChat["create"]>>
    ) => {
      for (let n = 0; n < 400; n++) {
        const value = await owner.observe(session);
        if (!value.current && value.latest?.disposition === "settled")
          return value;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error("fixture_settlement_timeout");
    };
    try {
      chat = await launch();
      const denied = await chat.create();
      await chat.submit(denied, "denied", "Inspect the manifest.");
      expect((await settled(chat, denied)).latest?.status).toBe("failed");
      expect(requests).toBe(0);
      expect(
        (await chat.inspectHooks(denied.id)).results?.some(
          (result) => result.status === "denied"
        )
      ).toBe(true);
      await fs.writeFile(path.join(f.workspace, "manifest.json"), "{}");
      const allowed = await chat.create();
      await chat.submit(allowed, "allowed", "Inspect the manifest.");
      expect((await settled(chat, allowed)).latest?.status).toBe("succeeded");
      expect(requests).toBe(1);
      const before = await chat.inspectHooks(allowed.id);
      await chat.close();
      chat = await launch();
      const reopened = await chat.load(allowed.id);
      expect(await chat.inspectHooks(reopened.id)).toEqual(before);
      expect(requests).toBe(1);
      const profile = await (
        await NativeAgentHooks.open(f.directory, f.workspace)
      ).launch(process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES!);
      if (profile) fixtures.push(profile.command.temporaryParent);
    } finally {
      await chat?.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  30000
);
async function fixture() {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "native-hook-registry-"))
  );
  fixtures.push(root);
  const workspace = path.join(root, "workspace");
  const directory = path.join(root, "private");
  await fs.mkdir(workspace, { mode: 0o700 });
  await fs.mkdir(directory, { mode: 0o700 });
  const executable = await fs.realpath("/usr/bin/printf");
  const file = path.join(root, "check.json");
  const draft = {
    id: "inspect",
    event: "before_tool",
    tool: "read_file",
    executable,
    arguments: [],
    mode: "required",
    timeoutMs: 2000,
  };
  await fs.writeFile(file, JSON.stringify(draft));
  const owner = await NativeAgentHooks.open(directory, workspace);
  return { root, workspace, directory, executable, file, draft, owner };
}

describe("NativeAgentHooks", () => {
  it("keeps discovery and review observational until explicit trust, then waits for a new connection", async () => {
    const f = await fixture();
    const review = await f.owner.review(f.file);
    expect(await f.owner.inspect(active)).toMatchObject({
      saved: [],
      activation: "current",
    });
    await expect(
      fs.stat(path.join(f.directory, "hooks.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await f.owner.install(review);
    const stored = await f.owner.inspect(active);
    expect(stored).toMatchObject({
      active: [],
      activation: "restart_required",
      saved: [
        { id: "inspect", source: "user-selected:check.json", enabled: true },
      ],
    });
    const reopened = await NativeAgentHooks.open(f.directory, f.workspace);
    expect(await reopened.inspect(active)).toMatchObject({
      activation: "current",
      saved: [{ revision: stored.saved[0].revision }],
    });
    expect(
      (await fs.stat(path.join(f.directory, "hooks.json"))).mode & 0o777
    ).toBe(0o600);
  });

  it("binds review to its owner and consumes it once", async () => {
    const f = await fixture();
    const other = await fixture();
    const review = await f.owner.review(f.file);
    await expect(other.owner.install(review)).rejects.toThrow(
      "native_hook_review_unavailable"
    );
    await f.owner.install(review);
    await expect(f.owner.install(review)).rejects.toThrow(
      "native_hook_review_unavailable"
    );
    await expect(f.owner.install({ ...review })).rejects.toThrow(
      "native_hook_review_unavailable"
    );
  });

  it("refuses user-owned executable code instead of granting trust by pathname", async () => {
    const f = await fixture();
    const local = path.join(f.workspace, "program");
    await fs.copyFile(f.executable, local);
    await fs.writeFile(
      f.file,
      JSON.stringify({ ...f.draft, executable: local })
    );
    await expect(f.owner.review(f.file)).rejects.toThrow(
      "native_hook_configuration_invalid"
    );
    expect((await f.owner.inspect(active)).saved).toEqual([]);
  });

  it("requires the exact saved revision when removing and preserves the running selection", async () => {
    const f = await fixture();
    await f.owner.install(await f.owner.review(f.file));
    const owner = await NativeAgentHooks.open(f.directory, f.workspace);
    const saved = (await owner.inspect(active)).saved[0];
    await expect(owner.remove(saved.id, "stale")).rejects.toThrow(
      "native_hook_revision_changed"
    );
    await owner.remove(saved.id, saved.revision);
    expect(await owner.inspect(active)).toMatchObject({
      activation: "restart_required",
      saved: [],
    });
  });

  it("serializes different registrations without overwriting an adjacent check", async () => {
    const f = await fixture();
    const other = await NativeAgentHooks.open(f.directory, f.workspace);
    const first = await f.owner.review(f.file);
    await fs.writeFile(f.file, JSON.stringify({ ...f.draft, id: "second" }));
    const second = await other.review(f.file);
    await Promise.all([f.owner.install(first), other.install(second)]);
    expect(
      (await f.owner.inspect(active)).saved.map((x) => x.id).sort()
    ).toEqual(["inspect", "second"]);
  });

  it("refuses malformed, over-scoped and unsupported definitions without a partial write", async () => {
    const f = await fixture();
    for (const draft of [
      { ...f.draft, event: "stop" },
      { ...f.draft, event: "before_input" },
      { ...f.draft, timeoutMs: 30001 },
      { ...f.draft, network: "allow" },
    ]) {
      await fs.writeFile(f.file, JSON.stringify(draft));
      await expect(f.owner.review(f.file)).rejects.toThrow(
        "native_hook_configuration_invalid"
      );
    }
    await fs.writeFile(f.file, '{"private-marker":');
    await expect(f.owner.review(f.file)).rejects.toThrow(
      /^native_hook_configuration_invalid$/
    );
    expect((await f.owner.inspect(active)).saved).toEqual([]);
  });

  it("refuses substituted private registry files and mismatched revisions", async () => {
    const f = await fixture();
    await f.owner.install(await f.owner.review(f.file));
    const file = path.join(f.directory, "hooks.json");
    const body = JSON.parse(await fs.readFile(file, "utf8"));
    body.hooks[0].timeoutMs = 1;
    await fs.writeFile(file, JSON.stringify(body));
    await expect(f.owner.inspect(active)).rejects.toThrow(
      "native_hook_configuration_invalid"
    );
    await fs.unlink(file);
    await fs.symlink(f.file, file);
    await expect(f.owner.inspect(active)).rejects.toBeDefined();
  });

  it("stages captured pins without replacing unavailable handler authority", async () => {
    const f = await fixture();
    await f.owner.install(await f.owner.review(f.file));
    const owner = await NativeAgentHooks.open(f.directory, f.workspace);
    const resources = path.join(f.root, "resources");
    await fs.mkdir(path.join(resources, "native-agent"), { recursive: true });
    const helper = path.join(
      resources,
      "native-agent",
      "agent-kit-sandbox-helper"
    );
    await fs.copyFile(f.executable, helper);
    const launch = await owner.launch(resources);
    expect(launch).toMatchObject({
      hooks: [{ id: "inspect", tool: "read_file" }],
      command: { hooksOnly: true },
    });
    if (launch) fixtures.push(launch.command.temporaryParent);
    const registry = path.join(f.directory, "hooks.json");
    const body = JSON.parse(await fs.readFile(registry, "utf8"));
    const { revision: _revision, ...definition } = body.hooks[0];
    definition.executable.sha256[0] ^= 1;
    body.hooks[0] = {
      ...definition,
      revision: createHash("sha256")
        .update(JSON.stringify([f.workspace, definition]))
        .digest("hex"),
    };
    await fs.writeFile(registry, JSON.stringify(body));
    const changed = await NativeAgentHooks.open(f.directory, f.workspace);
    const captured = await changed.launch(resources);
    expect(captured?.hooks[0].executable.sha256).toEqual(
      definition.executable.sha256
    );
    expect(captured?.hooks[0].executable.sha256).not.toEqual(
      launch?.hooks[0].executable.sha256
    );
  });

  it("rejects an oversized combined launch profile before changing saved or active checks", async () => {
    const f = await fixture();
    const resources = path.join(f.root, "resources");
    await fs.mkdir(path.join(resources, "native-agent"), { recursive: true });
    await fs.copyFile(
      f.executable,
      path.join(resources, "native-agent", "agent-kit-sandbox-helper")
    );
    await f.owner.launch(resources, {
      id: "project",
      primary: { id: "main", name: "Project", path: f.workspace },
      additionalReadRoots: [],
      protectedPaths: [],
    });
    for (let index = 0; index < 7; index++) {
      await fs.writeFile(
        f.file,
        JSON.stringify({
          ...f.draft,
          id: `check_${index}`,
          arguments: ["x".repeat(8192)],
        })
      );
      await f.owner.install(await f.owner.review(f.file));
    }
    const before = await fs.readFile(path.join(f.directory, "hooks.json"));
    await fs.writeFile(
      f.file,
      JSON.stringify({
        ...f.draft,
        id: "check_7",
        arguments: ["x".repeat(8192)],
      })
    );
    await expect(f.owner.install(await f.owner.review(f.file))).rejects.toThrow(
      "native_agent_permission_profile_invalid"
    );
    expect(await fs.readFile(path.join(f.directory, "hooks.json"))).toEqual(
      before
    );
    const inspection = await f.owner.inspect(active);
    expect(inspection.saved).toHaveLength(7);
    expect(inspection.activation).toBe("restart_required");
    expect(await f.owner.launch(resources)).toBeUndefined();
    const next = await NativeAgentHooks.open(f.directory, f.workspace);
    const launch = await next.launch(resources);
    expect(launch?.hooks).toHaveLength(7);
    if (launch) fixtures.push(launch.command.temporaryParent);
  });
});
