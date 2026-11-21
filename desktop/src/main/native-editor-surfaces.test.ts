import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import type { DesktopBrowserToolLease } from "./desktop-browser-tools";
import { NativeDesktopTools } from "./native-desktop-tools";
import {
  NativeEditorSurfaceEndpoints,
  type NativeEditorSurfaceDelivery,
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
  lease.registerToolSource({
    id: "inspector",
    description: "Check workspace status.",
    tools: [
      {
        definition: {
          name: "status",
          description: "Check status.",
          inputSchema: { type: "object" },
        },
        revision: 1,
        invoke: () => ({ content: [] }),
      },
    ],
  });
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
  const modernList = params(list, {
    browser: true,
    sources: true,
    presentation: true,
  });
  const modernRun = () =>
    endpoints.desktopTools(
      modernList,
      new AbortController().signal,
      true,
      true
    );
  const modernReply = (await modernRun())!;
  const queuedCatalog = endpoints.desktopToolsReplyGuard(
    modernReply,
    modernList,
    true,
    true
  );
  expect(
    NativeDesktopTools.listedSources(modernReply.message).map(({ id }) => id)
  ).toContain("browser");
  ready = false;
  expect(
    NativeDesktopTools.listedSources(queuedCatalog()!.message).map(
      ({ id }) => id
    )
  ).toEqual(["inspector"]);
  const unavailableBrowserCatalog = (await modernRun())!;
  expect(
    NativeDesktopTools.listedSources(unavailableBrowserCatalog.message).map(
      ({ id }) => id
    )
  ).toEqual(["inspector"]);
  expect(
    endpoints.desktopToolsReplyGuard(
      unavailableBrowserCatalog,
      modernList,
      true,
      true
    )()
  ).toBeUndefined();
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

it("keeps same-named tools isolated to the exact registered source generation", async () => {
  const endpoints = new NativeEditorSurfaceEndpoints();
  const sessionId = "chat";
  const lease = endpoints.register(
    sessionId,
    { active: null, open: [], truncated: false },
    () => {}
  );
  const { editorEndpointId: endpointId } = lease.selection();
  const held = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<AbortSignal>();
  const runFirst = vi.fn<NativeDesktopTools.Tool["invoke"]>(async (_, call) => {
    entered.resolve(call.signal);
    await held.promise;
    return { content: [{ type: "text", text: "first source" }] };
  });
  const runSecond = vi.fn<NativeDesktopTools.Tool["invoke"]>(() => ({
    content: [{ type: "text", text: "second source" }],
  }));
  const definition = {
    name: "lookup",
    description: "Find a record.",
    inputSchema: { type: "object" },
  };
  const first = {
    id: "fixture-first",
    description: "Find images.",
    tools: [{ definition, revision: 3, invoke: runFirst }],
  };
  const second = {
    id: "fixture-second",
    description: "Find sources.",
    tools: [{ definition, revision: 3, invoke: runSecond }],
  };
  for (const id of ["browser", "desktop-fx", "workbench"]) {
    expect(() => lease.registerToolSource({ ...first, id })).toThrow(
      "native_desktop_tool_source_invalid"
    );
  }
  const firstLease = lease.registerToolSource(first);
  lease.registerToolSource({
    id: "too-many-tools",
    description: "Example with too many tools for remaining catalog slots.",
    tools: Array.from({ length: NativeDesktopTools.maxTools }, (_, index) => ({
      definition: { ...definition, name: `lookup_${index}` },
      revision: 1,
      invoke: runSecond,
    })),
  });
  lease.registerToolSource({
    id: "too-many-bytes",
    description: "Example with a catalog exceeding the transfer budget.",
    tools: [
      {
        definition: {
          ...definition,
          inputSchema: { type: "object", description: "x".repeat(48 * 1024) },
        },
        revision: 1,
        invoke: runSecond,
      },
    ],
  });
  const secondLease = lease.registerToolSource(second);
  expect(() => lease.registerToolSource(first)).toThrow(
    "native_desktop_tool_source_invalid"
  );
  expect(() =>
    lease.registerToolSource({
      id: "image-without-receipt",
      description: "Inspect an image.",
      tools: [
        {
          definition: { ...definition, annotations: { readOnlyHint: true } },
          revision: 1,
          transfer: {
            maxInputBytes: 1024,
            maxOutputBytes: 1024,
            resultMimeType: "image/jpeg",
          },
          invoke: runSecond,
        },
      ],
    })
  ).toThrow("native_desktop_tool_source_invalid");

  const request = (message: object, scope: object = { sources: true }) => ({
    sessionId,
    endpointId,
    message: { jsonrpc: "2.0", id: randomUUID(), ...message },
    expiresAtMs: Date.now() + 10_000,
    timeoutMs: 10_000,
    scope,
  });
  const run = (value: ReturnType<typeof request>, negotiated = true) =>
    endpoints.desktopTools(
      value,
      new AbortController().signal,
      false,
      negotiated
    );
  const list = request({ method: "tools/list" });
  await expect(run(list, false)).resolves.toBeNull();
  const legacy = await run(request({ method: "tools/list" }, {}));
  expect(legacy?.message).toMatchObject({
    result: { tools: [{ name: "surface_list_open" }] },
  });
  const listed = (await run(list))!;
  const bindings = NativeDesktopTools.listedSources(listed.message);
  const firstBinding = bindings.find(({ id }) => id === first.id)!;
  const secondBinding = bindings.find(({ id }) => id === second.id)!;
  const firstName = "desktop_fixture_first__lookup";
  const secondName = "desktop_fixture_second__lookup";
  expect(listed.message).toMatchObject({
    result: {
      tools: [
        {
          name: "workbench_list_tabs",
          _meta: { "co.grida/source": { id: "workbench" } },
        },
        {
          name: firstName,
          _meta: {
            "co.grida/source": {
              ...firstBinding,
              description: first.description,
            },
          },
        },
        {
          name: secondName,
          _meta: {
            "co.grida/source": {
              ...secondBinding,
              description: second.description,
            },
          },
        },
      ],
    },
  });
  expect((await run(list))?.message).toMatchObject({
    result: {
      tools: expect.arrayContaining([
        {
          ...definition,
          name: secondName,
          _meta: {
            "co.grida/source": {
              ...secondBinding,
              description: second.description,
            },
            "co.grida/definitionRevision": 3,
          },
        },
      ]),
    },
  });

  const call = (
    name: string,
    binding?: NativeDesktopTools.SourceBinding,
    revision = 3
  ) =>
    request({
      method: "tools/call",
      params: {
        name,
        _meta: {
          "co.grida/source": binding,
          "co.grida/definitionRevision": revision,
        },
      },
    });
  await expect(run(call(firstName))).resolves.toMatchObject({
    message: { error: { code: -32602 } },
  });
  await expect(run(call(firstName, secondBinding))).resolves.toMatchObject({
    message: { error: { code: -32602 } },
  });
  await expect(run(call(firstName, firstBinding, 2))).resolves.toMatchObject({
    message: { error: { code: -32002 } },
  });
  expect(runFirst).not.toHaveBeenCalled();
  expect(runSecond).not.toHaveBeenCalled();

  const firstCall = call(firstName, firstBinding);
  runFirst.mockResolvedValueOnce({
    content: [{ type: "text", text: "first source" }],
  });
  const firstReply = (await run(firstCall))!;
  const queuedFirst = endpoints.desktopToolsReplyGuard(
    firstReply,
    firstCall,
    false,
    true
  );
  const pending = run(firstCall);
  const signal = await entered.promise;
  const secondCall = call(secondName, secondBinding);
  const secondReply = (await run(secondCall))!;
  expect(secondReply.message).toMatchObject({
    result: { content: [{ type: "text", text: "second source" }] },
  });
  const queuedList = endpoints.desktopToolsReplyGuard(
    listed,
    list,
    false,
    true
  );
  const queuedSecond = endpoints.desktopToolsReplyGuard(
    secondReply,
    secondCall,
    false,
    true
  );
  firstLease.close();
  expect(signal.aborted).toBe(true);
  lease.registerToolSource({
    ...first,
    tools: [{ definition, revision: 3, invoke: runSecond }],
  });
  held.resolve();
  await expect(pending).resolves.toMatchObject({
    message: { error: { code: -32603 } },
  });
  expect(NativeDesktopTools.listedSources(queuedList()!.message)).toEqual([
    expect.objectContaining({ id: "workbench" }),
    secondBinding,
  ]);
  expect(queuedFirst()).toMatchObject({ message: { error: { code: -32603 } } });
  expect(queuedSecond()).toBeUndefined();
  await expect(run(firstCall)).resolves.toMatchObject({
    message: {
      error: { code: -32001, message: "editor_surface_endpoint_unavailable" },
    },
  });
  expect(runSecond).toHaveBeenCalledTimes(1);
  const refreshed = NativeDesktopTools.listedSources(
    (await run(list))!.message
  );
  const replaced = refreshed.find(({ id }) => id === first.id)!;
  expect(replaced.generation).not.toBe(firstBinding.generation);
  await expect(run(call(firstName, replaced))).resolves.toMatchObject({
    message: { result: { content: [{ type: "text", text: "second source" }] } },
  });
  expect(runSecond).toHaveBeenCalledTimes(2);
  secondLease.close();
  expect(NativeDesktopTools.listedSources(queuedList()!.message)).toEqual([
    expect.objectContaining({ id: "workbench" }),
  ]);
  lease.close();
  expect(() => lease.registerToolSource(first)).toThrow(
    "editor_surface_endpoint_unavailable"
  );
});

it.each([false, true])(
  "uses the current workbench frame and workspace paths with Browser granted=%s",
  async (browserGranted) => {
    const workspace = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "grida-workbench-tool-"))
    );
    onTestFinished(() => fs.rm(workspace, { recursive: true, force: true }));
    const artifact = "Presentations/Talk.canvas";
    const bundle = path.join(workspace, artifact);
    await fs.mkdir(bundle, { recursive: true });
    await fs.writeFile(
      path.join(bundle, ".canvas.json"),
      JSON.stringify({
        version: "1",
        editor: "slides",
        documents: [{ id: "intro", src: "001.svg" }],
      })
    );
    await fs.writeFile(
      path.join(bundle, "001.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'
    );
    const endpoints = new NativeEditorSurfaceEndpoints(workspace);
    const deliver = vi.fn<NativeEditorSurfaceDelivery>();
    let browserReady = true;
    const invoke = vi.fn<DesktopBrowserToolLease["invoke"]>(async () => ({
      disposition: "not_dispatched",
      error: "unexpected_operation",
    }));
    const showBrowser = vi.fn<
      NonNullable<DesktopBrowserToolLease["workbench"]>["show"]
    >((target) =>
      browserReady
        ? {
            disposition: "dispatched_verified",
            data: { tabId: target.kind === "tab" ? target.tabId : "new" },
          }
        : { disposition: "not_dispatched", error: "owner_revoked" }
    );
    const browser: DesktopBrowserToolLease = {
      ready: () => browserReady,
      invoke,
      workbench: {
        tabs: () =>
          browserReady
            ? {
                activeTabId: null,
                tabs: [
                  {
                    kind: "browser",
                    tabId: "visible",
                    url: "https://example.com",
                    title: "Example",
                    state: "ready",
                  },
                ],
              }
            : null,
        show: showBrowser,
        focus: () => browserReady,
      },
      close: () => {},
    };
    const sessionId = "chat";
    const lease = endpoints.register(
      sessionId,
      { active: `/${artifact}`, open: [`/${artifact}`], truncated: false },
      () => {},
      deliver,
      17,
      undefined,
      browser
    );
    const { editorEndpointId: endpointId } = lease.selection();
    const request = (message: object, id = randomUUID()) => ({
      sessionId,
      endpointId,
      scope: {
        sources: true,
        workbenchPaths: true,
        presentation: true,
        ...(browserGranted && { browser: true }),
      },
      message: { jsonrpc: "2.0", id, ...message },
      expiresAtMs: Date.now() + 5000,
      timeoutMs: 5000,
    });
    const run = (value: ReturnType<typeof request>) =>
      endpoints.desktopTools(
        value,
        new AbortController().signal,
        browserGranted,
        true,
        true
      );
    const guard = (
      reply: NonNullable<Awaited<ReturnType<typeof run>>>,
      value: ReturnType<typeof request>
    ) =>
      endpoints.desktopToolsReplyGuard(
        reply,
        value,
        browserGranted,
        true,
        true
      );

    const listRequest = request({ method: "tools/list" });
    const tools = await run(listRequest);
    expect(tools?.message).toMatchObject({
      result: {
        tools: expect.arrayContaining(
          ["workbench_list_tabs", "workbench_show"].map((name) =>
            expect.objectContaining({
              name,
              _meta: expect.objectContaining({
                "co.grida/source": {
                  id: "workbench",
                  generation: expect.any(String),
                  description: expect.any(String),
                },
                "co.grida/definitionRevision": 4,
              }),
            })
          )
        ),
      },
    });
    const workbench = NativeDesktopTools.listedSources(tools!.message).find(
      ({ id }) => id === "workbench"
    );
    const call = (
      name: string,
      args: object,
      id?: ReturnType<typeof randomUUID>
    ) =>
      request(
        {
          method: "tools/call",
          params: {
            name,
            arguments: args,
            _meta: {
              "co.grida/source": workbench,
              "co.grida/definitionRevision": 4,
            },
          },
        },
        id
      );
    const list = call("workbench_list_tabs", {});
    const show = (path: string, id?: ReturnType<typeof randomUUID>) =>
      call("workbench_show", { target: { kind: "file", path } }, id);
    const visible = await run(list);
    const file = { kind: "file", path: artifact, tabId: expect.any(String) };
    const browserTab = expect.objectContaining({
      kind: "browser",
      tabId: "visible",
    });
    expect(visible?.message).toMatchObject({
      result: {
        structuredContent: {
          activeTabId: expect.any(String),
          tabs: browserGranted ? [file, browserTab] : [file],
          truncated: false,
        },
      },
    });

    const reply = {
      result: {
        structuredContent: {
          disposition: "dispatched_verified",
          path: artifact,
          requested: true,
        },
      },
    };
    const operation = randomUUID();
    const absoluteRequest = show(bundle, operation);
    const dispatched = await run(absoluteRequest);
    expect(dispatched).toMatchObject({ message: reply });
    await expect(run(show(`./${artifact}`, operation))).resolves.toMatchObject({
      message: reply,
    });
    expect(deliver).toHaveBeenCalledExactlyOnceWith({
      path: `/${artifact}`,
      revision: 17,
      expiresAtMs: expect.any(Number),
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(showBrowser).not.toHaveBeenCalled();
    await expect(
      run(
        call("workbench_show", {
          target: { kind: "url", url: "https://example.com" },
        })
      )
    ).resolves.toMatchObject({
      message: {
        result: browserGranted
          ? {
              isError: false,
              structuredContent: {
                disposition: "dispatched_verified",
                tabId: "new",
              },
            }
          : {
              isError: true,
              structuredContent: {
                disposition: "not_dispatched",
                error: "owner_revoked",
              },
            },
      },
    });
    expect(showBrowser).toHaveBeenCalledTimes(Number(browserGranted));
    await expect(run(show("Presentations"))).resolves.toMatchObject({
      message: { result: { structuredContent: { error: "target_missing" } } },
    });
    await expect(run(show("missing.svg"))).resolves.toMatchObject({
      message: { result: { structuredContent: { error: "target_missing" } } },
    });
    await fs.symlink(os.tmpdir(), path.join(workspace, "escaped"));
    await expect(run(show("escaped"))).resolves.toMatchObject({
      message: {
        result: { structuredContent: { error: "invalid_surface_path" } },
      },
    });
    await expect(
      run(
        call("workbench_show", {
          target: { kind: "file", path: artifact },
          presentation: null,
        })
      )
    ).resolves.toMatchObject({
      message: {
        result: { structuredContent: { error: "invalid_arguments" } },
      },
    });
    expect(deliver).toHaveBeenCalledTimes(1);

    const beforeRevocation = guard(visible!, list);
    const fileReceipt = guard(dispatched!, absoluteRequest);
    const catalog = guard(tools!, listRequest);
    browserReady = false;
    expect(fileReceipt()).toBeUndefined();
    const unverified = expect.objectContaining({
      error: { code: -32603, message: "Editor reply unverified" },
    });
    expect(beforeRevocation()?.message).toEqual(
      browserGranted ? unverified : undefined
    );
    const remainingCatalog = catalog()?.message ?? tools?.message;
    expect(remainingCatalog).toMatchObject({
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "workbench_list_tabs" }),
          expect.objectContaining({ name: "workbench_show" }),
        ]),
      },
    });
    expect(JSON.stringify(remainingCatalog)).not.toContain(
      "workbench_close_browser_tab"
    );
    await expect(
      run(call("workbench_show", { target: { kind: "tab", tabId: "visible" } }))
    ).resolves.toMatchObject({
      message: {
        result: {
          isError: true,
          structuredContent: {
            disposition: "not_dispatched",
            error: browserGranted ? "owner_revoked" : "target_missing",
          },
        },
      },
    });
    await expect(
      run(
        call("workbench_show", {
          target: { kind: "file", path: artifact },
          presentation: "focus",
        })
      )
    ).resolves.toMatchObject({
      message: { result: { structuredContent: { error: "owner_revoked" } } },
    });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect((await run(list))?.message).toMatchObject({
      result: { structuredContent: { tabs: [file] } },
    });
    await expect(run(show(artifact))).resolves.toMatchObject({
      message: reply,
    });
    expect(deliver).toHaveBeenCalledTimes(2);

    function activeTabId(reply: Awaited<ReturnType<typeof run>>) {
      const message = reply?.message;
      if (!message || !("result" in message))
        throw new Error("Expected workbench inventory");
      const data = message.result.structuredContent as
        | { activeTabId?: unknown }
        | undefined;
      if (typeof data?.activeTabId !== "string")
        throw new Error("Expected an active file tab");
      return data.activeTabId;
    }

    const first = activeTabId(visible);
    lease.update({ active: null, open: [], truncated: false }, 18);
    lease.update(
      { active: `/${artifact}`, open: [`/${artifact}`], truncated: false },
      19
    );
    const next = activeTabId(await run(list));
    expect(next).not.toEqual(first);
    const tab = (tabId: string) =>
      call("workbench_show", { target: { kind: "tab", tabId } });
    await expect(run(tab(first))).resolves.toMatchObject({
      message: {
        result: { structuredContent: { disposition: "not_dispatched" } },
      },
    });
    expect(deliver).toHaveBeenCalledTimes(2);
    await expect(run(tab(next))).resolves.toMatchObject({
      message: reply,
    });
    expect(deliver.mock.lastCall?.[0]).toMatchObject({
      path: `/${artifact}`,
      revision: 19,
    });

    const entry = await fs.lstat(bundle);
    const lookup = Promise.withResolvers<typeof entry>();
    const entered = Promise.withResolvers<void>();
    const lstat = vi.spyOn(fs, "lstat").mockImplementationOnce(() => {
      entered.resolve();
      return lookup.promise;
    });
    try {
      const opening = run(show(artifact));
      await entered.promise;
      lease.update({ active: null, open: [], truncated: false }, 20);
      lookup.resolve(entry);
      await expect(opening).resolves.toMatchObject({
        message: {
          result: {
            structuredContent: {
              disposition: "not_dispatched",
              error: "editor_surface_endpoint_unavailable",
            },
          },
        },
      });
      expect(deliver).toHaveBeenCalledTimes(3);
    } finally {
      lookup.resolve(entry);
      lstat.mockRestore();
    }
    lease.close();
  }
);
