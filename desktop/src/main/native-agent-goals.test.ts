import { EventEmitter, once } from "node:events";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import type { NativeChatGoalRequest } from "@grida/desktop-bridge";
import { expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeAgentProcess } from "./native-agent-process";
import { NativeChatIpc } from "./native-chat-ipc";

const packaged = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;
const NATIVE_WORK_SLOTS = 8;
const REQUEST: NativeChatGoalRequest = {
  objective: "Prepare the export",
  criteria: ["Inspect the export"],
  allowance: { workTurns: 3, inferenceSteps: 256 },
  automatic: false,
};

async function provider(holdCapacity = false) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    request.setEncoding("utf8");
    let body = "";
    request.on("data", (part: string) => {
      body += part;
    });
    request.on("end", () => {
      requests.push(body);
      const index = requests.length;
      if (
        request.url !== "/v1/chat/completions" ||
        index > (holdCapacity ? NATIVE_WORK_SLOTS : 4)
      ) {
        response.writeHead(400).end();
        return;
      }
      const chunk = (delta: unknown, finish: string | null = null) =>
        `data: ${JSON.stringify({
          id: `goal-response-${index}`,
          choices: [{ index: 0, delta, finish_reason: finish }],
        })}\n\n`;
      response.writeHead(200, { "content-type": "text/event-stream" });
      if (holdCapacity || index <= 2) {
        response.write(
          chunk({ role: "assistant", content: "Working on the export." })
        );
      } else if (index === 3) {
        response.write(
          chunk({
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: "report",
                type: "function",
                function: {
                  name: "goal_report",
                  arguments: JSON.stringify({
                    report: {
                      kind: "completion",
                      summary: "Export complete",
                      evidence: [{ criterion: 1, call: "invented-evidence" }],
                    },
                  }),
                },
              },
            ],
          })
        );
        response.end(chunk({}, "tool_calls") + "data: [DONE]\n\n");
      } else {
        response.write(
          chunk({ role: "assistant", content: "Everything is complete." })
        );
        response.end(chunk({}, "stop") + "data: [DONE]\n\n");
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("fixture_listener_unavailable");
  return {
    endpoint: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: async () => {
      const closed = once(server, "close");
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}

it.runIf(Boolean(packaged))(
  "retains an unclaimed goal through restart and requires withdrawal instead of text replacement",
  async () => {
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "grida-pending-goal-")
    );
    const cwd = path.join(root, "workspace");
    fs.mkdirSync(cwd, { mode: 0o700 });
    const endpoint = await provider(true);
    const launch = {
      resourcesPath: packaged!,
      stateDirectory: path.join(root, "state"),
      provider: "openai-compatible",
      endpoint: endpoint.endpoint,
      model: "fixture",
    } as const;
    const wireGoal = {
      objective: { description: REQUEST.objective, criteria: REQUEST.criteria },
      allowance: { work_turns: 3, inference_steps: 256 },
      automatic: false,
    };
    let child: NativeAgentProcess | undefined;
    let chat: NativeAgentChat | undefined;
    try {
      child = await NativeAgentProcess.start({
        ...launch,
        capabilities: {
          "co.grida/session/submit": 1,
          "co.grida/session/snapshot": 1,
          "co.grida/session/input": 1,
          "co.grida/session/replace": 1,
          "co.grida/goal/start": 1,
        },
      });
      const newSession = async () =>
        (await child!.request("session/new", { cwd, mcpServers: [] })) as {
          sessionId: string;
        };
      for (let slot = 0; slot < NATIVE_WORK_SLOTS; slot++) {
        const { sessionId } = await newSession();
        await child.request("_co.grida/session/submit", {
          sessionId,
          inputId: `occupy-${slot}`,
          prompt: [{ type: "text", text: "Hold this work slot." }],
        });
      }
      await vi.waitFor(() =>
        expect(endpoint.requests).toHaveLength(NATIVE_WORK_SLOTS)
      );
      const { sessionId } = await newSession();
      const accepted = await child.request("_co.grida/goal/start", {
        sessionId,
        inputId: "pending-goal",
        prompt: [{ type: "text", text: "Original prompt wording." }],
        goal: wireGoal,
      });
      expect(accepted).toMatchObject({
        inputId: "pending-goal",
        disposition: "queued",
      });
      const snapshot = (await child.request("_co.grida/session/snapshot", {
        sessionId,
      })) as {
        sessionRevision: number;
      };
      expect(snapshot).toMatchObject({
        current: null,
        queue: [{ inputId: "pending-goal", settings: { goalStart: wireGoal } }],
      });
      await expect(
        child.request("_co.grida/session/replace", {
          queue: {
            sessionId,
            requestId: "replace-goal",
            expectedSessionRevision: snapshot.sessionRevision,
          },
          inputId: "pending-goal",
          replacementInputId: "ordinary",
          prompt: [
            { type: "text", text: "Turn the goal into an ordinary prompt." },
          ],
        })
      ).rejects.toThrow("queued_goal_requires_withdrawal");
      expect(
        await child.request("_co.grida/session/input", {
          sessionId,
          inputId: "pending-goal",
        })
      ).toMatchObject({
        receipt: { disposition: "queued" },
        settings: { goalStart: wireGoal },
      });
      expect(
        await child.request("_co.grida/session/snapshot", { sessionId })
      ).toEqual(snapshot);

      await child.close();
      child = undefined;
      chat = await NativeAgentChat.start({ ...launch, cwd });
      const session = await chat.load(sessionId);
      const reopened = await chat.observe(session);
      expect(reopened).toMatchObject({
        current: null,
        queuedInputs: 1,
        pendingGoalId: "pending-goal",
      });
      expect((await chat.goal(session, reopened)).goal).toBeNull();
      expect((await chat.queue(session, reopened, 0)).items).toEqual([
        {
          inputId: "pending-goal",
          preview: REQUEST.objective,
          goalStart: REQUEST,
        },
      ]);
      await expect(
        chat.queuedText(session, reopened, "pending-goal")
      ).rejects.toThrow("native_chat_queue_input_unavailable");
      const withdraw = {
        action: "withdraw",
        inputId: "pending-goal",
        observationId: "fixture-reopened",
        requestId: "withdraw-goal",
      } as const;
      const receipt = await chat.editQueue(session, reopened, withdraw);
      await expect(
        chat.editQueue(session, reopened, withdraw)
      ).resolves.toEqual(receipt);
      expect(
        (await chat.inputReceipt(session, "pending-goal")).disposition
      ).toBe("withdrawn");
      expect((await chat.observe(session)).pendingGoalId).toBeUndefined();
      expect(endpoint.requests).toHaveLength(NATIVE_WORK_SLOTS);
    } finally {
      try {
        await child?.close();
        await chat?.close();
      } finally {
        await endpoint.close();
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  },
  20_000
);

it.runIf(Boolean(packaged))(
  "starts an explicit goal, retains a pause across restart, and reports unverified work truthfully",
  async () => {
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "grida-goals-")
    );
    const cwd = path.join(root, "workspace");
    fs.mkdirSync(cwd, { mode: 0o700 });
    const endpoint = await provider();
    const origin = "https://editor.fixture.invalid";
    const frame = { url: `${origin}/desktop/workspace?id=workspace` };
    const sender = Object.assign(new EventEmitter(), {
      mainFrame: frame,
      isDestroyed: () => false,
      isLoadingMainFrame: () => false,
    }) as unknown as WebContents;
    const event = {
      sender,
      senderFrame: frame,
    } as unknown as IpcMainInvokeEvent;
    const launch = () =>
      NativeAgentChat.start({
        resourcesPath: packaged!,
        stateDirectory: path.join(root, "state"),
        cwd,
        provider: "openai-compatible",
        endpoint: endpoint.endpoint,
        model: "fixture",
      });
    let chat: NativeAgentChat | undefined;
    const ipc = new NativeChatIpc(origin, (candidate) =>
      candidate === sender && chat ? { workspaceId: "workspace", chat } : null
    );
    try {
      chat = await launch();
      const session = await ipc.create(event);
      let attachmentId = session.attachmentId;
      const snapshot = () => ipc.observe(event, attachmentId);
      const goal = async () =>
        ipc.goal(event, attachmentId, (await snapshot()).observationId);
      expect(await goal()).toEqual({ observationId: null, goal: null });
      await expect(
        ipc.startGoal(event, attachmentId, "invalid", {
          ...REQUEST,
          autoAcceptProposal: true,
        })
      ).rejects.toThrow("native_chat_goal_invalid");
      expect(endpoint.requests).toHaveLength(0);

      const accepted = await ipc.startGoal(
        event,
        attachmentId,
        "first-goal",
        REQUEST
      );
      expect(accepted.disposition).toBe("queued");
      await vi.waitFor(() => expect(endpoint.requests).toHaveLength(1));
      expect(
        (await ipc.startGoal(event, attachmentId, "first-goal", REQUEST))
          .inputPosition
      ).toBe(accepted.inputPosition);
      const running = await goal();
      const turnId = running.goal?.reservation?.turnId;
      expect(running.goal).toEqual(
        expect.objectContaining({
          goalId: "first-goal",
          automatic: false,
          state: { status: "active" },
          reservation: expect.objectContaining({ turnId: expect.any(String) }),
        })
      );
      const pause = {
        observationId: running.observationId,
        requestId: "pause-goal",
        action: "pause",
      };
      const paused = await ipc.controlGoal(event, attachmentId, pause);
      await expect(
        ipc.controlGoal(event, attachmentId, pause)
      ).resolves.toEqual(paused);
      await expect(
        ipc.controlGoal(event, attachmentId, {
          ...pause,
          action: "clear",
          requestId: "stale",
        })
      ).rejects.toThrow("stale_session_revision");
      await vi.waitFor(async () => {
        expect((await snapshot()).snapshot.current?.disposition).toBe(
          "suspended"
        );
        expect((await goal()).goal?.paused).toBe(true);
      });

      await chat.close();
      chat = await launch();
      attachmentId = (await ipc.load(event, session.sessionId)).attachmentId;
      const reopened = await goal();
      expect(reopened.goal?.paused).toBe(true);
      expect(reopened.goal?.reservation?.turnId).toBe(turnId);
      expect(endpoint.requests).toHaveLength(1);
      const resumed = await ipc.controlGoal(event, attachmentId, {
        observationId: reopened.observationId,
        requestId: "resume-goal",
        action: "resume",
      });
      expect(resumed.turnId).toBe(turnId);
      await vi.waitFor(() => expect(endpoint.requests).toHaveLength(2));
      const stoppedTurn = await snapshot();
      await ipc.control(event, attachmentId, {
        observationId: stoppedTurn.observationId,
        requestId: "stop-goal-work",
        action: "stop",
      });
      await vi.waitFor(async () => {
        expect((await snapshot()).snapshot.current).toBeNull();
        expect((await goal()).goal).toEqual(
          expect.objectContaining({
            goalId: "first-goal",
            state: { status: "blocked", reason: "uncertain_work" },
            reservation: expect.objectContaining({ uncertain: true }),
          })
        );
      });

      attachmentId = (await ipc.create(event)).attachmentId;
      await ipc.startGoal(event, attachmentId, "second-goal", REQUEST);
      await vi.waitFor(() => expect(endpoint.requests).toHaveLength(4));
      const blocked = await vi.waitFor(async () => {
        const inspected = await goal();
        expect(inspected.goal?.state).toEqual({
          status: "blocked",
          reason: "unverified_completion",
        });
        return inspected;
      });
      await ipc.controlGoal(event, attachmentId, {
        observationId: blocked.observationId,
        requestId: "clear-goal",
        action: "clear",
      });
      expect((await goal()).goal?.state).toEqual({ status: "cleared" });
      expect(endpoint.requests).toHaveLength(4);
    } finally {
      try {
        await chat?.close();
      } finally {
        await endpoint.close();
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  },
  20_000
);
