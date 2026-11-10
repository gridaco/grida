// GRIDA-SEC-004 — editor observations belong to one exact chat attachment.
import { randomUUID } from "node:crypto";
import type { NativeEditorSurfaceSnapshot } from "@grida/desktop-bridge";

const MAX_ENDPOINTS = 32;
const SESSION_ID = /^[A-Za-z0-9_.:@/-]{1,256}$/;
const ENDPOINT_ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export type NativeEditorSurfaceLease = Readonly<{
  id: string;
  update(snapshot: NativeEditorSurfaceSnapshot): void;
  close(): void;
}>;

export class NativeEditorSurfaceEndpoints {
  static readonly capability = "co.grida/session/editor-surfaces";
  static readonly readMethod = "_co.grida/editor/surface-list-open";

  private readonly endpoints = new Map<
    string,
    {
      sessionId: string;
      snapshot: NativeEditorSurfaceSnapshot;
      requireCurrent(): void;
    }
  >();

  register(
    sessionId: string,
    snapshot: NativeEditorSurfaceSnapshot,
    requireCurrent: () => void
  ): NativeEditorSurfaceLease {
    requireCurrent();
    if (this.endpoints.size >= MAX_ENDPOINTS)
      throw new Error("native_chat_editor_surface_limit");
    const id = randomUUID();
    const endpoint = { sessionId, snapshot, requireCurrent };
    this.endpoints.set(id, endpoint);
    return Object.freeze({
      id,
      update: (next: NativeEditorSurfaceSnapshot) => {
        if (this.endpoints.get(id) !== endpoint) return;
        requireCurrent();
        endpoint.snapshot = next;
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
    const endpoint = this.endpoints.get(endpointId);
    if (endpoint?.sessionId === sessionId) {
      try {
        endpoint.requireCurrent();
        return { sessionId, endpointId, available: true, ...endpoint.snapshot };
      } catch {
        this.endpoints.delete(endpointId);
      }
    }
    return {
      sessionId,
      endpointId,
      available: false,
      active: null,
      open: [],
      truncated: false,
    };
  }

  close(): void {
    this.endpoints.clear();
  }
}
