import type { NativeChatSnapshot } from "@grida/desktop-bridge";
import { expect, it, vi } from "vitest";
import { NativeAgentRevisions } from "./native-agent-revisions";

const session = { id: "session" };
const observation: NativeChatSnapshot = {
  sessionId: session.id,
  sessionRevision: 8,
  queuedInputs: 0,
  admissionPaused: false,
  current: null,
  latest: null,
};
const messageId = "input/source";
const target = {
  sessionRevision: 8,
  anchor: { kind: "turn", message: messageId, turn: "source" },
  basis: {
    view: 4,
    tail: { turn: "latest", ordinal: 4, position: 12 },
    fingerprint: Array.from({ length: 32 }, () => 4),
  },
  text: "Original wording beyond the preview. ".repeat(16),
  subsequentMessages: 2,
};

it("retains both IDs, the exact history cut, and the replacement across a lost reply", async () => {
  const attachment = {};
  let latest = 8;
  const check = (expected?: number) => {
    if (expected !== undefined && expected !== latest)
      throw new Error("stale_session_revision");
  };
  const requests: unknown[] = [];
  const request =
    vi.fn<(method: string, params: unknown) => Promise<unknown>>();
  request.mockImplementation(async (method, params) => {
    if (method === "_co.grida/session/revision-target") return target;
    expect(method).toBe("_co.grida/session/revise");
    requests.push(params);
    latest = 10;
    if (requests.length === 1) throw new Error("native_agent_request_timeout");
    return {
      sessionId: session.id,
      view: 9,
      inputId: (params as { replacementInputId: string }).replacementInputId,
      inputPosition: 5,
    };
  });
  const adapter = new NativeAgentRevisions(request);
  const edit = await adapter.prepare(
    attachment,
    session,
    observation,
    messageId,
    check
  );
  expect(edit).toMatchObject({
    text: target.text,
    messageId,
    subsequentMessages: 2,
  });
  const apply = (text: string, mode: "plan" | "act" = "plan") =>
    adapter.apply(attachment, session, edit.reviewId, text, mode, check);
  await expect(apply("Edited request")).rejects.toThrow(
    "native_chat_revision_unverified"
  );
  await expect(apply("Different request")).rejects.toThrow(
    "native_chat_revision_identity_reused"
  );
  await expect(apply("Edited request", "act")).rejects.toThrow(
    "native_chat_revision_identity_reused"
  );
  await expect(
    adapter.prepare(attachment, session, observation, messageId, check)
  ).rejects.toThrow("native_chat_revision_unverified");
  const receipt = await apply("Edited request");
  expect(requests[0]).toBe(requests[1]);
  expect(requests[1]).toMatchObject({
    expectedSessionRevision: 8,
    expectedHistory: target.basis,
    anchor: target.anchor,
    prompt: [{ type: "text", text: "Edited request" }],
    operatingRegime: "plan",
  });
  expect(receipt.view).toBe(9);
  await expect(apply("Edited request")).resolves.toEqual(receipt);
  expect(requests).toHaveLength(2);
});

it("rejects stale frames, wrong returned anchors and other attachment tokens", async () => {
  const attachment = {};
  const request =
    vi.fn<(_method: string, _params: unknown) => Promise<unknown>>();
  request.mockResolvedValueOnce({
    ...target,
    anchor: { ...target.anchor, message: "other" },
  });
  request.mockResolvedValue(target);
  const adapter = new NativeAgentRevisions(request);
  const check = vi.fn<(expected?: number) => void>();
  await expect(
    adapter.prepare(attachment, session, observation, messageId, check)
  ).rejects.toThrow("native_chat_revision_target_invalid");
  check.mockImplementationOnce(() => {});
  check.mockImplementationOnce(() => {
    throw new Error("native_chat_attachment_required");
  });
  await expect(
    adapter.prepare(attachment, session, observation, messageId, check)
  ).rejects.toThrow("native_chat_attachment_required");
  const edit = await adapter.prepare(
    attachment,
    session,
    observation,
    messageId,
    check
  );
  await expect(
    adapter.apply({}, session, edit.reviewId, "Edited", "act", check)
  ).rejects.toThrow("native_chat_revision_target_changed");
  check.mockImplementationOnce(() => {
    throw new Error("stale_session_revision");
  });
  await expect(
    adapter.apply(attachment, session, edit.reviewId, "Edited", "act", check)
  ).rejects.toThrow("stale_session_revision");
  expect(request).toHaveBeenCalledTimes(3);
  expect(
    request.mock.calls.every(([method]) => method.endsWith("/revision-target"))
  ).toBe(true);
});

it("preserves the captured Ultra effort and refuses an incompatible retry", async () => {
  const attachment = {};
  const check = () => {};
  const requests: unknown[] = [];
  const adapter = new NativeAgentRevisions(async (method, params) => {
    if (method.endsWith("/revision-target"))
      return { ...target, effort: "ultra", reasoning: "xhigh" };
    requests.push(params);
    if (requests.length === 1) throw new Error("native_agent_request_timeout");
    return {
      sessionId: session.id,
      view: 9,
      inputId: (params as { replacementInputId: string }).replacementInputId,
      inputPosition: 5,
    };
  });
  const edit = await adapter.prepare(
    attachment,
    session,
    observation,
    messageId,
    check
  );
  expect(edit.effort).toBe("ultra");
  const apply = (available: boolean, selection?: "standard" | "ultra") =>
    adapter.apply(attachment, session, edit.reviewId, "Edited", "plan", check, {
      available,
      selection,
    });
  await expect(apply(false)).rejects.toThrow("native_chat_effort_unavailable");
  await expect(apply(true, "standard")).rejects.toThrow(
    "native_chat_revision_effort_changed"
  );
  expect(requests).toHaveLength(0);
  await expect(apply(true)).rejects.toThrow("native_chat_revision_unverified");
  await expect(apply(true, "standard")).rejects.toThrow(
    "native_chat_revision_identity_reused"
  );
  await expect(apply(false)).rejects.toThrow("native_chat_effort_unavailable");
  await apply(true);
  expect(requests[0]).toMatchObject({
    effort: "ultra",
    reasoning: "xhigh",
    operatingRegime: "plan",
  });
  expect(requests[1]).toBe(requests[0]);
});

it("resends the original reasoning level and refuses an unknown one", async () => {
  const attachment = {};
  const check = () => {};
  const requests: unknown[] = [];
  let reasoning: unknown = "high";
  const adapter = new NativeAgentRevisions(async (method, params) => {
    if (method.endsWith("/revision-target")) return { ...target, reasoning };
    requests.push(params);
    return {
      sessionId: session.id,
      view: 9,
      inputId: (params as { replacementInputId: string }).replacementInputId,
      inputPosition: 5,
    };
  });
  const edit = await adapter.prepare(
    attachment,
    session,
    observation,
    messageId,
    check
  );
  await adapter.apply(
    attachment,
    session,
    edit.reviewId,
    "Edited",
    "act",
    check
  );
  expect(requests[0]).toMatchObject({ reasoning: "high" });
  expect(requests[0]).not.toHaveProperty("effort");
  reasoning = "maximum";
  await expect(
    adapter.prepare({}, session, observation, messageId, check)
  ).rejects.toThrow("native_chat_revision_target_invalid");
});
