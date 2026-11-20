// GRIDA-SEC-004 — this catalog is scoped to the endpoint that owns its grants.
export namespace NativeDesktopTools {
  export const capability = "co.grida/session/desktop-tools";
  export const method = "_co.grida/editor/desktop-tools";

  const DEFINITION_REVISION = "co.grida/definitionRevision";
  const REQUEST_LIMIT = 32 * 1024;

  export type Invocation = Readonly<{
    id: string;
    signal: AbortSignal;
    expiresAtMs: number;
  }>;

  type ToolResult = Readonly<{
    content: readonly Readonly<{ type: "text"; text: string }>[];
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
    invoke(
      args: Readonly<Record<string, unknown>> | undefined,
      invocation: Invocation
    ): ToolResult | Promise<ToolResult>;
  }>;

  export async function reply(
    value: unknown,
    tools: readonly Tool[] | undefined,
    context?: Omit<Invocation, "id">
  ): Promise<Reply | null> {
    const request = parseRequest(value);
    if (!request) return null;

    const reply = { jsonrpc: "2.0" as const, id: request.id };
    const error = (code: number, message: string) => ({
      ...reply,
      error: { code, message },
    });
    if (Buffer.byteLength(JSON.stringify(value)) > REQUEST_LIMIT)
      return error(-32602, "Invalid params");
    if (context && context.expiresAtMs <= Date.now())
      return error(-32004, "desktop_tool_deadline_elapsed");
    if (!tools) return error(-32001, "editor_surface_endpoint_unavailable");

    const params = record(request.params);
    if (request.hasParams && !params) return error(-32602, "Invalid params");
    const meta = record(params?._meta);
    if (params && Object.hasOwn(params, "_meta") && !meta)
      return error(-32602, "Invalid params");
    if (request.method === "tools/list") {
      if (params && Object.keys(params).some((key) => key !== "_meta"))
        return error(-32602, "Invalid params");
      return {
        ...reply,
        result: {
          resultType: "complete",
          tools: tools.map(({ definition, revision }) => ({
            ...definition,
            _meta: { [DEFINITION_REVISION]: revision },
          })),
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
    const tool = tools.find(
      ({ definition }) => definition.name === params.name
    );
    if (!tool) return error(-32602, "Unknown tool");
    if (meta?.[DEFINITION_REVISION] !== tool.revision)
      return error(-32002, "desktop_tool_definition_changed");
    const result = await tool.invoke(args, {
      id: request.id,
      ...(context ?? {
        signal: AbortSignal.timeout(2000),
        expiresAtMs: Date.now() + 2000,
      }),
    });
    return {
      ...reply,
      result: { ...result, resultType: "complete" },
    };
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

  function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }
}
