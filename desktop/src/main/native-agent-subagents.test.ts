import type { NativeChatTurn } from "@grida/desktop-bridge";
import { expect, it, vi } from "vitest";
import { NativeAgentSubagents } from "./native-agent-subagents";

const parent = { id: "parent" };
const childId = "subagent/child";
const check = () => {};
const turn = (value: unknown) => value as NativeChatTurn;
const current: NativeChatTurn = {
  turnId: "active-child",
  epoch: 1,
  journalPosition: 10,
  historyPosition: 2,
  controlRevision: 3,
  paused: false,
  cancelled: false,
  disposition: "running",
  status: null,
};
const latest: NativeChatTurn = {
  ...current,
  turnId: "previous-child",
  disposition: "settled",
  status: "succeeded",
};
const active = {
  childId,
  inputId: "active-input",
  parentTurnId: "active-sponsor",
  instructionPreview: " ".repeat(1024),
  instructionTruncated: true,
  disposition: { kind: "claimed", turn: current.turnId },
  turn: current,
  result: null,
};
const completed = {
  ...active,
  inputId: "previous-input",
  parentTurnId: "previous-sponsor",
  instructionPreview: "First assignment",
  instructionTruncated: false,
  disposition: { kind: "completed", turn: latest.turnId },
  turn: latest,
  result: {
    turnId: latest.turnId,
    status: "succeeded",
    text: "First result",
    textTruncated: false,
    ignoredInternalField: "unused",
  },
};
const inspection = {
  parentSessionId: parent.id,
  childId,
  name: "Reviewer",
  allocation: { workTurns: 3, reserved: 2 },
  sessionRevision: 7,
  admissionPaused: false,
  queuedInputIds: [],
  current,
  latest,
};

it("projects bounded parent pages and refuses a result from a different assignment turn", async () => {
  const request = vi.fn<(method: string, input: unknown) => Promise<unknown>>();
  const adapter = new NativeAgentSubagents(request, turn);
  const child = { childId, name: "Reviewer" };
  request.mockResolvedValueOnce({
    parentSessionId: parent.id,
    children: [child],
    nextAfterChildId: null,
  });
  await expect(adapter.list(parent, undefined, check)).resolves.toEqual({
    children: [child],
    nextAfterChildId: null,
  });
  request.mockResolvedValueOnce({
    parentSessionId: parent.id,
    children: [child, child],
    nextAfterChildId: null,
  });
  await expect(adapter.list(parent, undefined, check)).rejects.toThrow(
    "native_chat_subagent_invalid_response"
  );
  request.mockResolvedValueOnce({
    ...inspection,
    assignment: {
      ...completed,
      result: { ...completed.result, turnId: current.turnId },
    },
  });
  await expect(
    adapter.inspect({}, parent, childId, completed.inputId, check)
  ).rejects.toThrow("native_chat_subagent_invalid_response");
});

it("keeps exact child Stop ownership separate from a previous assignment result", async () => {
  const attachment = {};
  const request = vi.fn<(method: string, input: unknown) => Promise<unknown>>();
  const adapter = new NativeAgentSubagents(request, turn);
  request.mockResolvedValueOnce({ ...inspection, assignment: completed });
  const older = await adapter.inspect(
    attachment,
    parent,
    childId,
    completed.inputId,
    check
  );
  expect(older.stopObservationId).toBeNull();
  expect(older.child.assignment?.result).toEqual({
    turnId: latest.turnId,
    status: "succeeded",
    text: "First result",
    textTruncated: false,
  });
  request.mockResolvedValue({
    ...inspection,
    assignment: null,
    observedAssignment: active,
  });
  const now = await adapter.inspect(
    attachment,
    parent,
    childId,
    undefined,
    check
  );
  expect(now.child.assignment?.instructionPreview).toBe(
    active.instructionPreview
  );
  expect(now.stopObservationId).toEqual(expect.any(String));
  expect(
    (await adapter.inspect(attachment, parent, childId, undefined, check))
      .stopObservationId
  ).toBe(now.stopObservationId);
  await expect(
    adapter.stop({}, parent, now.stopObservationId!, "stop", check)
  ).rejects.toThrow("native_chat_subagent_observation_unavailable");
  request.mockRejectedValueOnce(new Error("native_agent_request_timeout"));
  await expect(
    adapter.stop(attachment, parent, now.stopObservationId!, "stop", check)
  ).rejects.toThrow("native_chat_subagent_unverified");
  request.mockResolvedValueOnce({
    sessionId: childId,
    turnId: current.turnId,
    requestId: "stop",
    sessionRevision: 8,
    journalPosition: 11,
  });
  await adapter.stop(attachment, parent, now.stopObservationId!, "stop", check);
  const stopped = request.mock.calls.filter(([method]) =>
    method.endsWith("/stop")
  );
  expect(stopped).toEqual(
    Array.from({ length: 2 }, () => [
      "_co.grida/subagent/stop",
      {
        parentSessionId: parent.id,
        childId,
        turnId: current.turnId,
        expectedSessionRevision: 7,
        expectedControlRevision: 3,
        requestId: "stop",
      },
    ])
  );
});

it("keeps the exact sponsor when an unverified assignment outlives its original observation", async () => {
  const request = vi.fn<(method: string, input: unknown) => Promise<unknown>>();
  const adapter = new NativeAgentSubagents(request, turn);
  const attachment = {};
  const input = {
    childId,
    inputId: completed.inputId,
    instructions: "First assignment",
    parentObservationId: "opaque",
  };
  request.mockResolvedValueOnce(completed);
  await expect(
    adapter.assign(attachment, parent, input, () => "chosen-sponsor", check)
  ).rejects.toThrow("native_chat_subagent_unverified");
  const select = () => {
    throw new Error("original observation evicted");
  };
  await expect(
    adapter.assign(
      attachment,
      parent,
      { ...input, instructions: "Different assignment" },
      select,
      check
    )
  ).rejects.toThrow("native_chat_subagent_identity_reused");
  request.mockResolvedValueOnce({
    ...completed,
    parentTurnId: "chosen-sponsor",
  });
  await expect(
    adapter.assign(attachment, parent, input, select, check)
  ).resolves.toMatchObject({
    parentTurnId: "chosen-sponsor",
    inputId: completed.inputId,
  });
  expect(request.mock.calls[0]).toEqual(request.mock.calls[1]);
  expect(request).toHaveBeenLastCalledWith("_co.grida/subagent/assign", {
    parentSessionId: parent.id,
    childId,
    inputId: completed.inputId,
    instructions: "First assignment",
    parentTurnId: "chosen-sponsor",
  });
});
