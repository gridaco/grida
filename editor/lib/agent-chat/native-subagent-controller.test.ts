import type {
  NativeChatObservation,
  NativeSubagentClient,
  NativeSubagentObservation,
  NativeSubagentWork,
} from "@grida/desktop-bridge";
import { expect, it, vi } from "vitest";
import { NativeSubagentController } from "./native-subagent-controller";

const parent: NativeChatObservation = {
  observationId: "parent-observation",
  snapshot: {
    sessionId: "parent",
    sessionRevision: 2,
    queuedInputs: 0,
    admissionPaused: false,
    current: null,
    latest: {
      turnId: "sponsor",
      epoch: 1,
      historyPosition: 1,
      journalPosition: 1,
      controlRevision: 0,
      paused: false,
      cancelled: false,
      disposition: "settled",
      status: "succeeded",
    },
  },
};

function observed(
  childId: string,
  assignment: NativeSubagentWork | null = null
): NativeSubagentObservation {
  return {
    child: {
      childId,
      name: childId,
      workTurns: 2,
      reserved: assignment?.turn ? 1 : 0,
      admissionPaused: false,
      queuedInputIds:
        assignment && !assignment.turn ? [assignment.inputId] : [],
      current:
        assignment?.turn?.disposition === "running" ? assignment.turn : null,
      assignment,
    },
    stopObservationId:
      assignment?.turn?.disposition === "running" ? "stop-exact" : null,
  };
}

it("retries a steering receipt with its original child and text after observation changes", async () => {
  const work: NativeSubagentWork = {
    inputId: "review",
    parentTurnId: "sponsor",
    instructionPreview: "Compare both drafts.",
    instructionTruncated: false,
    disposition: "claimed",
    turn: {
      turnId: "child-turn",
      disposition: "running",
      status: null,
      paused: false,
      cancelled: false,
    },
    result: null,
  };
  let token = "before-steer";
  const control =
    vi.fn<NonNullable<NativeSubagentClient["controlSubagentTurn"]>>();
  control.mockImplementationOnce(async () => {
    token = "after-steer";
    throw new Error("native_chat_subagent_unverified");
  });
  control.mockResolvedValue(undefined);
  const controller = new NativeSubagentController(
    {
      listSubagents: async () => ({
        children: [{ childId: "child", name: "Reviewer" }],
        nextAfterChildId: null,
      }),
      inspectSubagent: async () => ({
        ...observed("child", work),
        stopObservationId: token,
        turnControls: ["pause", "steer"],
      }),
      createSubagent: vi.fn<NativeSubagentClient["createSubagent"]>(),
      assignSubagent: vi.fn<NativeSubagentClient["assignSubagent"]>(),
      stopSubagent: vi.fn<NativeSubagentClient["stopSubagent"]>(),
      controlSubagentTurn: control,
    },
    "parent-attachment",
    () => parent
  );
  try {
    controller.toggle();
    await vi.waitFor(() =>
      expect(controller.turnControls).toEqual(["pause", "steer"])
    );
    const steering = {
      kind: "steer",
      instructions: "Use the newest draft.",
    } as const;
    expect(await controller.controlTurn(steering)).toBe(false);
    expect(controller.read().observation?.stopObservationId).toBe(
      "after-steer"
    );
    expect(controller.canRetryTurnControl).toBe(true);
    expect(await controller.controlTurn({ kind: "pause" })).toBe(false);
    expect(await controller.retryTurnControl()).toBe(true);
    expect(control.mock.calls).toEqual([
      ["parent-attachment", "before-steer", expect.any(String), steering],
      control.mock.calls[0],
    ]);
    expect(controller.canRetryTurnControl).toBe(false);
  } finally {
    controller.dispose();
  }
});

it("retries the exact named child and assignment on their parent, then stops the displayed turn", async () => {
  let created = false;
  let parentBasis = parent;
  let work: NativeSubagentWork | null = null;
  const create = vi.fn<NativeSubagentClient["createSubagent"]>();
  create.mockRejectedValueOnce(new Error("acknowledgement lost"));
  create.mockImplementation(async () => {
    created = true;
    return { childId: "child", name: "Researcher" };
  });
  const assign = vi.fn<NativeSubagentClient["assignSubagent"]>();
  assign.mockRejectedValueOnce(new Error("subagent_sponsor_requires_act"));
  assign.mockRejectedValueOnce(new Error("acknowledgement lost"));
  assign.mockImplementation(
    async (_attachment, input) =>
      (work = {
        inputId: input.inputId,
        parentTurnId: "sponsor",
        instructionPreview: input.instructions,
        instructionTruncated: false,
        disposition: "claimed",
        turn: {
          turnId: "child-turn",
          disposition: "running",
          status: null,
          paused: false,
          cancelled: false,
        },
        result: null,
      })
  );
  const stop = vi
    .fn<NativeSubagentClient["stopSubagent"]>()
    .mockImplementation(async () => {
      if (work?.turn)
        work = {
          ...work,
          disposition: "completed",
          turn: {
            ...work.turn,
            disposition: "settled",
            status: "cancelled",
            cancelled: true,
          },
          result: {
            turnId: work.turn.turnId,
            status: "cancelled",
            text: "Stopped.",
            textTruncated: false,
          },
        };
    });
  const inspect = vi
    .fn<NativeSubagentClient["inspectSubagent"]>()
    .mockImplementation(async (_attachment, childId) =>
      observed(childId, work)
    );
  const controller = new NativeSubagentController(
    {
      listSubagents: async () => ({
        children: created ? [{ childId: "child", name: "Researcher" }] : [],
        nextAfterChildId: null,
      }),
      inspectSubagent: inspect,
      createSubagent: create,
      assignSubagent: assign,
      stopSubagent: stop,
    },
    "parent-attachment",
    () => parentBasis
  );
  controller.toggle();
  await vi.waitFor(() => expect(controller.read().listing).toBe(false));
  expect(await controller.create("Researcher", 2)).toBe(false);
  expect(await controller.create("Researcher", 2)).toBe(true);
  expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
  expect(create.mock.calls[0]?.[0]).toBe("parent-attachment");
  expect(await controller.assign("Review the spacing.")).toBe(false);
  expect(controller.read().error).toContain("Finish an Act turn");
  parentBasis = { ...parent, observationId: "act-sponsor-observation" };
  expect(await controller.assign("Review the spacing.")).toBe(false);
  expect(await controller.assign("Review the spacing.")).toBe(true);
  expect(assign.mock.calls[1]).toEqual(assign.mock.calls[2]);
  const accepted = assign.mock.calls[1]?.[1];
  expect(accepted?.inputId).not.toBe(assign.mock.calls[0]?.[1].inputId);
  expect(accepted).toMatchObject({
    childId: "child",
    parentObservationId: "act-sponsor-observation",
    instructions: "Review the spacing.",
  });
  expect(inspect).toHaveBeenLastCalledWith(
    "parent-attachment",
    "child",
    accepted?.inputId
  );
  expect(await controller.stop()).toBe(true);
  expect(stop).toHaveBeenCalledWith(
    "parent-attachment",
    "stop-exact",
    expect.any(String)
  );
  expect(controller.read().observation?.child.assignment?.result?.status).toBe(
    "cancelled"
  );
  controller.dispose();
});

it("keeps a late assignment read out of a different selected child and closes without stopping work", async () => {
  const first = Promise.withResolvers<NativeSubagentObservation>();
  let delay = false;
  const stop = vi.fn<NativeSubagentClient["stopSubagent"]>();
  const controller = new NativeSubagentController(
    {
      listSubagents: async () => ({
        children: [
          { childId: "a", name: "A" },
          { childId: "b", name: "B" },
        ],
        nextAfterChildId: null,
      }),
      inspectSubagent: async (_attachment, childId) =>
        delay && childId === "a" ? first.promise : observed(childId),
      createSubagent: vi.fn<NativeSubagentClient["createSubagent"]>(),
      assignSubagent: vi.fn<NativeSubagentClient["assignSubagent"]>(),
      stopSubagent: stop,
    },
    "parent-attachment",
    () => parent
  );
  controller.toggle();
  await vi.waitFor(() =>
    expect(controller.read().observation?.child.childId).toBe("a")
  );
  delay = true;
  const stale = controller.select("a", "old-input");
  await controller.select("b");
  first.resolve(observed("a"));
  await stale;
  expect(controller.read().observation?.child.childId).toBe("b");
  controller.toggle();
  expect(controller.read().observation).toBeNull();
  expect(stop).not.toHaveBeenCalled();
  controller.dispose();
});

it("withdraws only the selected queued assignment and retries without refreshing its basis", async () => {
  const control =
    vi.fn<NonNullable<NativeSubagentClient["controlSubagentChild"]>>();
  let basis = "held-queue";
  control.mockImplementationOnce(async () => {
    basis = "new-queue";
    throw new Error("native_chat_subagent_unverified");
  });
  control.mockResolvedValue(undefined);
  const controller = new NativeSubagentController(
    {
      listSubagents: async () => ({
        children: [
          { childId: "child", name: "Child" },
          { childId: "other", name: "Other" },
        ],
        nextAfterChildId: null,
      }),
      inspectSubagent: async (_, childId) => ({
        ...observed(childId),
        child: {
          ...observed(childId).child,
          admissionPaused: true,
          queuedInputIds: ["first", "second"],
        },
        childControls: {
          observationId: basis,
          available: ["message", "withdraw", "resume-queue"],
          pendingMessages: 1,
        },
      }),
      createSubagent: vi.fn<NativeSubagentClient["createSubagent"]>(),
      assignSubagent: vi.fn<NativeSubagentClient["assignSubagent"]>(),
      stopSubagent: vi.fn<NativeSubagentClient["stopSubagent"]>(),
      controlSubagentChild: control,
    },
    "attachment",
    () => parent
  );
  try {
    controller.toggle();
    await vi.waitFor(() => expect(controller.read().selected).toBe("child"));
    await controller.select("child", "first");
    await expect(
      controller.controlChild({ kind: "withdraw", inputId: "second" })
    ).resolves.toBe(false);
    expect(control).not.toHaveBeenCalled();
    const withdraw = { kind: "withdraw", inputId: "first" } as const;
    await expect(controller.controlChild(withdraw)).resolves.toBe(false);
    expect(controller.read().observation?.childControls?.observationId).toBe(
      "new-queue"
    );
    expect(controller.retryableChildControl).toBe("withdraw");
    expect(controller.childControls).toEqual([]);
    await controller.select("other");
    await expect(controller.retryChildControl()).resolves.toBe(false);
    await controller.select("child", "second");
    await expect(controller.retryChildControl()).resolves.toBe(true);
    expect(control.mock.calls[0]).toEqual(control.mock.calls[1]);
    expect(control.mock.calls[1]).toEqual([
      "attachment",
      "held-queue",
      expect.any(String),
      withdraw,
    ]);
    expect(controller.childControls).toEqual([
      "message",
      "withdraw",
      "resume-queue",
    ]);
  } finally {
    controller.dispose();
  }
});
