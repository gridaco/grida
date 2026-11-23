import { EventEmitter, once } from "node:events";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import {
  NativeAgentPermissions,
  type NativeApprovalReview,
  type NativeWorkspaceSelection,
} from "./native-agent-permissions";
import {
  NativeAgentProcess,
  type NativeAgentLaunch,
} from "./native-agent-process";
import { NativeAgentChat, type NativeChatLifecycle } from "./native-agent-chat";
import { NativeChatIpc } from "./native-chat-ipc";

const supported = process.platform === "darwin" || process.platform === "linux";
const packaged = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;

function workspaceFixture() {
  const base = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "grida-approvals-")
  );
  const directory = (id: string) => {
    const root = path.join(base, id);
    fs.mkdirSync(root, { mode: 0o700 });
    return { id, name: id, path: root };
  };
  const primary = directory("primary");
  const additional = directory("additional");
  const protectedRoot = directory("protected");
  const workspace: NativeWorkspaceSelection = {
    id: "project",
    primary,
    additionalReadRoots: [additional],
    protectedPaths: [protectedRoot.path],
  };
  return {
    workspace,
    additional,
    stateDirectory: path.join(base, "native-state"),
    configHome: path.join(base, "grida-home"),
    close: () => fs.rmSync(base, { recursive: true, force: true }),
  };
}

type FixtureAction = { name: string; args: object; review?: string };

function completion(text: string | null, action: FixtureAction) {
  const delta =
    text === null
      ? {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: "fixture-call",
              type: "function",
              function: {
                name: action.name,
                arguments: JSON.stringify(action.args),
              },
            },
          ],
        }
      : { role: "assistant", content: text };
  return (
    [
      { delta, finish_reason: null },
      { delta: {}, finish_reason: text === null ? "tool_calls" : "stop" },
    ]
      .map(
        (choice) =>
          `data: ${JSON.stringify({
            id: "fixture-response",
            choices: [{ index: 0, ...choice }],
          })}\n\n`
      )
      .join("") + "data: [DONE]\n\n"
  );
}

/** Give the native host a narrow read profile so separate file grants take effect. */
function useScopedFileReads() {
  const stage = NativeAgentPermissions.stage.bind(NativeAgentPermissions);
  const spy = vi
    .spyOn(NativeAgentPermissions, "stage")
    .mockImplementation(async (...args) => {
      const staged = await stage(...args);
      const profile = JSON.parse(fs.readFileSync(staged.profile, "utf8"));
      profile.command.diskRead = false;
      // macOS /bin/sh reads its selected shell from this system directory.
      if (process.platform === "darwin")
        profile.command.runtimePaths.push("/private/var/select");
      const file = path.join(staged.stateDirectory, "scoped-file-reads.json");
      fs.writeFileSync(file, JSON.stringify(profile), { mode: 0o600 });
      return { ...staged, profile: file };
    });
  onTestFinished(() => spy.mockRestore());
}

function readScopedFile(directory: string, file: string): FixtureAction {
  return {
    name: "exec_command",
    args: {
      cmd: "/bin/cat",
      access: "read",
      input_file: { directory, path: file },
    },
  };
}

async function fixtureProvider(
  action: FixtureAction,
  beforeReply?: (index: number) => Promise<void>
) {
  const replies = [
    null,
    ...(action.review ? [action.review] : []),
    "Read complete.",
  ];
  const received: string[] = [];
  const server = createServer((request, response) => {
    request.setEncoding("utf8");
    let body = "";
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", async () => {
      const index = received.length;
      received.push(body);
      if (
        request.method !== "POST" ||
        request.url !== "/v1/chat/completions" ||
        received.length > replies.length
      ) {
        response.writeHead(400).end();
        return;
      }
      await beforeReply?.(index);
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(completion(replies[index], action));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("fixture_listener_unavailable");
  return {
    endpoint: `http://127.0.0.1:${address.port}/v1`,
    received,
    close: async () => {
      const closed = once(server, "close");
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}

describe.skipIf(!supported)("Native agent workspace permissions", () => {
  it("derives stable private read rules from the selected roots", async () => {
    const test = workspaceFixture();
    try {
      const { profile } = await NativeAgentPermissions.stage(
        test.stateDirectory,
        test.workspace
      );
      expect(
        (
          await NativeAgentPermissions.stage(
            test.stateDirectory,
            test.workspace
          )
        ).profile
      ).toBe(profile);
      const selected = JSON.parse(fs.readFileSync(profile, "utf8"));
      expect(selected).toEqual(
        expect.objectContaining({
          version: 1,
          revision: "ask-me-v1",
          primary: "primary",
          protectedPaths: test.workspace.protectedPaths,
          directories: [
            expect.objectContaining({ id: "primary", read: "allow" }),
            expect.objectContaining({ id: "additional", read: "ask" }),
          ],
        })
      );
      expect(selected.command).toBeUndefined();
      expect(fs.statSync(profile).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.dirname(profile)).mode & 0o777).toBe(0o700);
      const narrower = await NativeAgentPermissions.stage(test.stateDirectory, {
        ...test.workspace,
        additionalReadRoots: [],
      });
      expect(narrower.profile).not.toBe(profile);
      expect(JSON.parse(fs.readFileSync(profile, "utf8"))).toEqual(selected);
      fs.chmodSync(test.stateDirectory, 0o755);
      await expect(
        NativeAgentPermissions.stage(test.stateDirectory, test.workspace)
      ).rejects.toThrow("native_agent_permission_state_not_private");
    } finally {
      test.close();
    }
  });

  it("gives the project the Default preset when commands are available", async () => {
    const test = workspaceFixture();
    try {
      const command = {
        helper: { path: "/usr/bin/true", sha256: Array(32).fill(0) },
        runtimePaths: ["/usr/bin"],
        temporaryParent: path.join(path.dirname(test.stateDirectory), "tmp"),
        diskRead: true as const,
        environment: { PATH: "/usr/bin:/bin" },
      };
      const { profile } = await NativeAgentPermissions.stage(
        test.stateDirectory,
        test.workspace,
        undefined,
        command
      );
      const selected = JSON.parse(fs.readFileSync(profile, "utf8"));
      expect(selected.revision).toBe("default-v1");
      expect(selected.directories[0]).toEqual(
        expect.objectContaining({
          id: "primary",
          read: "allow",
          write: "allow",
          commandRead: "allow",
          commandReadWrite: "allow",
        })
      );
      // Additional folders still ask before any read.
      expect(selected.directories[1]).toEqual(
        expect.objectContaining({ id: "additional", read: "ask" })
      );
      expect(selected.directories[1].write).toBeUndefined();
      expect(selected.command).toEqual(command);
    } finally {
      test.close();
    }
  });

  it("refuses to offer a review assembled from different control revisions", async () => {
    const request =
      vi.fn<(method: string, params: unknown) => Promise<unknown>>();
    request
      .mockResolvedValueOnce({
        sessionId: "session",
        sessionRevision: 5,
        current: { turnId: "turn", controlRevision: 1 },
      })
      .mockResolvedValueOnce({
        sessionId: "session",
        turnId: "turn",
        controlRevision: 2,
        approvals: [],
      });
    const permissions = new NativeAgentPermissions(request, new Map());
    await expect(permissions.list("session", "turn")).rejects.toThrow(
      "native_agent_approval_invalid"
    );
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("offers a manual decision only after automatic review hands it off", async () => {
    const row = {
      waitId: "approval/network/destination",
      request: {
        session: "session",
        turn: "turn",
        directory: "project",
        root: "/project",
        effect: {
          kind: "command",
          command: "curl https://registry.example.test/",
          executable: "/bin/sh",
          cwd: "/project",
          access: "read",
          terminal: false,
          finite: true,
          network: { host: "registry.example.test", port: 443 },
        },
      },
    };
    let pending: object = { ...row, reviewing: true };
    const request = vi.fn<
      (method: string, params: unknown) => Promise<unknown>
    >(async (method) =>
      method.endsWith("/snapshot")
        ? {
            sessionId: "session",
            sessionRevision: 5,
            current: { turnId: "turn", controlRevision: 1 },
          }
        : {
            sessionId: "session",
            turnId: "turn",
            controlRevision: 1,
            approvals: [pending],
          }
    );
    const permissions = new NativeAgentPermissions(request, new Map(), {
      project: { id: "project", path: "/project" },
      protectedPaths: [],
      workspaceId: "workspace",
    });

    await expect(permissions.list("session", "turn")).resolves.toEqual([]);
    pending = { ...row, reviewing: "true" };
    await expect(permissions.list("session", "turn")).rejects.toThrow(
      "native_agent_approval_invalid"
    );
    pending = { ...row, reviewFailure: "needs_human" };
    await expect(permissions.list("session", "turn")).resolves.toMatchObject([
      {
        waitId: row.waitId,
        tool: "exec_command",
        network: row.request.effect.network,
        reviewFailure: "needs_human",
      },
    ]);
  });

  it("binds external reads and network commands to a workspace launch and the issuing workspace", async () => {
    const command = {
      kind: "command",
      command: "curl https://example.org",
      executable: "/bin/sh",
      cwd: "/project",
      access: "read",
      terminal: false,
      finite: true,
      network: { host: "example.org", port: 443 },
      filesystem: {
        disk_read: true,
        resolved_executable: "/bin/sh",
        resolved_cwd: "/project",
        read_roots: ["/project"],
        write_roots: [],
        runtime_roots: ["/usr/bin"],
        private_temp_write: true,
      },
      environment_names: ["PATH"],
    };
    const read = {
      kind: "read",
      tool: "read_file",
      relative_path: "outside/note.txt",
    };
    const req = (directory: string, root: string, effect: object) =>
      vi.fn<(method: string, params: unknown) => Promise<unknown>>(
        async (method) =>
          method.endsWith("/snapshot")
            ? {
                sessionId: "s",
                sessionRevision: 1,
                current: { turnId: "t", controlRevision: 1 },
              }
            : {
                sessionId: "s",
                turnId: "t",
                controlRevision: 1,
                approvals: [
                  {
                    waitId: "wait",
                    reviewFailure: "timed_out",
                    request: {
                      session: "s",
                      turn: "t",
                      directory,
                      root,
                      effect,
                    },
                  },
                ],
              }
      );
    const scope = {
      project: { id: "project", path: "/project" },
      protectedPaths: ["/private-store"],
      workspaceId: "workspace",
    };
    const list = (
      directory: string,
      root: string,
      effect: object,
      enabled = true
    ) =>
      new NativeAgentPermissions(
        req(directory, root, effect),
        new Map(),
        enabled ? scope : undefined
      ).list("s", "t");
    const [external] = await list("external-file", "/", read);
    expect(external).toMatchObject({
      tool: "read_file",
      relativePath: "outside/note.txt",
      reviewFailure: "timed_out",
    });
    await expect(list("external-file", "/", read, false)).rejects.toThrow(
      "invalid"
    );
    await expect(
      list("external-file", "/", {
        ...read,
        relative_path: "private-store/secret",
      })
    ).rejects.toThrow("invalid");
    await expect(
      list("external-file", "/", { ...read, tool: "list_files" })
    ).rejects.toThrow("invalid");
    await expect(list("project", "/project", command)).resolves.toMatchObject([
      {
        tool: "exec_command",
        network: command.network,
        scope: {
          diskRead: true,
          readRoots: ["/project"],
          writeRoots: [],
          environmentNames: ["PATH"],
        },
      },
    ]);
    const [unknownNetworkScope] = await list("project", "/project", {
      ...command,
      network: { ...command.network, additionalScope: true },
    });
    expect(unknownNetworkScope).not.toHaveProperty("scope");
    const [sessionCommand] = await list("project", "/project", {
      ...command,
      finite: undefined,
      terminal: true,
      network: undefined,
      managed_network: true,
    });
    expect(sessionCommand).toMatchObject({
      process: "terminal",
      managedNetwork: true,
      scope: expect.any(Object),
    });
    const [connection] = await list("project", "/project", {
      ...command,
      finite: undefined,
      managed_network: true,
    });
    expect(connection).toMatchObject({
      process: "session",
      network: { host: "example.org", port: 443 },
    });
    await expect(
      list("project", "/project", { ...command, terminal: true })
    ).rejects.toThrow("invalid");
    await expect(
      list("project", "/project", { ...command, cwd: "/other" })
    ).rejects.toThrow("invalid");
    const escalated = {
      kind: "escalated_command",
      command: "next start --hostname 127.0.0.1 --port 43123",
      justification: "Start the requested local preview",
      executable: "/bin/sh",
      cwd: "/project",
      filesystem: { ...command.filesystem, write_roots: ["/project"] },
      environment_names: ["PATH"],
      access: "read_write",
      network: "listen",
      listen_port: 43123,
    };
    await expect(list("project", "/project", escalated)).rejects.toThrow(
      "invalid"
    );
    const responder = req("project", "/project", escalated);
    const owner = new NativeAgentPermissions(responder, new Map(), {
      ...scope,
      commandEscalation: true,
    });
    const [launch] = await owner.list("s", "t");
    expect(launch).toMatchObject({
      tool: "exec_command",
      sandboxPermissions: "require_escalated",
      command: escalated.command,
      justification: escalated.justification,
      cwd: escalated.cwd,
      executable: escalated.executable,
      access: "read_write",
      network: { kind: "listen", port: 43123 },
      scope: {
        diskRead: true,
        writeRoots: ["/project"],
        environmentNames: ["PATH"],
      },
    });
    responder.mockImplementationOnce(async (_method, params) => ({
      sessionId: "s",
      turnId: "t",
      requestId: (params as { requestId: string }).requestId,
      sessionRevision: 2,
      journalPosition: 1,
    }));
    await expect(owner.answer(launch, "approve_once")).resolves.toMatchObject({
      sessionId: "s",
    });
    const { listen_port: _, ...offline } = escalated;
    const [offlineReview] = await new NativeAgentPermissions(
      req("project", "/project", { ...offline, network: "denied" }),
      new Map(),
      { ...scope, commandEscalation: true }
    ).list("s", "t");
    expect(offlineReview).toMatchObject({
      network: { kind: "denied" },
      scope: { diskRead: true },
    });
    const [managed] = await new NativeAgentPermissions(
      req("project", "/project", { ...offline, network: "managed" }),
      new Map(),
      { ...scope, commandEscalation: true }
    ).list("s", "t");
    expect(managed).toMatchObject({
      network: { kind: "managed" },
      scope: { diskRead: true },
    });
    for (const unverified of [
      { ...escalated, filesystem: undefined },
      { ...offline, network: undefined },
      { ...escalated, access: undefined },
      { ...escalated, access: "full" },
      { ...escalated, access: "read" },
      { ...escalated, network: { host: "example.org", port: 443 } },
      { ...escalated, network: "denied" },
      { ...escalated, network: "managed" },
      { ...offline, network: "listen" },
      { ...escalated, listen_port: 0 },
      { ...escalated, listen_port: 1.5 },
      { ...escalated, listen_port: 65536 },
      {
        ...escalated,
        filesystem: { ...escalated.filesystem, full_disk_write: true },
      },
      {
        ...escalated,
        filesystem: { ...escalated.filesystem, resolved_cwd: "/other" },
      },
    ]) {
      const host = new NativeAgentPermissions(
        req("project", "/project", unverified),
        new Map(),
        { ...scope, commandEscalation: true }
      );
      const [review] = await host.list("s", "t");
      expect(review).not.toHaveProperty("scope");
      expect(review).not.toHaveProperty("network");
      await expect(host.answer(review, "approve_once")).rejects.toThrow(
        "invalid"
      );
    }
    const other = new NativeAgentPermissions(
      req("external-file", "/", read),
      new Map(),
      { ...scope, protectedPaths: ["/other-private-store"] }
    );
    const oldHost = new NativeAgentPermissions(
      req("project", "/project", { ...command, filesystem: undefined }),
      new Map(),
      scope
    );
    const [unverifiedCommand] = await oldHost.list("s", "t");
    await expect(
      oldHost.answer(unverifiedCommand, "approve_once")
    ).rejects.toThrow("invalid");
    await expect(
      list("project", "/project", {
        ...command,
        filesystem: { ...command.filesystem, disk_read: "unknown" },
      })
    ).rejects.toThrow("invalid");
    const foreignWorkspace = new NativeAgentPermissions(
      req("external-file", "/", read),
      new Map(),
      { ...scope, workspaceId: "other" }
    );
    await expect(
      foreignWorkspace.answer(external, "approve_once")
    ).rejects.toThrow("invalid");
    await expect(other.answer(external, "approve_once")).rejects.toThrow(
      "invalid"
    );
  });

  it("rejects retained workspace settings file reviews", async () => {
    const settingsRoot = "/fixture/chats/workspaces/settings";
    const list = async (approval: Record<string, unknown>) => {
      const request =
        vi.fn<(method: string, params: unknown) => Promise<unknown>>();
      request
        .mockResolvedValueOnce({
          sessionId: "session",
          sessionRevision: 5,
          current: { turnId: "turn", controlRevision: 1 },
        })
        .mockResolvedValueOnce({
          sessionId: "session",
          turnId: "turn",
          controlRevision: 1,
          approvals: [
            {
              waitId: "approval/settings",
              request: { session: "session", turn: "turn", ...approval },
            },
          ],
        });
      return new NativeAgentPermissions(
        request,
        new Map([["additional", "/fixture/additional"]])
      ).list("session", "turn");
    };
    const write = (tool: string, relative_path: string) => ({
      kind: "write",
      tool,
      relative_path,
    });
    for (const approval of [
      {
        directory: "agent-settings",
        root: settingsRoot,
        effect: write("edit_file", "config.toml"),
      },
      {
        directory: "agent-settings",
        root: "/fixture/elsewhere",
        effect: write("write_file", "config.toml"),
      },
      {
        directory: "additional",
        root: "/fixture/additional",
        effect: write("write_file", "config.toml"),
      },
      {
        directory: "agent-settings",
        root: settingsRoot,
        effect: {
          kind: "read",
          tool: "read_file",
          relative_path: "config.toml",
        },
      },
    ])
      await expect(list(approval)).rejects.toThrow(
        "native_agent_approval_invalid"
      );
  });
});

it.runIf(Boolean(packaged) && supported)(
  "uses private Desktop stdio to approve an exact Rust read and retry its receipt after restart",
  async () => {
    const test = workspaceFixture();
    useScopedFileReads();
    const provider = await fixtureProvider(
      readScopedFile("additional", "note.txt")
    );
    fs.writeFileSync(
      path.join(test.additional.path, "note.txt"),
      "approved native fixture text"
    );
    let agent: NativeAgentProcess | undefined;
    try {
      const launch: NativeAgentLaunch = {
        resourcesPath: packaged!,
        stateDirectory: test.stateDirectory,
        configHome: test.configHome,
        provider: "openai-compatible",
        endpoint: provider.endpoint,
        model: "fixture",
        capabilities: { "co.grida/session/submit": 1 },
        workspace: test.workspace,
      };
      agent = await NativeAgentProcess.start(launch);
      const attachment = { cwd: test.workspace.primary.path, mcpServers: [] };
      const { sessionId } = (await agent.request(
        "session/new",
        attachment
      )) as { sessionId: string };
      const { turnId } = (await agent.request("_co.grida/session/submit", {
        sessionId,
        inputId: "fixture-input",
        prompt: [{ type: "text", text: "Read the selected reference" }],
      })) as { turnId: string };
      const review = await vi.waitFor(
        async () => {
          const reviews = await agent!.permissions!.list(sessionId, turnId);
          expect(reviews).toHaveLength(1);
          return reviews[0];
        },
        { timeout: 5000 }
      );
      expect(review).toEqual(
        expect.objectContaining({
          sessionId,
          turnId,
          directory: "additional",
          root: test.additional.path,
          tool: "read_file",
          relativePath: "note.txt",
        }) satisfies Partial<NativeApprovalReview>
      );
      expect(provider.received).toHaveLength(1);
      expect(provider.received[0]).not.toContain(
        "approved native fixture text"
      );
      expect(provider.received[0]).toContain('"input_file"');
      expect(provider.received[0]).toContain("exec_command");
      expect(provider.received[0]).toContain("write_stdin");
      await expect(
        agent.request(NativeAgentPermissions.answerMethod, {})
      ).rejects.toThrow("native_agent_approval_requires_review");
      await expect(
        agent.permissions!.answer({ ...review }, "approve_once")
      ).rejects.toThrow("native_agent_approval_invalid");
      const receipt = await agent.permissions!.answer(review, "approve_once");
      await vi.waitFor(
        async () => {
          expect(
            await agent!.request("_co.grida/session/snapshot", { sessionId })
          ).toEqual(
            expect.objectContaining({
              current: null,
              latest: expect.objectContaining({ status: "succeeded" }),
            })
          );
        },
        { timeout: 5000 }
      );
      expect(provider.received).toHaveLength(2);
      expect(provider.received[1]).toContain("approved native fixture text");
      await agent.close();
      agent = await NativeAgentProcess.start(launch);
      await agent.request("session/load", { ...attachment, sessionId });
      expect(await agent.permissions!.answer(review, "approve_once")).toEqual(
        receipt
      );
      await expect(
        agent.permissions!.answer(review, "decline")
      ).rejects.toThrow("request_identity_reused");
      expect(provider.received).toHaveLength(2);
    } finally {
      try {
        await agent?.close();
      } finally {
        await provider.close();
        test.close();
      }
    }
  },
  15000
);

it.runIf(Boolean(packaged) && supported)(
  "reviews an additional-root read through the guarded Desktop bridge and replays only the exact decision",
  async () => {
    const test = workspaceFixture();
    useScopedFileReads();
    const provider = await fixtureProvider(
      readScopedFile("additional", "note.txt")
    );
    const notices: NativeChatLifecycle[] = [];
    const origin = "https://editor.fixture.invalid";
    const frame = {
      url: `${origin}/desktop/workspace?id=${test.workspace.id}`,
    };
    const sender = Object.assign(new EventEmitter(), {
      mainFrame: frame,
      isDestroyed: () => false,
      isLoadingMainFrame: () => false,
    }) as unknown as WebContents;
    const event = {
      sender,
      senderFrame: frame,
    } as unknown as IpcMainInvokeEvent;
    fs.writeFileSync(
      path.join(test.additional.path, "note.txt"),
      "reviewed bridge fixture content"
    );
    let chat: NativeAgentChat | undefined;
    try {
      const launch = {
        resourcesPath: packaged!,
        cwd: test.workspace.primary.path,
        stateDirectory: test.stateDirectory,
        configHome: test.configHome,
        provider: "openai-compatible" as const,
        endpoint: provider.endpoint,
        model: "fixture",
        workspace: test.workspace,
        onLifecycle: (notice: NativeChatLifecycle) => notices.push(notice),
      };
      chat = await NativeAgentChat.start(launch);
      const active = { workspaceId: test.workspace.id, chat };
      const ipc = new NativeChatIpc(origin, (candidate) =>
        candidate === sender ? active : null
      );
      const initial = await ipc.create(event);
      const { sessionId } = initial;
      const accepted = await ipc.submit(
        event,
        initial.attachmentId,
        "fixture-input",
        "Read the reference"
      );
      ipc.detach(event, initial.attachmentId);
      await vi.waitFor(() =>
        expect(notices).toEqual([
          {
            kind: "approval_required",
            sessionId,
            turnId: accepted.turnId,
            waitId: expect.any(String),
          },
        ])
      );
      const { attachmentId } = await ipc.load(event, sessionId);
      const review = await vi.waitFor(
        async () => {
          const observed = await ipc.observe(event, attachmentId);
          const approvals = await ipc.approvals(
            event,
            attachmentId,
            observed.observationId
          );
          expect(approvals).toHaveLength(1);
          return approvals[0];
        },
        { timeout: 5000 }
      );
      expect(review).toEqual({
        reviewId: expect.any(String),
        tool: "read_file",
        relativePath: "note.txt",
        root: test.additional.path,
      });
      expect(provider.received).toHaveLength(1);
      expect(provider.received[0]).not.toContain(
        "reviewed bridge fixture content"
      );
      const receipt = await ipc.answerApproval(
        event,
        attachmentId,
        review.reviewId,
        "approve_once"
      );
      await vi.waitFor(async () => {
        const observed = await ipc.observe(event, attachmentId);
        expect(observed.snapshot.latest?.status).toBe("succeeded");
      });
      await vi.waitFor(() =>
        expect(notices.at(-1)).toEqual({
          kind: "settled",
          sessionId,
          turnId: accepted.turnId,
          status: "succeeded",
          readPreview: expect.any(Function),
        })
      );
      expect(provider.received).toHaveLength(2);
      expect(provider.received[1]).toContain("reviewed bridge fixture content");
      await expect(
        ipc.answerApproval(event, attachmentId, review.reviewId, "approve_once")
      ).resolves.toEqual(receipt);
      await expect(
        ipc.answerApproval(event, attachmentId, review.reviewId, "decline")
      ).rejects.toThrow("request_identity_reused");
      sender.emit("did-start-navigation", { isMainFrame: true });
      await expect(
        ipc.answerApproval(event, attachmentId, review.reviewId, "approve_once")
      ).rejects.toThrow("native_chat_attachment_unavailable");
      expect(notices).toHaveLength(2);
      await chat.close();
      chat = await NativeAgentChat.start(launch);
      await chat.transcript(await chat.load(sessionId));
      expect(notices).toHaveLength(2);
      expect(provider.received).toHaveLength(2);
    } finally {
      try {
        await chat?.close();
      } finally {
        await provider.close();
        test.close();
      }
    }
  },
  15000
);

it.runIf(Boolean(packaged) && supported)(
  "uses the selected native reviewer for an external read and reopens its decision",
  async () => {
    const test = workspaceFixture();
    useScopedFileReads();
    const reference = path.join(
      path.dirname(test.stateDirectory),
      "schedule.txt"
    );
    fs.writeFileSync(reference, "private fixture schedule");
    const reviewReply = Promise.withResolvers<void>();
    const finalReply = Promise.withResolvers<void>();
    const provider = await fixtureProvider(
      {
        ...readScopedFile("external-file", reference.slice(1)),
        review: JSON.stringify({ outcome: "allow" }),
      },
      async (index) => {
        if (index === 1) await reviewReply.promise;
        if (index === 2) await finalReply.promise;
      }
    );
    const launch = {
      resourcesPath: packaged!,
      cwd: test.workspace.primary.path,
      stateDirectory: test.stateDirectory,
      configHome: test.configHome,
      model: "fixture",
      provider: "openai-compatible" as const,
      endpoint: provider.endpoint,
      workspace: { ...test.workspace, allowScopedAccess: true as const },
    };
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start(launch);
      const session = await chat.create();
      const initial = await chat.permissionMode(session);
      expect(initial.available).toContain("approve_for_me");
      await chat.setPermissionMode(
        session,
        initial.revision,
        "enable-review",
        "approve_for_me"
      );
      const turn = await chat.submit(
        session,
        "read-schedule",
        `Read ${reference} for today's schedule.`
      );
      await vi.waitFor(() => expect(provider.received).toHaveLength(2), {
        timeout: 8000,
      });
      const pending = (await chat.observe(session)).current;
      expect(pending).toMatchObject({
        disposition: "running",
        inputNeeded: false,
      });
      const reviews = async () =>
        (await chat!.transcriptPage(session)).turns?.find(
          (record) => record.turnId === turn.turnId
        )?.approvalReviews;
      expect(await reviews()).toMatchObject([
        { decision: "reviewing", action: reference },
      ]);
      reviewReply.resolve();
      await vi.waitFor(() => expect(provider.received).toHaveLength(3), {
        timeout: 8000,
      });
      const resolved = (await chat.observe(session)).current;
      expect(resolved).toMatchObject({
        disposition: "running",
        inputNeeded: false,
      });
      expect(resolved!.controlRevision).toBeGreaterThan(
        pending!.controlRevision
      );
      expect(await reviews()).toMatchObject([
        { decision: "approved", action: reference },
      ]);
      finalReply.resolve();
      await vi.waitFor(
        async () =>
          expect((await chat!.observe(session)).latest?.status).toBe(
            "succeeded"
          ),
        { timeout: 12000 }
      );
      expect(provider.received).toHaveLength(3);
      expect(provider.received[1]).toContain(reference);
      expect(provider.received[1]).not.toContain("private fixture schedule");
      expect(provider.received[2]).toContain("private fixture schedule");
      await chat.close();
      chat = await NativeAgentChat.start(launch);
      const reopened = await chat.load(session.id);
      expect((await chat.permissionMode(reopened)).mode).toBe("approve_for_me");
      const page = await chat.transcriptPage(reopened);
      expect(
        page.turns?.find((record) => record.turnId === turn.turnId)
          ?.approvalReviews
      ).toMatchObject([{ decision: "approved" }]);
      expect(provider.received).toHaveLength(3);
    } finally {
      reviewReply.resolve();
      finalReply.resolve();
      try {
        await chat?.close();
      } finally {
        await provider.close();
        test.close();
      }
    }
  },
  25000
);

it.runIf(Boolean(packaged) && supported)(
  "retains a reconsidered policy denial across restart without submitting work",
  async () => {
    const test = workspaceFixture();
    const rationale = "The requested action exceeds the approved scope.";
    const provider = await fixtureProvider({
      name: "exec_command",
      args: {
        cmd: "printf reviewed",
        access: "read",
        sandbox_permissions: "require_escalated",
        justification: "Inspect the project.",
      },
      review: JSON.stringify({
        outcome: "deny",
        risk_level: "high",
        user_authorization: "low",
        rationale,
      }),
    });
    const launch = {
      resourcesPath: packaged!,
      cwd: test.workspace.primary.path,
      stateDirectory: test.stateDirectory,
      configHome: test.configHome,
      provider: "openai-compatible" as const,
      model: "fixture",
      endpoint: provider.endpoint,
      workspace: { ...test.workspace, allowScopedAccess: true as const },
    };
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start(launch);
      const session = await chat.create();
      const mode = await chat.permissionMode(session);
      await chat.setPermissionMode(
        session,
        mode.revision,
        "select-review",
        "approve_for_me"
      );
      const turn = await chat.submit(
        session,
        "inspect",
        "Inspect the project."
      );
      await vi.waitFor(
        async () =>
          expect((await chat!.observe(session)).latest?.status).toBe(
            "succeeded"
          ),
        { timeout: 12000 }
      );
      const denial = (await chat.transcriptPage(session)).turns?.find(
        (t) => t.turnId === turn.turnId
      )?.approvalReviews?.[0];
      expect(denial).toMatchObject({
        decision: "declined",
        reviewId: expect.any(String),
        riskLevel: "high",
        userAuthorization: "low",
        rationale,
      });
      if (!turn.turnId || !denial?.reviewId)
        throw new Error("missing verified denial");
      await chat.reconsiderDenial(session, turn.turnId, denial.reviewId);
      await chat.close();
      chat = await NativeAgentChat.start(launch);
      const reopened = await chat.load(session.id);
      await chat.reconsiderDenial(reopened, turn.turnId, denial.reviewId);
      const retained = await chat.transcriptPage(reopened);
      expect(
        retained.turns?.find((t) => t.turnId === turn.turnId)
          ?.approvalReviews?.[0]
      ).toMatchObject({ ...denial, reconsidered: true });
      expect(await chat.observe(reopened)).toMatchObject({
        queuedInputs: 0,
        current: null,
      });
      expect(provider.received).toHaveLength(3);
    } finally {
      try {
        await chat?.close();
      } finally {
        await provider.close();
        test.close();
      }
    }
  },
  25000
);

it
  .runIf(Boolean(packaged) && supported)
  .each(["managed connection", "escalation"] as const)(
  "presents the full long command and its actual authority for manual fallback (%s)",
  async (authority) => {
    const test = workspaceFixture();
    const destination = { host: "fixture.invalid", port: 443 };
    const justification = "Write the requested build output.";
    const escalated = authority === "escalation";
    const environmentNames = expect.any(Array);
    const command = `${escalated ? "npm run build" : "/usr/bin/curl --max-time 20 https://fixture.invalid"} # ${"x".repeat(40 * 1024)}`;
    const provider = await fixtureProvider({
      name: "exec_command",
      args: {
        cmd: command,
        access: escalated ? "read_write" : "read",
        ...(escalated
          ? { sandbox_permissions: "require_escalated", justification }
          : { yield_time_ms: 20000 }),
      },
    });
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        resourcesPath: packaged!,
        cwd: test.workspace.primary.path,
        stateDirectory: test.stateDirectory,
        configHome: test.configHome,
        model: "fixture",
        provider: "openai-compatible",
        endpoint: provider.endpoint,
        workspace: { ...test.workspace, allowScopedAccess: true },
      });
      const session = await chat.create();
      const initial = await chat.permissionMode(session);
      await chat.setPermissionMode(
        session,
        initial.revision,
        "select-review",
        "approve_for_me"
      );
      await chat.submit(
        session,
        "check-resource",
        escalated
          ? "Write the production build for this project."
          : "Check https://fixture.invalid with a read-only command."
      );
      const review = await vi.waitFor(
        async () => {
          const snapshot = await chat!.observe(session);
          const [pending] = await chat!.approvals(session, snapshot);
          expect(pending).toBeDefined();
          expect(pending).toMatchObject({
            tool: "exec_command",
            command,
            ...(escalated
              ? {
                  sandboxPermissions: "require_escalated",
                  justification,
                  cwd: test.workspace.primary.path,
                  environmentNames,
                  access: "read_write",
                  network: { kind: "denied" },
                }
              : {
                  access: "read",
                  network: destination,
                  scope: {
                    diskRead: true,
                    resolvedCwd: test.workspace.primary.path,
                    environmentNames,
                  },
                }),
          });
          expect(pending).toMatchObject({
            scope: {
              diskRead: true,
              resolvedCwd: test.workspace.primary.path,
              environmentNames,
            },
          });
          return pending;
        },
        { timeout: 12000 }
      );
      expect(provider.received).toHaveLength(1);
      await chat.answerApproval(session, review, "decline");
      await vi.waitFor(
        async () =>
          expect((await chat!.observe(session)).latest?.status).toBe(
            "succeeded"
          ),
        { timeout: 12000 }
      );
      expect(provider.received).toHaveLength(2);
    } finally {
      try {
        await chat?.close();
      } finally {
        await provider.close();
        test.close();
      }
    }
  },
  30000
);
