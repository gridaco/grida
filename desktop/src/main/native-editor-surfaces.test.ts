import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  NativeEditorSurfaceEndpoints,
  type NativeEditorSvgSelectionDelivery,
} from "./native-editor-surfaces";

it("binds SVG inspection and opacity to one private input and exact active file", async () => {
  const endpoints = new NativeEditorSurfaceEndpoints();
  const path = "/poster.svg";
  const snapshot = {
    active: path,
    open: [path, "/other.svg"],
    truncated: false,
  };
  const sessionId = "chat";
  const targetId = randomUUID();
  const inspect = {
    kind: "inspection",
    mode: "objects",
    path,
    revision: targetId,
    total: 1,
    targets: [{ kind: "element", elementPath: [1], tag: "rect" }],
    nextCursor: null,
  } as const;
  const deliver = vi.fn<NativeEditorSvgSelectionDelivery>(
    async ({ operation }) =>
      operation.kind === "inspect"
        ? inspect
        : { kind: "applied", path, saved: false }
  );
  const register = () =>
    endpoints.register(
      sessionId,
      snapshot,
      () => {},
      undefined,
      undefined,
      undefined,
      undefined,
      deliver
    );
  const lease = register();
  const captured = lease.selection(undefined, { inputId: "input", targetId });
  const { editorEndpointId, editorToolContextId } = captured;
  expect(editorToolContextId).not.toBe(targetId);
  expect(lease.selection(undefined, { inputId: "input", targetId })).toEqual(
    captured
  );
  expect(() =>
    lease.selection(undefined, { inputId: "other-input", targetId })
  ).toThrow("native_chat_editor_tool_context_unavailable");
  const foreign = register();
  expect(() =>
    foreign.selection(undefined, { inputId: "input", targetId })
  ).toThrow("native_chat_editor_tool_context_unavailable");

  function request(
    message: object,
    contextId?: string,
    endpointId = editorEndpointId
  ) {
    return endpoints.desktopTools(
      {
        sessionId,
        endpointId,
        ...(contextId && { scope: { contextId } }),
        expiresAtMs: Date.now() + 2000,
        timeoutMs: 2000,
        message: { jsonrpc: "2.0", id: randomUUID(), ...message },
      },
      new AbortController().signal
    );
  }
  const list = (contextId?: string, endpointId?: string) =>
    request({ method: "tools/list" }, contextId, endpointId);
  const call = (name: string, args: object, contextId = editorToolContextId) =>
    request(
      {
        method: "tools/call",
        params: {
          name,
          arguments: args,
          _meta: { "co.grida/definitionRevision": 1 },
        },
      },
      contextId
    );

  expect(JSON.stringify(await list())).not.toContain("svg_inspect_selection");
  expect(JSON.stringify(await list(targetId))).not.toContain(
    "svg_inspect_selection"
  );
  expect(
    JSON.stringify(
      await list(editorToolContextId, foreign.selection().editorEndpointId)
    )
  ).not.toContain("svg_inspect_selection");
  expect(JSON.stringify(await list(editorToolContextId))).toContain(
    "svg_inspect_selection"
  );
  await expect(call("svg_inspect_selection", {})).resolves.toMatchObject({
    message: { result: { structuredContent: inspect, isError: false } },
  });
  await expect(
    call("svg_set_selection_opacity", {
      opacity: 0.4,
      revision: editorToolContextId,
    })
  ).resolves.toMatchObject({
    message: {
      result: { content: [{ text: "svg_selection_stale" }], isError: true },
    },
  });
  await expect(
    call("svg_set_selection_opacity", { opacity: 0.4, revision: targetId })
  ).resolves.toMatchObject({
    message: {
      result: {
        structuredContent: { kind: "applied", path, saved: false },
        isError: false,
      },
    },
  });
  lease.update({ ...snapshot, active: "/other.svg" });
  await expect(
    call("svg_set_selection_opacity", { opacity: 0.4, revision: targetId })
  ).resolves.toMatchObject({
    message: {
      result: { content: [{ text: "svg_selection_stale" }], isError: true },
    },
  });
  expect(deliver.mock.calls.map(([request]) => request.operation.kind)).toEqual(
    ["inspect", "set-opacity"]
  );

  lease.close();
  const replacement = foreign.selection(undefined, {
    inputId: "input",
    targetId,
  });
  expect(replacement.editorToolContextId).toBe(editorToolContextId);
  expect(
    JSON.stringify(
      await list(editorToolContextId, replacement.editorEndpointId)
    )
  ).not.toContain("svg_inspect_selection");
  endpoints.close();
});
