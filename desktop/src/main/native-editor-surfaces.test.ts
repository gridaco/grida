import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { DesktopBrowserToolLease } from "./desktop-browser-tools";
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

it("lists and invokes the negotiated Browser catalog only within the admitted scope", async () => {
  const endpoints = new NativeEditorSurfaceEndpoints();
  const sessionId = "chat";
  const snapshot = { active: null, open: [], truncated: false };
  const image = {
    mimeType: "image/jpeg" as const,
    base64: Buffer.alloc(256 * 1024, 7).toString("base64"),
  };
  const invoke = vi.fn<DesktopBrowserToolLease["invoke"]>(async (operation) =>
    operation === "browser_capture"
      ? { disposition: "dispatched_verified", image }
      : { disposition: "not_dispatched", data: { operation } }
  );
  let ready = true;
  const browser = { ready: () => ready, invoke, close: () => {} };
  const lease = endpoints.register(
    sessionId,
    snapshot,
    () => {},
    () => {},
    1,
    undefined,
    browser
  );
  const { editorEndpointId: endpointId } = lease.selection();
  const params = (message: object, scope: object = { browser: true }) => ({
    sessionId,
    endpointId,
    expiresAtMs: Date.now() + 5000,
    timeoutMs: 5000,
    scope,
    message: { jsonrpc: "2.0", id: randomUUID(), ...message },
  });
  const run = (
    request: ReturnType<typeof params>,
    negotiated = true,
    signal = new AbortController().signal
  ) => endpoints.desktopTools(request, signal, negotiated);
  const list = { method: "tools/list" };
  await expect(run(params(list), false)).resolves.toBeNull();
  expect(JSON.stringify(await run(params(list, {})))).not.toContain(
    "browser_capture"
  );
  expect(JSON.stringify(await run(params(list)))).not.toContain(
    "workbench_show"
  );
  await expect(
    run(params(list, { browser: true, presentation: true }))
  ).resolves.toMatchObject({
    message: {
      result: {
        tools: expect.arrayContaining([
          {
            name: "workbench_list_tabs",
            _meta: expect.objectContaining({
              "co.grida/definitionRevision": 3,
            }),
            description: expect.any(String),
            inputSchema: expect.any(Object),
            outputSchema: expect.any(Object),
            annotations: { readOnlyHint: true },
          },
          expect.objectContaining({
            name: "workbench_show",
            _meta: expect.objectContaining({
              "co.grida/definitionRevision": 3,
            }),
          }),
          expect.objectContaining({
            name: "workbench_close_browser_tab",
            _meta: expect.objectContaining({
              "co.grida/definitionRevision": 1,
            }),
          }),
          expect.objectContaining({
            name: "browser_close",
            _meta: expect.objectContaining({
              "co.grida/definitionRevision": 2,
            }),
          }),
          expect.objectContaining({
            name: "browser_capture",
            _meta: {
              "co.grida/definitionRevision": 1,
              "co.grida/maxInputBytes": 40960,
              "co.grida/maxOutputBytes": 458752,
              "co.grida/resultMimeType": "image/jpeg",
            },
          }),
        ]),
      },
    },
  });

  const call = (name: string, revision: number, args: object) =>
    params({
      method: "tools/call",
      params: {
        name,
        arguments: args,
        _meta: { "co.grida/definitionRevision": revision },
      },
    });
  const tabId = "visible-browser-tab";
  await expect(
    run(call("browser_close", 2, { target: { kind: "workbench", tabId } }))
  ).resolves.toMatchObject({
    message: {
      result: {
        isError: true,
        structuredContent: {
          disposition: "not_dispatched",
          error: "invalid_arguments",
        },
      },
    },
  });
  expect(invoke).not.toHaveBeenCalled();
  const close = call("workbench_close_browser_tab", 1, { tabId });
  await expect(run(close)).resolves.toMatchObject({
    message: {
      result: {
        isError: false,
        structuredContent: { operation: "browser_close" },
      },
    },
  });
  expect(invoke).toHaveBeenCalledWith(
    "browser_close",
    { target: { kind: "workbench", tabId } },
    expect.any(AbortSignal),
    close.expiresAtMs
  );

  const capture = call("browser_capture", 1, {
    target: { kind: "workbench", tabId },
    documentId: "document",
  });
  const reply = await run(capture);
  expect(reply).toMatchObject({
    message: {
      result: {
        isError: false,
        structuredContent: { disposition: "dispatched_verified" },
        content: [
          { type: "image", mimeType: image.mimeType, data: image.base64 },
        ],
      },
    },
  });
  ready = false;
  expect(
    endpoints.desktopToolsReplyGuard(reply!, capture, true)()
  ).toMatchObject({
    message: {
      result: {
        isError: true,
        structuredContent: { disposition: "unknown", error: "outcome_unknown" },
        content: [{ type: "text", text: "outcome_unknown" }],
      },
    },
  });
  await expect(run(capture)).resolves.toMatchObject({
    message: {
      result: {
        isError: true,
        structuredContent: {
          disposition: "not_dispatched",
          error: "owner_revoked",
        },
      },
    },
  });
  expect(JSON.stringify(await run(params(list)))).not.toContain(
    "browser_capture"
  );
  expect(invoke).toHaveBeenCalledTimes(2);
  lease.close();
});
