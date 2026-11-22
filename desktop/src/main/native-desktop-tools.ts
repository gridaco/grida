// GRIDA-SEC-004 — this catalog is scoped to the endpoint that owns its grants.
export namespace NativeDesktopTools {
  export const capability = "co.grida/session/desktop-tools";
  export const browserCapability = "co.grida/session/desktop-browser-mcp";
  export const sourcesCapability = "co.grida/session/desktop-tool-sources";
  export const workbenchPathsCapability =
    "co.grida/session/workbench-file-paths";
  export const method = "_co.grida/editor/desktop-tools";

  const DEFINITION_REVISION = "co.grida/definitionRevision";
  const REQUEST_LIMIT = 32 * 1024;
  const EXTENDED_REQUEST_LIMIT = 48 * 1024;
  const DEFAULT_RESULT_LIMIT = 32 * 1024;
  export const maxTools = 24;
  export const maxInputBytes = 40 * 1024;
  export const maxOutputBytes = 448 * 1024;
  const SOURCE = "co.grida/source";
  const RESULT_DISPOSITION = "co.grida/resultDisposition";
  const DISPOSITION = "co.grida/disposition";

  export type SourceBinding = Readonly<{ id: string; generation: string }>;
  export type Source = SourceBinding & Readonly<{ description: string }>;

  export type Invocation = Readonly<{
    id: string;
    signal: AbortSignal;
    expiresAtMs: number;
  }>;

  export type ToolResult = Readonly<{
    content: readonly (
      | Readonly<{ type: "text"; text: string }>
      | Readonly<{ type: "image"; mimeType: "image/jpeg"; data: string }>
    )[];
    structuredContent?: Readonly<Record<string, unknown>>;
    isError?: boolean;
    _meta?: Readonly<Record<string, unknown>>;
  }>;

  export type Reply = Readonly<{ jsonrpc: "2.0"; id: string }> &
    (
      | Readonly<{
          result: { resultType: "complete" } & Record<string, unknown>;
        }>
      | Readonly<{ error: { code: number; message: string } }>
    );

  export type Tool = Readonly<{
    definition: Readonly<{
      name: string;
      description: string;
      annotations?: Readonly<{ readOnlyHint?: boolean }>;
      inputSchema: Readonly<Record<string, unknown>>;
      outputSchema?: Readonly<Record<string, unknown>>;
    }>;
    revision: number;
    resultDisposition?: true;
    transfer?: Readonly<{
      maxInputBytes: number;
      maxOutputBytes: number;
      resultMimeType?: "image/jpeg";
    }>;
    invoke(
      args: Readonly<Record<string, unknown>> | undefined,
      invocation: Invocation
    ): ToolResult | Promise<ToolResult>;
  }>;

  export type RegisteredTool = Tool &
    Readonly<{ source: Source; sourceSignal: AbortSignal }>;

  type Catalog =
    | readonly Tool[]
    | Readonly<{ tools: readonly RegisteredTool[]; sources: true }>;

  export async function reply(
    value: unknown,
    catalog: Catalog | undefined,
    context?: Omit<Invocation, "id">
  ): Promise<Reply | null> {
    const request = parseRequest(value);
    if (!request) return null;

    const reply = { jsonrpc: "2.0" as const, id: request.id };
    const error = (code: number, message: string) => ({
      ...reply,
      error: { code, message },
    });
    const bytes = Buffer.byteLength(JSON.stringify(value));
    if (bytes > EXTENDED_REQUEST_LIMIT) return error(-32602, "Invalid params");
    if (context && context.expiresAtMs <= Date.now())
      return error(-32004, "desktop_tool_deadline_elapsed");
    if (!catalog) return unavailable(request.id);
    const sourced = "sources" in catalog;

    const params = record(request.params);
    if (request.hasParams && !params) return error(-32602, "Invalid params");
    const meta = record(params?._meta);
    if (params && Object.hasOwn(params, "_meta") && !meta)
      return error(-32602, "Invalid params");
    if (request.method === "tools/list") {
      if (
        bytes > REQUEST_LIMIT ||
        (params && Object.keys(params).some((key) => key !== "_meta"))
      )
        return error(-32602, "Invalid params");
      return {
        ...reply,
        result: {
          resultType: "complete",
          tools: sourced
            ? projectCatalog(catalog.tools)
            : catalog.map((tool) => wireTool(tool)),
        },
      };
    }
    if (request.method !== "tools/call")
      return error(-32601, "Method not found");
    const args = record(params?.arguments);
    if (
      !params ||
      typeof params.name !== "string" ||
      Object.keys(params).some(
        (key) => !["name", "arguments", "_meta"].includes(key)
      ) ||
      (Object.hasOwn(params, "arguments") && !args)
    )
      return error(-32602, "Invalid params");
    const binding = parseSourceBinding(meta?.[SOURCE]);
    if (sourced ? !binding : meta?.[SOURCE] !== undefined)
      return error(-32602, "Invalid params");
    const named = (tool: Tool) => tool.definition.name === params.name;
    const registered = sourced ? catalog.tools.find(named) : undefined;
    const tool = sourced ? registered : catalog.find(named);
    if (!tool) return error(-32602, "Unknown tool");
    if (
      registered &&
      (!binding ||
        registered.source.id !== binding.id ||
        registered.source.generation !== binding.generation ||
        registered.sourceSignal.aborted)
    )
      return unavailable(request.id);
    if (
      sourced || tool.transfer
        ? Buffer.byteLength(JSON.stringify(args ?? {})) >
          (tool.transfer?.maxInputBytes ?? REQUEST_LIMIT)
        : bytes > REQUEST_LIMIT
    )
      return error(-32602, "Invalid params");
    if (meta?.[DEFINITION_REVISION] !== tool.revision)
      return error(-32002, "desktop_tool_definition_changed");
    const invocation = context ?? {
      signal: AbortSignal.timeout(2000),
      expiresAtMs: Date.now() + 2000,
    };
    if (registered && invocation.signal.aborted) return unverified(request.id);
    const result = await tool.invoke(args, {
      ...invocation,
      id: request.id,
      signal: registered
        ? AbortSignal.any([invocation.signal, registered.sourceSignal])
        : invocation.signal,
    });
    if (registered?.sourceSignal.aborted) return unverified(request.id);
    if (sourced && tool.resultDisposition) {
      const disposition = result._meta?.[DISPOSITION];
      if (
        (disposition !== "not_dispatched" &&
          disposition !== "dispatched_verified" &&
          disposition !== "unknown") ||
        disposition !== result.structuredContent?.disposition
      )
        return unverified(request.id);
    }
    const output = { ...result, resultType: "complete" as const };
    if (
      (sourced || tool.transfer) &&
      Buffer.byteLength(JSON.stringify(output)) >
        (tool.transfer?.maxOutputBytes ?? DEFAULT_RESULT_LIMIT)
    )
      return unverified(request.id);
    return { ...reply, result: output };
  }

  export function busy(value: unknown): Reply | null {
    const request = parseRequest(value);
    return (
      request && {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32003, message: "desktop_tool_backend_busy" },
      }
    );
  }

  export function isCall(value: unknown): boolean {
    return parseRequest(value)?.method === "tools/call";
  }

  export function toolName(value: unknown): string | undefined {
    const request = parseRequest(value);
    if (request?.method !== "tools/call") return;
    const name = record(request.params)?.name;
    return typeof name === "string" ? name : undefined;
  }

  export function toolArguments(value: unknown) {
    const request = parseRequest(value);
    if (request?.method === "tools/call")
      return record(record(request.params)?.arguments);
  }

  export function toolSource(value: unknown): SourceBinding | undefined {
    const request = parseRequest(value);
    if (request?.method !== "tools/call") return;
    return parseSourceBinding(record(record(request.params)?._meta)?.[SOURCE]);
  }

  export function listedSources(reply: Reply): SourceBinding[] {
    if (!("result" in reply) || !Array.isArray(reply.result.tools)) return [];
    return reply.result.tools.flatMap((tool) => {
      const source = listedSource(tool);
      return source ? [source] : [];
    });
  }

  function wireTool(tool: Tool, source?: Source) {
    return {
      ...tool.definition,
      _meta: {
        [DEFINITION_REVISION]: tool.revision,
        ...(source && {
          [SOURCE]: source,
          ...(tool.resultDisposition && { [RESULT_DISPOSITION]: true }),
        }),
        ...(tool.transfer && {
          "co.grida/maxInputBytes": tool.transfer.maxInputBytes,
          "co.grida/maxOutputBytes": tool.transfer.maxOutputBytes,
          ...(tool.transfer.resultMimeType && {
            "co.grida/resultMimeType": tool.transfer.resultMimeType,
          }),
        }),
      },
    };
  }

  function projectCatalog(registered: readonly RegisteredTool[]) {
    const sources = new Map<string, ReturnType<typeof wireTool>[]>();
    for (const tool of registered) {
      const group = sources.get(tool.source.id) ?? [];
      group.push(wireTool(tool, tool.source));
      sources.set(tool.source.id, group);
    }
    const tools: ReturnType<typeof wireTool>[] = [];
    let bytes = Buffer.byteLength(
      JSON.stringify({ resultType: "complete", tools })
    );
    for (const group of sources.values()) {
      if (tools.length + group.length > maxTools) continue;
      const groupBytes =
        Buffer.byteLength(JSON.stringify(group)) - 2 + Number(tools.length > 0);
      if (bytes + groupBytes > EXTENDED_REQUEST_LIMIT) continue;
      tools.push(...group);
      bytes += groupBytes;
    }
    return tools;
  }

  export function filterCatalog(
    reply: Reply,
    keep: (name: string, source: SourceBinding) => boolean
  ): Reply {
    if (!("result" in reply) || !Array.isArray(reply.result.tools))
      return reply;
    const tools = reply.result.tools.filter((tool) => {
      const name = record(tool)?.name;
      const source = listedSource(tool);
      return typeof name === "string" && source && keep(name, source);
    });
    return tools.length === reply.result.tools.length
      ? reply
      : { ...reply, result: { ...reply.result, tools } };
  }

  function listedSource(tool: unknown): SourceBinding | undefined {
    const source = record(record(record(tool)?._meta)?.[SOURCE]);
    if (typeof source?.id === "string" && typeof source.generation === "string")
      return { id: source.id, generation: source.generation };
  }

  export function unavailable(id: string): Reply {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32001, message: "editor_surface_endpoint_unavailable" },
    };
  }

  export function unverified(id: string): Reply {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: "Editor reply unverified" },
    };
  }

  export function failure(text: string): ToolResult {
    return { content: [{ type: "text", text }], isError: true };
  }

  function parseRequest(value: unknown) {
    const request = record(value);
    return request &&
      request.jsonrpc === "2.0" &&
      typeof request.id === "string" &&
      /^[!-~]{1,128}$/.test(request.id) &&
      typeof request.method === "string" &&
      Object.keys(request).every((key) =>
        ["jsonrpc", "id", "method", "params"].includes(key)
      )
      ? {
          id: request.id,
          method: request.method,
          params: request.params,
          hasParams: Object.hasOwn(request, "params"),
        }
      : null;
  }

  function parseSourceBinding(value: unknown): SourceBinding | undefined {
    const binding = record(value);
    if (!binding || Object.keys(binding).length !== 2) return;
    const { id, generation } = binding;
    if (
      typeof id === "string" &&
      id.length <= 64 &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) &&
      typeof generation === "string" &&
      /^[a-zA-Z0-9._/:-]{1,128}$/.test(generation)
    )
      return { id, generation };
  }

  function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }
}
