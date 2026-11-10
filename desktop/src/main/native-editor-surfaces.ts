// GRIDA-SEC-004 — editor observations belong to one exact chat attachment.
import { randomUUID } from "node:crypto";
import {
  NativeEditorSurfaces,
  type NativeEditorSurfaceOpen,
  type NativeEditorSurfaceSnapshot,
} from "@grida/desktop-bridge";

const MAX_ENDPOINTS = 32;
const MAX_PRESENTATION_CALLS = 64;
const PRESENTATION_WINDOW_MS = 2000;
const SESSION_ID = /^[A-Za-z0-9_.:@/-]{1,256}$/;
const ENDPOINT_ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export type NativeEditorSurfaceLease = Readonly<{
  selection(): NativeEditorSurfaceSelection;
  update(snapshot: NativeEditorSurfaceSnapshot, revision?: number): void;
  close(): void;
}>;

export type NativeEditorSurfaceSelection = Readonly<{
  editorEndpointId: string;
  editorPresentation?: true;
}>;

export type NativeEditorSurfaceDelivery = (
  request: NativeEditorSurfaceOpen
) => void;

type Endpoint = {
  sessionId: string;
  snapshot: NativeEditorSurfaceSnapshot;
  requireCurrent(): void;
  revision?: number;
  deliver?: NativeEditorSurfaceDelivery;
  calls: Map<string, { path: string; requested: boolean }>;
};

export class NativeEditorSurfaceEndpoints {
  static readonly capability = "co.grida/session/editor-surfaces";
  static readonly readMethod = "_co.grida/editor/surface-list-open";
  static readonly openCapability = "co.grida/session/editor-surface-open";
  static readonly openMethod = "_co.grida/editor/surface-open";

  private readonly endpoints = new Map<string, Endpoint>();

  register(
    sessionId: string,
    snapshot: NativeEditorSurfaceSnapshot,
    requireCurrent: () => void,
    deliver?: NativeEditorSurfaceDelivery,
    revision?: number
  ): NativeEditorSurfaceLease {
    requireCurrent();
    if (this.endpoints.size >= MAX_ENDPOINTS)
      throw new Error("native_chat_editor_surface_limit");
    const id = randomUUID();
    const endpoint: Endpoint = {
      sessionId,
      snapshot,
      requireCurrent,
      revision,
      deliver,
      calls: new Map(),
    };
    this.endpoints.set(id, endpoint);
    return Object.freeze({
      selection: () => ({
        editorEndpointId: id,
        ...(this.endpoints.get(id) === endpoint &&
          endpoint.deliver &&
          endpoint.revision !== undefined && {
            editorPresentation: true as const,
          }),
      }),
      update: (next: NativeEditorSurfaceSnapshot, revision?: number) => {
        if (this.endpoints.get(id) !== endpoint) return;
        requireCurrent();
        if (
          revision !== undefined &&
          endpoint.revision !== undefined &&
          revision <= endpoint.revision
        )
          return;
        endpoint.snapshot = next;
        endpoint.revision = revision;
      },
      close: () => {
        this.endpoints.delete(id);
      },
    });
  }

  read(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const { sessionId, endpointId } = value as Record<string, unknown>;
    if (
      Object.keys(value).length !== 2 ||
      typeof sessionId !== "string" ||
      !SESSION_ID.test(sessionId) ||
      typeof endpointId !== "string" ||
      !ENDPOINT_ID.test(endpointId)
    )
      return null;
    const endpoint = this.current(sessionId, endpointId);
    if (endpoint)
      return { sessionId, endpointId, available: true, ...endpoint.snapshot };
    return {
      sessionId,
      endpointId,
      available: false,
      active: null,
      open: [],
      truncated: false,
    };
  }

  open(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const { sessionId, endpointId, callId, path } = value as Record<
      string,
      unknown
    >;
    if (
      Object.keys(value).length !== 4 ||
      typeof sessionId !== "string" ||
      !SESSION_ID.test(sessionId) ||
      typeof endpointId !== "string" ||
      !ENDPOINT_ID.test(endpointId) ||
      typeof callId !== "string" ||
      !ENDPOINT_ID.test(callId) ||
      !NativeEditorSurfaces.isPath(path)
    )
      return null;
    const reply = (requested: boolean) => ({
      sessionId,
      endpointId,
      callId,
      requested,
    });
    const endpoint = this.current(sessionId, endpointId);
    if (!endpoint) return reply(false);
    const previous = endpoint.calls.get(callId);
    if (previous) return reply(previous.path === path && previous.requested);
    if (endpoint.calls.size >= MAX_PRESENTATION_CALLS) return reply(false);

    const receipt = { path, requested: false };
    endpoint.calls.set(callId, receipt);
    if (!endpoint.deliver || endpoint.revision === undefined)
      return reply(false);
    try {
      endpoint.deliver({
        path,
        revision: endpoint.revision,
        expiresAtMs: Date.now() + PRESENTATION_WINDOW_MS,
      });
      receipt.requested = true;
    } catch {
      // The exact frame can disappear before Electron accepts the send.
    }
    return reply(receipt.requested);
  }

  private current(sessionId: string, endpointId: string): Endpoint | undefined {
    const endpoint = this.endpoints.get(endpointId);
    if (endpoint?.sessionId !== sessionId) return;
    try {
      endpoint.requireCurrent();
      return endpoint;
    } catch {
      this.endpoints.delete(endpointId);
    }
  }

  close(): void {
    this.endpoints.clear();
  }
}
