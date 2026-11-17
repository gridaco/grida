// GRIDA-SEC-016 — validate typed browser operations and their target guards.
import { DesktopBrowser } from "@grida/desktop-bridge";
import type { BrowserAutomationTarget } from "./browser-host";

export namespace BrowserAutomationArguments {
  export class Error extends globalThis.Error {
    constructor(readonly code: string) {
      super(code);
    }
  }

  export type Point = { x: number; y: number; viewportId: string };
  export type Navigate =
    | { kind: "goto"; url: string }
    | { kind: "back" | "forward" | "reload" | "stop" };
  export type Action =
    | { kind: "fill"; ref: string; value: string }
    | { kind: "select"; ref: string; value: string }
    | { kind: "click" | "hover"; ref: string }
    | { kind: "click" | "hover"; point: Point }
    | { kind: "press"; key: string; ref?: string; modifiers: Modifier[] }
    | { kind: "scroll"; deltaX: number; deltaY: number; point?: Point };
  type Modifier = "Alt" | "Control" | "Meta" | "Shift";
  export type Condition =
    | { kind: "ready"; state: "dom-content-loaded" | "load" }
    | { kind: "text"; text: string }
    | { kind: "url"; url: string }
    | {
        kind: "ref";
        ref: string;
        state: "attached" | "detached" | "visible" | "hidden";
      };
  export type Readiness =
    | { kind: "navigation"; navigationId: string }
    | { kind: "document"; documentId: string };
  export type Topic = "targets" | "actions" | "wait" | "capture" | "errors";

  type Page = { target: BrowserAutomationTarget };
  type Guarded = Page & { documentId: string };
  export type Operation =
    | { tool: "browser_open"; url: string }
    | (Page & { tool: "browser_snapshot"; documentId?: string })
    | (Guarded & { tool: "browser_navigate"; action: Navigate })
    | (Guarded & { tool: "browser_action"; action: Action })
    | (Page & {
        tool: "browser_wait";
        condition: Condition;
        readiness?: Readiness;
        timeoutMs: number;
      })
    | (Guarded & { tool: "browser_capture" })
    | (Page & {
        tool: "browser_diagnostics";
        documentId?: string;
        cursor?: string;
        limit: number;
      })
    | (Guarded & {
        tool: "browser_evaluate";
        functionText: string;
        arg: unknown;
        timeoutMs: number;
      })
    | (Page & { tool: "browser_close" })
    | { tool: "browser_help"; topic?: Topic };

  export function parse(tool: string, input: unknown): Operation {
    switch (tool) {
      case "browser_open": {
        const { url } = object(input, ["url"]);
        return { tool, url: httpUrl(url) };
      }
      case "browser_snapshot": {
        const { target, documentId } = object(input, ["target", "documentId"]);
        return {
          tool,
          target: parseTarget(target),
          documentId: optionalId(documentId),
        };
      }
      case "browser_navigate": {
        const { target, documentId, action } = object(input, [
          "target",
          "documentId",
          "action",
        ]);
        return {
          tool,
          target: parseTarget(target),
          documentId: id(documentId),
          action: navigate(action),
        };
      }
      case "browser_action": {
        const { target, documentId, action } = object(input, [
          "target",
          "documentId",
          "action",
        ]);
        return {
          tool,
          target: parseTarget(target),
          documentId: id(documentId),
          action: browserAction(action),
        };
      }
      case "browser_wait": {
        const { target, readiness, condition, timeoutMs } = object(input, [
          "target",
          "readiness",
          "condition",
          "timeoutMs",
        ]);
        return {
          tool,
          target: parseTarget(target),
          condition: waitCondition(condition),
          readiness: readiness === undefined ? undefined : waitGuard(readiness),
          timeoutMs: integer(timeoutMs ?? 5000, 1, 5000),
        };
      }
      case "browser_capture": {
        const { target, documentId } = object(input, ["target", "documentId"]);
        return {
          tool,
          target: parseTarget(target),
          documentId: id(documentId),
        };
      }
      case "browser_diagnostics": {
        const { target, documentId, cursor, limit } = object(input, [
          "target",
          "documentId",
          "cursor",
          "limit",
        ]);
        return {
          tool,
          target: parseTarget(target),
          documentId: optionalId(documentId),
          cursor: optionalId(cursor),
          limit: integer(limit ?? 25, 1, 100),
        };
      }
      case "browser_evaluate": {
        const { target, documentId, functionText, arg, timeoutMs } = object(
          input,
          ["target", "documentId", "functionText", "arg", "timeoutMs"]
        );
        const json = JSON.stringify(arg ?? null);
        if (Buffer.byteLength(json) > 16 * 1024) invalid();
        return {
          tool,
          target: parseTarget(target),
          documentId: id(documentId),
          functionText: string(functionText, 16 * 1024),
          arg: JSON.parse(json),
          timeoutMs: integer(timeoutMs ?? 5000, 1, 5000),
        };
      }
      case "browser_close": {
        const { target } = object(input, ["target"]);
        return { tool, target: parseTarget(target) };
      }
      case "browser_help": {
        const { topic } = object(input, ["topic"]);
        return {
          tool,
          topic:
            topic === undefined
              ? undefined
              : choice(topic, [
                  "targets",
                  "actions",
                  "wait",
                  "capture",
                  "errors",
                ]),
        };
      }
      default:
        throw new Error("unknown_browser_operation");
    }
  }

  function parseTarget(input: unknown): BrowserAutomationTarget {
    const { kind, pageId, tabId } = object(input, ["kind", "pageId", "tabId"]);
    if (kind === "background" && tabId === undefined)
      return { kind, pageId: id(pageId) };
    if (kind === "workbench" && pageId === undefined)
      return { kind, tabId: id(tabId) };
    return invalid();
  }

  function navigate(input: unknown): Navigate {
    const { kind, url } = object(input, ["kind", "url"]);
    if (kind === "goto") return { kind, url: httpUrl(url) };
    if (url !== undefined) return invalid();
    return { kind: choice(kind, ["back", "forward", "reload", "stop"]) };
  }

  function browserAction(input: unknown): Action {
    const { kind, ...args } = object(input, [
      "kind",
      "ref",
      "value",
      "point",
      "key",
      "modifiers",
      "deltaX",
      "deltaY",
    ]);
    switch (kind) {
      case "fill":
      case "select": {
        const { ref, value } = object(args, ["ref", "value"]);
        return { kind, ref: id(ref), value: string(value, 8192, true) };
      }
      case "click":
      case "hover": {
        const { ref, point } = object(args, ["ref", "point"]);
        if (ref !== undefined && point === undefined)
          return { kind, ref: id(ref) };
        if (point !== undefined && ref === undefined)
          return { kind, point: parsePoint(point) };
        return invalid();
      }
      case "press": {
        const { ref, key, modifiers } = object(args, [
          "ref",
          "key",
          "modifiers",
        ]);
        if (
          modifiers !== undefined &&
          (!Array.isArray(modifiers) || modifiers.length > 4)
        )
          invalid();
        const normalized =
          (modifiers as unknown[] | undefined)?.map((modifier) =>
            choice(modifier, ["Alt", "Control", "Meta", "Shift"])
          ) ?? [];
        if (new Set(normalized).size !== normalized.length) invalid();
        return {
          kind,
          ref: optionalId(ref),
          key: browserKey(string(key, 32), normalized),
          modifiers: normalized,
        };
      }
      case "scroll": {
        const { deltaX, deltaY, point } = object(args, [
          "deltaX",
          "deltaY",
          "point",
        ]);
        const x = number(deltaX ?? 0, -12000, 12000);
        const y = number(deltaY ?? 0, -12000, 12000);
        if (x === 0 && y === 0) invalid();
        return {
          kind,
          deltaX: x,
          deltaY: y,
          point: point === undefined ? undefined : parsePoint(point),
        };
      }
      default:
        return invalid();
    }
  }

  function browserKey(value: string, modifiers: Modifier[]): string {
    const key = value.toLowerCase();
    const primary = modifiers.includes("Meta") || modifiers.includes("Control");
    const alt = modifiers.includes("Alt");
    const shift = modifiers.includes("Shift");
    const control = modifiers.includes("Control");
    // App-level and clipboard accelerators have their own authority.
    const reserved =
      (primary && ["c", "x", "v", "f", "g"].includes(key)) ||
      (primary && !alt && ["+", "=", "-", "0"].includes(key)) ||
      (primary &&
        !alt &&
        !shift &&
        ["t", "w", "l", "r", "p", "q", "m", "h", "o", ","].includes(key)) ||
      (primary && !alt && shift && ["n", "o", "t"].includes(key)) ||
      (primary && alt && ["arrowleft", "arrowright"].includes(key)) ||
      (primary && (alt || shift) && key === "i") ||
      (control && ["tab", "insert", "`", ","].includes(key)) ||
      (shift && ["insert", "delete"].includes(key)) ||
      (primary && shift && alt && key === "r");
    if (reserved) throw new Error("reserved_shortcut");
    return value;
  }

  function parsePoint(input: unknown): Point {
    const { x, y, viewportId } = object(input, ["x", "y", "viewportId"]);
    return {
      x: number(x, 0, 32000),
      y: number(y, 0, 32000),
      viewportId: id(viewportId),
    };
  }

  function waitCondition(input: unknown): Condition {
    const { kind, ...args } = object(input, [
      "kind",
      "state",
      "text",
      "url",
      "ref",
    ]);
    switch (kind) {
      case "ready": {
        const { state } = object(args, ["state"]);
        return { kind, state: choice(state, ["dom-content-loaded", "load"]) };
      }
      case "text":
        return { kind, text: string(object(args, ["text"]).text, 512) };
      case "url":
        return { kind, url: string(object(args, ["url"]).url, 4096) };
      case "ref": {
        const { state, ref } = object(args, ["state", "ref"]);
        return {
          kind,
          ref: id(ref),
          state: choice(state, ["attached", "detached", "visible", "hidden"]),
        };
      }
      default:
        return invalid();
    }
  }

  function waitGuard(input: unknown): Readiness {
    const { kind, documentId, navigationId } = object(input, [
      "kind",
      "documentId",
      "navigationId",
    ]);
    if (kind === "document" && navigationId === undefined)
      return { kind, documentId: id(documentId) };
    if (kind === "navigation" && documentId === undefined)
      return { kind, navigationId: id(navigationId) };
    return invalid();
  }

  function object(
    input: unknown,
    keys: readonly string[]
  ): Record<string, unknown> {
    if (input === null || typeof input !== "object" || Array.isArray(input))
      return invalid();
    if (!Object.keys(input).every((key) => keys.includes(key)))
      return invalid();
    return input as Record<string, unknown>;
  }

  function id(input: unknown): string {
    return string(input, 128);
  }

  function optionalId(input: unknown): string | undefined {
    return input === undefined ? undefined : id(input);
  }

  function httpUrl(input: unknown): string {
    const url = DesktopBrowser.normalizeUrl(string(input, 4096));
    return url ?? invalid();
  }

  function string(input: unknown, bytes: number, empty = false): string {
    if (
      typeof input !== "string" ||
      (!empty && input.length === 0) ||
      Buffer.byteLength(input) > bytes
    )
      return invalid();
    return input;
  }

  function number(input: unknown, min: number, max: number): number {
    if (
      typeof input !== "number" ||
      !Number.isFinite(input) ||
      input < min ||
      input > max
    )
      return invalid();
    return input;
  }

  function integer(input: unknown, min: number, max: number): number {
    const value = number(input, min, max);
    return Number.isInteger(value) ? value : invalid();
  }

  function choice<const T extends string>(
    input: unknown,
    choices: readonly T[]
  ): T {
    if (typeof input !== "string" || !choices.includes(input as T))
      return invalid();
    return input as T;
  }

  function invalid(): never {
    throw new Error("invalid_arguments");
  }
}
