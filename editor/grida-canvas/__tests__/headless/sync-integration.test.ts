/**
 * End-to-end sync integration tests with headless editors.
 *
 * Two (or three) real Editor instances wired through MockServer +
 * DocumentSyncAdapter — testing the full pipeline:
 *
 *   Editor dispatch → Zustand store → documentToState → computeDiff
 *   → SyncClient → MockServer → broadcast → SyncClient → stateToDocument
 *   → applyDocumentPatches → Editor state
 *
 * This catches bugs that unit-level sync tests miss: serialization
 * round-trip issues, mutex feedback loops, __doc_meta__ handling, etc.
 */

import { describe, it, expect, afterEach } from "vitest";
import type grida from "@grida/schema";
import { Editor } from "@/grida-canvas/editor";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";
import { createDocumentWithRects } from "@/grida-canvas/__tests__/utils/fixtures";
import { rectNode } from "@/grida-canvas/__tests__/utils/factories";
import {
  SyncClient,
  computeDiff,
  type DocumentState,
  type ClientMessage,
  type ServerMessage,
  type DocumentDiff,
  DocumentClock,
  applyDiff,
  validateDiff,
} from "@grida/canvas-sync";
import type {
  ISyncTransport,
  TransportStatus,
  PresenceState,
} from "@grida/canvas-sync";
import { DocumentSyncAdapter } from "@/grida-canvas/plugins/sync/document-sync";
import {
  documentToState,
  stateToDocument,
} from "@/grida-canvas/plugins/sync/serialize";

// ---------------------------------------------------------------------------
// MockTransport (same pattern as the sync package tests)
// ---------------------------------------------------------------------------

class MockTransport implements ISyncTransport {
  status: TransportStatus = "disconnected";
  sent: ClientMessage[] = [];
  private _messageHandlers = new Set<(msg: ServerMessage) => void>();
  private _statusHandlers = new Set<(status: TransportStatus) => void>();
  _onClientMessage: ((msg: ClientMessage) => void) | null = null;

  send(message: ClientMessage): void {
    this.sent.push(message);
    this._onClientMessage?.(message);
  }
  onMessage(handler: (msg: ServerMessage) => void): () => void {
    this._messageHandlers.add(handler);
    return () => this._messageHandlers.delete(handler);
  }
  onStatusChange(handler: (status: TransportStatus) => void): () => void {
    this._statusHandlers.add(handler);
    return () => this._statusHandlers.delete(handler);
  }
  connect(): void {}
  disconnect(): void {
    this._setStatus("disconnected");
  }
  simulateConnected(): void {
    this._setStatus("connected");
  }
  simulateDisconnected(): void {
    this._setStatus("disconnected");
  }
  deliver(msg: ServerMessage): void {
    for (const h of this._messageHandlers) h(msg);
  }
  private _setStatus(s: TransportStatus): void {
    if (this.status === s) return;
    this.status = s;
    for (const h of this._statusHandlers) h(s);
  }
}

// ---------------------------------------------------------------------------
// MockServer (mirrors SyncRoom logic)
// ---------------------------------------------------------------------------

interface MockSession {
  id: string;
  transport: MockTransport;
  presence?: PresenceState;
}

class MockServer {
  canonical: DocumentState;
  clock: DocumentClock;
  private _sessions = new Map<string, MockSession>();

  constructor(initialState: DocumentState = { nodes: {}, scenes: [] }) {
    this.canonical = initialState;
    this.clock = new DocumentClock(0);
  }

  addSession(sessionId: string, transport: MockTransport): void {
    const session: MockSession = { id: sessionId, transport };
    this._sessions.set(sessionId, session);
    transport._onClientMessage = (msg) =>
      this._handleClientMessage(sessionId, msg);
  }

  connectSession(sessionId: string): void {
    const session = this._sessions.get(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    session.transport.simulateConnected();
  }

  /** Find the session ID for a given transport instance. */
  findSessionIdByTransport(transport: MockTransport): string | undefined {
    for (const [id, session] of this._sessions) {
      if (session.transport === transport) return id;
    }
    return undefined;
  }

  private _handleClientMessage(sessionId: string, msg: ClientMessage): void {
    const session = this._sessions.get(sessionId);
    if (!session) return;
    switch (msg.type) {
      case "connect":
        this._handleConnect(session);
        break;
      case "push":
        this._handlePush(session, msg);
        break;
      case "ping":
        session.transport.deliver({ type: "pong" });
        break;
    }
  }

  private _handleConnect(session: MockSession): void {
    session.transport.deliver({
      type: "connect_ok",
      clock: this.clock.value,
      state: this.canonical.nodes,
      scenes: this.canonical.scenes,
    });
  }

  private _handlePush(
    session: MockSession,
    msg: { clientClock: number; diff: DocumentDiff; presence?: PresenceState }
  ): void {
    const validation = validateDiff(this.canonical, msg.diff);
    if (!validation.valid) {
      session.transport.deliver({
        type: "push_ok",
        serverClock: this.clock.value,
        clientClock: msg.clientClock,
        result: "discard",
      });
      return;
    }
    const newClock = this.clock.tick();
    this.canonical = applyDiff(this.canonical, msg.diff);
    session.transport.deliver({
      type: "push_ok",
      serverClock: newClock,
      clientClock: msg.clientClock,
      result: "commit",
    });
    for (const [id, other] of this._sessions) {
      if (id === session.id) continue;
      if (other.transport.status !== "connected") continue;
      other.transport.deliver({
        type: "patch",
        serverClock: newClock,
        diff: msg.diff,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SyncedEditor {
  editor: Editor;
  client: SyncClient;
  transport: MockTransport;
  adapter: DocumentSyncAdapter;
}

function createSyncedEditor(
  server: MockServer,
  sessionId: string,
  doc: grida.program.document.Document
): SyncedEditor {
  const editor = createHeadlessEditor({ document: doc });
  const transport = new MockTransport();
  const initialState = documentToState(editor.doc.state.document);
  const client = new SyncClient({
    schema: "test",
    transport,
    initialState,
    lastClock: 0,
    pushInterval: -1, // synchronous for deterministic tests
  });
  const adapter = new DocumentSyncAdapter(editor, client);
  server.addSession(sessionId, transport);
  return { editor, client, transport, adapter };
}

function connectAndSync(server: MockServer, se: SyncedEditor): void {
  const sessionId = server.findSessionIdByTransport(se.transport);
  if (!sessionId) throw new Error("Transport not registered with server");
  server.connectSession(sessionId);
}

/**
 * Flush a synced editor's pending changes to the server.
 * With pushInterval: -1, pushDiff is synchronous, but the throttled
 * editor subscription fires asynchronously. We force it by calling
 * computeDiff + pushDiff manually.
 */
function flushEditorToServer(se: SyncedEditor): void {
  const currentState = documentToState(se.editor.doc.state.document);
  const diff = computeDiff(se.adapter.lastSyncedState, currentState);
  if (diff) {
    se.adapter.lastSyncedState = currentState;
    se.client.pushDiff(diff);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Sync integration with headless editors", () => {
  const editors: Editor[] = [];

  afterEach(() => {
    for (const ed of editors) {
      try {
        ed.dispose();
      } catch {}
    }
    editors.length = 0;
  });

  // -----------------------------------------------------------------------
  // serialize round-trip
  // -----------------------------------------------------------------------

  describe("serialize round-trip", () => {
    it("documentToState → stateToDocument preserves nodes", () => {
      const doc = createDocumentWithRects(3);
      const state = documentToState(doc);
      const restored = stateToDocument(state);

      expect(Object.keys(restored.nodes).sort()).toEqual(
        Object.keys(doc.nodes).sort()
      );
      // Check a specific node
      expect(restored.nodes["rect-0"]).toEqual(doc.nodes["rect-0"]);
    });

    it("preserves scenes_ref", () => {
      const doc = createDocumentWithRects(2);
      const state = documentToState(doc);
      const restored = stateToDocument(state);
      expect(restored.scenes_ref).toEqual(doc.scenes_ref);
    });

    it("preserves links", () => {
      const doc = createDocumentWithRects(2);
      const state = documentToState(doc);
      const restored = stateToDocument(state);
      expect(restored.links).toEqual(doc.links);
    });

    it("preserves images and bitmaps", () => {
      const doc = createDocumentWithRects(1);
      doc.images = {
        "img-1": {
          type: "image/png",
          url: "test.png",
          width: 100,
          height: 100,
          bytes: 1000,
        },
      };
      const state = documentToState(doc);
      const restored = stateToDocument(state);
      expect(restored.images).toEqual(doc.images);
    });

    it("__doc_meta__ is excluded from restored nodes", () => {
      const doc = createDocumentWithRects(1);
      const state = documentToState(doc);
      expect(state.nodes["__doc_meta__"]).toBeDefined();
      const restored = stateToDocument(state);
      expect(restored.nodes["__doc_meta__"]).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Two-editor sync
  // -----------------------------------------------------------------------

  describe("two-editor sync", () => {
    it("editor A creates a node, editor B receives it", () => {
      const doc = createDocumentWithRects(1);
      const server = new MockServer(documentToState(doc));

      const A = createSyncedEditor(server, "A", doc);
      const B = createSyncedEditor(server, "B", doc);
      editors.push(A.editor, B.editor);

      connectAndSync(server, A);
      connectAndSync(server, B);

      // A adds a new rectangle via dispatch
      A.editor.doc.dispatch({
        type: "insert",
        id: "new-rect",
        prototype: rectNode("new-rect", {
          x: 200,
          y: 200,
          width: 150,
          height: 75,
        }),
        target: "scene",
      });

      // Flush A's changes to the server
      flushEditorToServer(A);

      // B should now have the new node
      const bNodes = B.editor.doc.state.document.nodes;
      expect(bNodes["new-rect"]).toBeDefined();
      expect(bNodes["new-rect"].type).toBe("rectangle");
    });

    it("both editors modify different nodes — both changes survive", () => {
      const doc = createDocumentWithRects(2);
      const server = new MockServer(documentToState(doc));

      const A = createSyncedEditor(server, "A", doc);
      const B = createSyncedEditor(server, "B", doc);
      editors.push(A.editor, B.editor);

      connectAndSync(server, A);
      connectAndSync(server, B);

      // A modifies rect-0
      A.editor.doc.dispatch({
        type: "node/change/*",
        node_id: "rect-0",
        name: "Renamed by A",
      });
      flushEditorToServer(A);

      // B modifies rect-1
      B.editor.doc.dispatch({
        type: "node/change/*",
        node_id: "rect-1",
        name: "Renamed by B",
      });
      flushEditorToServer(B);

      // Both changes should be present on both editors
      expect(A.editor.doc.state.document.nodes["rect-0"].name).toBe(
        "Renamed by A"
      );
      expect(A.editor.doc.state.document.nodes["rect-1"].name).toBe(
        "Renamed by B"
      );
      expect(B.editor.doc.state.document.nodes["rect-0"].name).toBe(
        "Renamed by A"
      );
      expect(B.editor.doc.state.document.nodes["rect-1"].name).toBe(
        "Renamed by B"
      );
    });

    it("editor A deletes a node, editor B sees it disappear", () => {
      const doc = createDocumentWithRects(2);
      const server = new MockServer(documentToState(doc));

      const A = createSyncedEditor(server, "A", doc);
      const B = createSyncedEditor(server, "B", doc);
      editors.push(A.editor, B.editor);

      connectAndSync(server, A);
      connectAndSync(server, B);

      // A deletes rect-1
      A.editor.doc.delete(["rect-1"]);
      flushEditorToServer(A);

      // B should no longer have rect-1
      expect(B.editor.doc.state.document.nodes["rect-1"]).toBeUndefined();
      // But rect-0 should still exist
      expect(B.editor.doc.state.document.nodes["rect-0"]).toBeDefined();
    });

    it("server state is consistent with both editors", () => {
      const doc = createDocumentWithRects(3);
      const server = new MockServer(documentToState(doc));

      const A = createSyncedEditor(server, "A", doc);
      const B = createSyncedEditor(server, "B", doc);
      editors.push(A.editor, B.editor);

      connectAndSync(server, A);
      connectAndSync(server, B);

      // A renames rect-0
      A.editor.doc.dispatch({
        type: "node/change/*",
        node_id: "rect-0",
        name: "AAA",
      });
      flushEditorToServer(A);

      // B renames rect-2
      B.editor.doc.dispatch({
        type: "node/change/*",
        node_id: "rect-2",
        name: "BBB",
      });
      flushEditorToServer(B);

      // A deletes rect-1
      A.editor.doc.delete(["rect-1"]);
      flushEditorToServer(A);

      // All three should agree
      const aNodeIds = Object.keys(A.editor.doc.state.document.nodes).sort();
      const bNodeIds = Object.keys(B.editor.doc.state.document.nodes).sort();
      // Server nodes exclude __doc_meta__
      const serverNodeIds = Object.keys(server.canonical.nodes)
        .filter((id) => id !== "__doc_meta__")
        .sort();

      expect(aNodeIds).toEqual(bNodeIds);
      expect(aNodeIds).toEqual(expect.arrayContaining(serverNodeIds));

      // Verify specific values
      expect(A.editor.doc.state.document.nodes["rect-0"].name).toBe("AAA");
      expect(B.editor.doc.state.document.nodes["rect-0"].name).toBe("AAA");
      expect(A.editor.doc.state.document.nodes["rect-1"]).toBeUndefined();
      expect(B.editor.doc.state.document.nodes["rect-1"]).toBeUndefined();
      expect(A.editor.doc.state.document.nodes["rect-2"].name).toBe("BBB");
      expect(B.editor.doc.state.document.nodes["rect-2"].name).toBe("BBB");
    });
  });
});
