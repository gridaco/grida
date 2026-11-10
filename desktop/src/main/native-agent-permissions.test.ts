import { EventEmitter, once } from "node:events";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
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
    close: () => fs.rmSync(base, { recursive: true, force: true }),
  };
}

function completion(text: string | null) {
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
                name: "read_file",
                arguments: JSON.stringify({
                  directory: "additional",
                  path: "note.txt",
                }),
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

async function fixtureProvider() {
  const received: string[] = [];
  const server = createServer((request, response) => {
    request.setEncoding("utf8");
    let body = "";
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      received.push(body);
      if (
        request.method !== "POST" ||
        request.url !== "/v1/chat/completions" ||
        received.length > 2
      ) {
        response.writeHead(400).end();
        return;
      }
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(completion(received.length === 1 ? null : "Read complete."));
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
});

it.runIf(Boolean(packaged) && supported)(
  "uses private Desktop stdio to approve an exact Rust read and retry its receipt after restart",
  async () => {
    const test = workspaceFixture();
    const provider = await fixtureProvider();
    fs.writeFileSync(
      path.join(test.additional.path, "note.txt"),
      "approved native fixture text"
    );
    let agent: NativeAgentProcess | undefined;
    try {
      const launch: NativeAgentLaunch = {
        resourcesPath: packaged!,
        stateDirectory: test.stateDirectory,
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
      expect(provider.received[0]).not.toContain("run_command");
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
    const provider = await fixtureProvider();
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
