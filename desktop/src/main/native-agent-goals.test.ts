import { EventEmitter, once } from "node:events";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import type { NativeChatGoalRequest } from "@grida/desktop-bridge";
import { expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeAgentGoals } from "./native-agent-goals";
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

it("requires monetary capability and preserves the exact cap in the Goal start envelope", async () => {
  const request =
    vi.fn<(method: string, params: unknown) => Promise<unknown>>();
  const goals = new NativeAgentGoals(request);
  const capabilities = { fundedReview: true, namedChild: true };
  expect(() =>
    goals.start(
      "session",
      "input",
      { ...REQUEST, maxCostMills: "10.001" },
      capabilities
    )
  ).toThrow("native_chat_goal_spending_unavailable");
  expect(request).not.toHaveBeenCalled();
  for (const maxCostMills of ["0", "-1", "1e2", "01", "1000000000000000000"]) {
    expect(() =>
      goals.start(
        "session",
        "input",
        { ...REQUEST, maxCostMills },
        { ...capabilities, spending: true }
      )
    ).toThrow("native_chat_goal_invalid");
  }
  goals.start(
    "session",
    "input",
    { ...REQUEST, maxCostMills: "10.001" },
    { ...capabilities, spending: true }
  );
  expect(request).toHaveBeenCalledWith(
    "_co.grida/goal/start",
    expect.objectContaining({ maxCostMills: "10.001" })
  );
});

it("leaves an omitted allowance to the host's product default", async () => {
  const request =
    vi.fn<(method: string, params: unknown) => Promise<unknown>>();
  const goals = new NativeAgentGoals(request);
  const { allowance: _, ...withoutAllowance } = REQUEST;
  await goals.start("session", "input", withoutAllowance, {
    fundedReview: false,
    namedChild: false,
  });
  const [, params] = request.mock.calls[0] as [string, { goal: object }];
  expect(params.goal).not.toHaveProperty("allowance");
  expect(() =>
    goals.start(
      "session",
      "input",
      { ...REQUEST, allowance: { workTurns: 1 } },
      { fundedReview: false, namedChild: false }
    )
  ).toThrow("native_chat_goal_invalid");
});

it("binds a named reviewer only to a negotiated Ultra Goal start", async () => {
  const request =
    vi.fn<(method: string, params: unknown) => Promise<unknown>>();
  const goals = new NativeAgentGoals(request);
  const named = { ...REQUEST, effort: "ultra", namedChildId: "named-reviewer" };
  const capabilities = { fundedReview: true, namedChild: true };
  expect(() =>
    goals.start("session", "input", named, {
      ...capabilities,
      namedChild: false,
    })
  ).toThrow("native_chat_goal_named_child_unavailable");
  expect(() =>
    goals.start(
      "session",
      "input",
      { ...named, effort: "standard" },
      capabilities
    )
  ).toThrow("native_chat_goal_named_child_unavailable");
  expect(() =>
    goals.start(
      "session",
      "input",
      { ...named, operatingRegime: "plan" },
      capabilities
    )
  ).toThrow("native_chat_goal_named_child_unavailable");
  expect(request).not.toHaveBeenCalled();
  await goals.start("session", "input", named, capabilities);
  expect(request).toHaveBeenCalledExactlyOnceWith(
    "_co.grida/goal/start",
    expect.objectContaining({
      sessionId: "session",
      inputId: "input",
      effort: "ultra",
      operatingRegime: "act",
      goal: expect.objectContaining({ named_child: "named-reviewer" }),
    })
  );
});

it("sends confirmation only for the exact negotiated goal review", async () => {
  const basis = { goal: "goal-id", revision: 2 };
  const pending = {
    session: "session",
    revision: 7,
    stateRevision: 3,
    goal: {
      basis,
      objective: { description: REQUEST.objective, criteria: REQUEST.criteria },
      automatic: false,
      allowance: { work_turns: 1, inference_steps: 2 },
      spent: { work_turns: 1, inference_steps: 2 },
      remaining: { work_turns: 0, inference_steps: 0 },
      status: { status: "blocked", reason: "unverified_completion" },
      reservation: null,
      paused: false,
      progress: null,
      review: {
        status: "pending",
        candidate: { basis, turn: "work-turn", summary: "Inspect the export." },
      },
    },
  };
  const request = vi.fn<(method: string, params: unknown) => Promise<unknown>>(
    async (method) =>
      method.endsWith("/inspect")
        ? pending
        : {
            sessionId: "session",
            requestId: "confirmation",
            sessionRevision: 8,
            stateRevision: 4,
            turnId: null,
            journalPosition: null,
          }
  );
  const goals = new NativeAgentGoals(request);
  const change = {
    observationId: "observed-goal",
    requestId: "confirmation",
    action: "confirm_completion",
  } as const;
  const older = await goals.inspect("session", 7);
  expect(older.goal?.review).toBeUndefined();
  await expect(goals.control("session", older, change)).rejects.toThrow(
    "native_chat_goal_completion_review_unavailable"
  );
  const observed = await goals.inspect("session", 7, true);
  expect(observed.goal?.review).toEqual({
    status: "pending",
    turnId: "work-turn",
    summary: "Inspect the export.",
  });
  await expect(
    goals.control("other-session", observed, change)
  ).rejects.toThrow("native_chat_goal_observation_unavailable");
  await expect(
    goals.control("session", { ...observed }, change)
  ).rejects.toThrow("native_chat_goal_observation_unavailable");
  await goals.control("session", observed, change);
  expect(request).toHaveBeenLastCalledWith("_co.grida/goal/control", {
    sessionId: "session",
    requestId: "confirmation",
    expectedSessionRevision: 7,
    expectedStateRevision: 3,
    basis,
    change: { action: "confirm_completion", turn: "work-turn" },
  });
});

it("projects queued manual continuation only on a negotiated worker", async () => {
  const goals = new NativeAgentGoals(async () => ({
    session: "session",
    revision: 7,
    stateRevision: 3,
    goal: {
      basis: { goal: "goal-id", revision: 2 },
      objective: { description: REQUEST.objective, criteria: REQUEST.criteria },
      automatic: false,
      allowance: { work_turns: 2, inference_steps: 3 },
      spent: { work_turns: 1, inference_steps: 2 },
      remaining: { work_turns: 1, inference_steps: 1 },
      status: { status: "active" },
      reservation: null,
      paused: false,
      progress: null,
      continuationPending: true,
    },
  }));
  expect(
    (await goals.inspect("session", 7)).goal?.continuationPending
  ).toBeUndefined();
  expect(
    (await goals.inspect("session", 7, false, true)).goal?.continuationPending
  ).toBe(true);
});

async function provider(
  mode: "completion" | "capacity" | "review" = "completion"
) {
  const requests: string[] = [];
  const maxRequests =
    mode === "capacity" ? NATIVE_WORK_SLOTS : mode === "review" ? 2 : 4;
  const reportAt = mode === "review" ? 1 : 3;
  const server = createServer((request, response) => {
    request.setEncoding("utf8");
    let body = "";
    request.on("data", (part: string) => {
      body += part;
    });
    request.on("end", () => {
      requests.push(body);
      const index = requests.length;
      if (request.url !== "/v1/chat/completions" || index > maxRequests) {
        response.writeHead(400).end();
        return;
      }
      const chunk = (delta: unknown, finish: string | null = null) =>
        `data: ${JSON.stringify({
          id: `goal-response-${index}`,
          choices: [{ index: 0, delta, finish_reason: finish }],
        })}\n\n`;
      response.writeHead(200, { "content-type": "text/event-stream" });
      if (mode === "capacity" || index < reportAt) {
        response.write(
          chunk({ role: "assistant", content: "Working on the export." })
        );
      } else if (index === reportAt) {
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
                    report:
                      mode === "review"
                        ? {
                            kind: "ready_for_review",
                            summary: "Open the export.",
                          }
                        : {
                            kind: "completion",
                            summary: "Export complete",
                            evidence: [
                              { criterion: 1, call: "invented-evidence" },
                            ],
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
  "confirms a completed review through the guarded Desktop bridge without inference",
  async () => {
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "grida-goal-review-")
    );
    const cwd = path.join(root, "workspace");
    fs.mkdirSync(cwd, { mode: 0o700 });
    const endpoint = await provider("review");
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
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        resourcesPath: packaged!,
        stateDirectory: path.join(root, "state"),
        cwd,
        provider: "openai-compatible",
        endpoint: endpoint.endpoint,
        model: "fixture",
      });
      const active = { workspaceId: "workspace", chat };
      const ipc = new NativeChatIpc(origin, (candidate) =>
        candidate === sender ? active : null
      );
      const { attachmentId } = await ipc.create(event);
      const snapshot = () => ipc.observe(event, attachmentId);
      expect((await snapshot()).snapshot.goalManualContinuationAvailable).toBe(
        true
      );
      const inspect = async () =>
        ipc.goal(event, attachmentId, (await snapshot()).observationId);
      await ipc.startGoal(event, attachmentId, "review-goal", {
        ...REQUEST,
        allowance: { workTurns: 1, inferenceSteps: 2 },
        automatic: true,
      });
      const pending = await vi.waitFor(async () => {
        const observed = await inspect();
        expect(observed.goal?.review).toMatchObject({
          status: "pending",
          summary: "Open the export.",
        });
        return observed;
      });
      const change = {
        observationId: pending.observationId,
        requestId: "confirm",
        action: "confirm_completion",
      };
      await expect(
        ipc.controlGoal(event, attachmentId, {
          ...change,
          turnId: pending.goal!.review!.turnId,
        })
      ).rejects.toThrow("native_chat_goal_control_invalid");
      const receipt = await ipc.controlGoal(event, attachmentId, change);
      await expect(
        ipc.controlGoal(event, attachmentId, change)
      ).resolves.toEqual(receipt);
      const completed = await inspect();
      expect(completed.goal).toMatchObject({
        state: { status: "complete" },
        spent: { workTurns: 1, inferenceSteps: 2 },
        review: { ...pending.goal!.review, status: "confirmed" },
      });
      expect(endpoint.requests).toHaveLength(2);
    } finally {
      try {
        await chat?.close();
      } finally {
        await endpoint.close();
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  },
  15_000
);

it.runIf(Boolean(packaged))(
  "retains an unclaimed goal through restart and requires withdrawal instead of text replacement",
  async () => {
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "grida-pending-goal-")
    );
    const cwd = path.join(root, "workspace");
    fs.mkdirSync(cwd, { mode: 0o700 });
    const endpoint = await provider("capacity");
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
  "retains a Plan goal across exact retry, pause and restart, and reports unverified work truthfully",
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

      const planned = { ...REQUEST, operatingRegime: "plan" } as const;
      const accepted = await ipc.startGoal(
        event,
        attachmentId,
        "first-goal",
        planned
      );
      expect(accepted.disposition).toBe("queued");
      await vi.waitFor(() => expect(endpoint.requests).toHaveLength(1));
      expect(endpoint.requests[0]).toContain("Plan is active.");
      expect(
        (await ipc.startGoal(event, attachmentId, "first-goal", planned))
          .inputPosition
      ).toBe(accepted.inputPosition);
      await expect(
        ipc.startGoal(event, attachmentId, "first-goal", {
          ...planned,
          operatingRegime: "act",
        })
      ).rejects.toThrow("input_identity_reused");
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
      expect(endpoint.requests[1]).toContain("Plan is active.");
      const inProgress = await goal();
      const revisedActive = await ipc.controlGoal(event, attachmentId, {
        observationId: inProgress.observationId,
        requestId: "revise-active-goal",
        action: "revise",
        objective: {
          description: "Review the smaller export",
          criteria: ["The export fits"],
        },
      });
      expect(revisedActive.turnId).toBe(turnId);
      await vi.waitFor(async () => {
        expect((await snapshot()).snapshot.current).toBeNull();
        expect((await goal()).goal).toEqual(
          expect.objectContaining({
            goalId: "first-goal",
            objective: "Review the smaller export",
            state: { status: "blocked", reason: "uncertain_work" },
            reservation: expect.objectContaining({ uncertain: true }),
          })
        );
      });

      const second = await ipc.create(event);
      attachmentId = second.attachmentId;
      await ipc.startGoal(event, attachmentId, "second-goal", REQUEST);
      await vi.waitFor(() => expect(endpoint.requests).toHaveLength(4));
      expect(endpoint.requests[2]).not.toContain("Plan is active.");
      const blocked = await vi.waitFor(async () => {
        const inspected = await goal();
        expect(inspected.goal?.state).toEqual({
          status: "blocked",
          reason: "unverified_completion",
        });
        return inspected;
      });
      const revisedObjective = {
        description: "Inspect the revised export",
        criteria: ["Check its visible size"],
      };
      const change = {
        observationId: blocked.observationId,
        requestId: "revise-goal",
        action: "revise",
        objective: revisedObjective,
      };
      const revised = await ipc.controlGoal(event, attachmentId, change);
      await expect(
        ipc.controlGoal(event, attachmentId, change)
      ).resolves.toEqual(revised);
      await expect(
        ipc.controlGoal(event, attachmentId, {
          ...change,
          objective: {
            ...revisedObjective,
            description: "Different objective",
          },
        })
      ).rejects.toThrow("request_identity_reused");
      const updated = await goal();
      expect(updated.goalRevision).toBe((blocked.goalRevision ?? 0) + 1);
      expect(updated.goal).toMatchObject({
        goalId: blocked.goal?.goalId,
        objective: revisedObjective.description,
        criteria: revisedObjective.criteria,
        spent: blocked.goal?.spent,
        remaining: blocked.goal?.remaining,
        allowance: blocked.goal?.allowance,
        state: { status: "active" },
      });
      await chat.close();
      chat = await launch();
      attachmentId = (await ipc.load(event, second.sessionId)).attachmentId;
      const reopenedGoal = await goal();
      expect(reopenedGoal.goal).toEqual(updated.goal);
      expect(reopenedGoal.goalRevision).toBe(updated.goalRevision);
      await ipc.controlGoal(event, attachmentId, {
        observationId: reopenedGoal.observationId,
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
