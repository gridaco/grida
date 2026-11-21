// GRIDA-SEC-004 / GRIDA-SEC-016 — only the exact browser lease can dispatch.
import { DesktopBrowser } from "@grida/desktop-bridge";
import type { BrowserAutomationResult } from "./browser-automation";
import catalog from "../../../extensions/browser/tools.json";
import type { DesktopBrowserToolLease } from "./desktop-browser-tools";
import workbench from "./desktop-workbench-tools.json";
import { NativeDesktopTools } from "./native-desktop-tools";

/** Browser and browser-aware Workbench definitions for the private carrier. */
export namespace DesktopBrowserMcp {
  const MAX_BASE64_BYTES = Math.ceil((256 * 1024) / 3) * 4;
  const WORKBENCH_SHOW = "workbench_show";
  export const closeTabName = workbench.close.name;
  const CLOSE_PAGE = "browser_close";
  const DISPOSITION = "co.grida/disposition";

  type Descriptor = (typeof catalog)[number];
  type Definition = Pick<
    NativeDesktopTools.Tool,
    "definition" | "revision" | "transfer"
  > & {
    operation: string;
    source: Source;
  };

  export type Source = "browser" | "workbench";

  const definitions = catalog.flatMap(definitionsFor);
  const names = new Set(definitions.map(({ definition }) => definition.name));

  export function hasDefinition(name: string | undefined): boolean {
    return name !== undefined && names.has(name);
  }

  export function bind(
    lease: DesktopBrowserToolLease | undefined,
    presentation: boolean,
    source?: Source
  ): NativeDesktopTools.Tool[] {
    return definitions
      .filter(
        (entry) =>
          (source === undefined || entry.source === source) &&
          (presentation || entry.definition.name !== WORKBENCH_SHOW)
      )
      .map(({ definition, revision, transfer, operation }) => ({
        definition,
        revision,
        transfer,
        resultDisposition: true,
        async invoke(args, call) {
          if (!lease?.ready()) return project(refused("owner_revoked"));
          if (call.signal.aborted || Date.now() >= call.expiresAtMs)
            return project(refused("canceled"));

          let payload: Readonly<Record<string, unknown>> = args ?? {};
          if (
            definition.name === CLOSE_PAGE &&
            record(payload.target)?.kind !== "background"
          )
            return project(refused("invalid_arguments"));
          if (definition.name === closeTabName) {
            if (
              Object.keys(payload).length !== 1 ||
              !DesktopBrowser.isIdentity(payload.tabId)
            )
              return project(refused("invalid_arguments"));
            payload = { target: { kind: "workbench", tabId: payload.tabId } };
          }

          const result = await lease.invoke(
            operation,
            payload,
            call.signal,
            call.expiresAtMs
          );
          if (!lease.ready()) return project(revoked(result.disposition));
          if (call.signal.aborted || Date.now() >= call.expiresAtMs)
            return project(revoked(result.disposition, "canceled"));
          if (
            operation === "browser_help" &&
            result.data?.topic === "targets" &&
            typeof result.data.text === "string"
          ) {
            return project({
              ...result,
              data: {
                ...result.data,
                text: result.data.text.replace(
                  "surface_list_open",
                  "workbench_list_tabs"
                ),
              },
            });
          }
          return project(result, transfer?.resultMimeType);
        },
      }));
  }

  /** Withdraw a ready Browser reply while it waits for transport capacity. */
  export function revokeReply(
    reply: NativeDesktopTools.Reply,
    reason?: "owner_revoked" | "canceled"
  ): NativeDesktopTools.Reply {
    if (!("result" in reply)) return reply;
    const disposition = record(reply.result._meta)?.[DISPOSITION];
    return {
      jsonrpc: "2.0",
      id: reply.id,
      result: {
        ...project(revoked(disposition, reason)),
        resultType: "complete",
      },
    };
  }

  function definitionsFor(descriptor: Descriptor): Definition[] {
    const { name, description, inputSchema, outputSchema, effect, version } =
      descriptor;
    const original: Definition = {
      definition: {
        name,
        description,
        inputSchema,
        outputSchema,
        ...(effect === "read" && { annotations: { readOnlyHint: true } }),
      },
      revision: version,
      operation: name,
      source: "browser",
      transfer: {
        maxInputBytes: NativeDesktopTools.maxInputBytes,
        maxOutputBytes: NativeDesktopTools.maxOutputBytes,
        ...(name === "browser_capture" && {
          resultMimeType: "image/jpeg" as const,
        }),
      },
    };
    if (name === "surface_list_open")
      return [
        {
          ...original,
          source: "workbench",
          definition: { ...original.definition, name: "workbench_list_tabs" },
        },
      ];
    if (name === "surface_open")
      return [
        {
          ...original,
          source: "workbench",
          definition: {
            ...original.definition,
            name: WORKBENCH_SHOW,
            description:
              "Ask the attached workbench to show a workspace file, HTTP(S) URL, or exact tab. The workbench chooses the viewer. Window focus requires an explicit request. Use browser_open for background browser work.",
          },
        },
      ];
    if (name !== CLOSE_PAGE) return [original];

    const schema = inputSchema.properties?.target;
    const variants = schema?.oneOf;
    const background = variants?.find(
      (target) => target.properties.kind.const === "background"
    );
    if (!background) throw new Error("invalid_browser_tool_catalog");
    return [
      {
        ...original,
        revision: 2,
        definition: {
          ...original.definition,
          description:
            "Close an exact background page owned by this browser scope.",
          inputSchema: { ...inputSchema, properties: { target: background } },
        },
      },
      {
        ...original,
        revision: workbench.close.version,
        source: "workbench",
        definition: {
          name: workbench.close.name,
          description: workbench.close.description,
          inputSchema: workbench.close.inputSchema,
          outputSchema: workbench.close.outputSchema,
        },
      },
    ];
  }

  export function project(
    { disposition, data, error, image }: BrowserAutomationResult,
    resultMimeType?: "image/jpeg"
  ): NativeDesktopTools.ToolResult {
    if (
      (data &&
        (Object.hasOwn(data, "disposition") || Object.hasOwn(data, "error"))) ||
      (error !== undefined && !/^[a-z0-9_]{1,128}$/.test(error)) ||
      (image &&
        (disposition === "unknown" ||
          error !== undefined ||
          image.mimeType !== resultMimeType ||
          image.base64.length > MAX_BASE64_BYTES)) ||
      (!image &&
        resultMimeType &&
        disposition !== "unknown" &&
        error === undefined)
    )
      return project({ disposition: "unknown", error: "outcome_unknown" });
    return {
      content: error
        ? [{ type: "text", text: error }]
        : image
          ? [{ type: "image", mimeType: image.mimeType, data: image.base64 }]
          : [],
      structuredContent: { ...data, disposition, ...(error && { error }) },
      isError: error !== undefined || disposition === "unknown",
      _meta: { [DISPOSITION]: disposition },
    };
  }

  function refused(error: string): BrowserAutomationResult {
    return { disposition: "not_dispatched", error };
  }

  function revoked(
    disposition: unknown,
    reason = "owner_revoked"
  ): BrowserAutomationResult {
    return disposition === "not_dispatched"
      ? refused(reason)
      : { disposition: "unknown", error: "outcome_unknown" };
  }

  function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }
}
