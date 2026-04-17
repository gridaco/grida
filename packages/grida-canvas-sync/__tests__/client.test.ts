import { describe, it, expect, vi } from "vitest";
import { SyncClient, type SyncClientStatus } from "../src/client";
import type { DocumentState } from "../src/diff";
import type {
  ClientMessage,
  ServerMessage,
  SerializedNode,
} from "../src/protocol";
import type { ISyncTransport, TransportStatus } from "../src/transport";

// ---------------------------------------------------------------------------
// MockTransport
// ---------------------------------------------------------------------------

class MockTransport implements ISyncTransport {
  status: TransportStatus = "disconnected";
  sent: ClientMessage[] = [];

  private _messageHandlers = new Set<(msg: ServerMessage) => void>();
  private _statusHandlers = new Set<(status: TransportStatus) => void>();

  send(message: ClientMessage): void {
    if (this.status !== "connected") {
      throw new Error("MockTransport: not connected");
    }
    this.sent.push(message);
  }

  onMessage(handler: (msg: ServerMessage) => void): () => void {
    this._messageHandlers.add(handler);
    return () => this._messageHandlers.delete(handler);
  }

  onStatusChange(handler: (status: TransportStatus) => void): () => void {
    this._statusHandlers.add(handler);
    return () => this._statusHandlers.delete(handler);
  }

  connect(): void {
    this._setStatus("connecting");
    // Simulate async connect
    queueMicrotask(() => this._setStatus("connected"));
  }

  disconnect(): void {
    this._setStatus("disconnected");
  }

  // --- Test helpers ---

  /** Simulate the transport becoming connected (synchronously). */
  simulateConnected(): void {
    this._setStatus("connected");
  }

  /** Deliver a server message to the client. */
  deliver(msg: ServerMessage): void {
    for (const h of this._messageHandlers) h(msg);
  }

  private _setStatus(s: TransportStatus): void {
    this.status = s;
    for (const h of this._statusHandlers) h(s);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(
  id: string,
  props: Record<string, unknown> = {},
  type: string = "rectangle"
): SerializedNode {
  return { type, id, ...props } as SerializedNode;
}

function emptyState(): DocumentState {
  return { nodes: {}, scenes: [] };
}

function createClientAndTransport(
  initialState: DocumentState = emptyState(),
  lastClock = 0
) {
  const transport = new MockTransport();
  const client = new SyncClient({
    schema: "0.91.0-test",
    transport,
    initialState,
    lastClock,
    pushInterval: -1, // Synchronous flush for deterministic tests
  });
  return { transport, client };
}

/** Connect the client through the full handshake. */
function connectClient(
  transport: MockTransport,
  client: SyncClient,
  serverState?: { nodes: Record<string, SerializedNode>; scenes: string[] }
) {
  transport.simulateConnected();
  // Client should have sent a connect message
  const connectMsg = transport.sent.find((m) => m.type === "connect");
  expect(connectMsg).toBeDefined();

  // Server responds with connect_ok
  if (serverState) {
    transport.deliver({
      type: "connect_ok",
      clock: 1,
      state: serverState.nodes,
      scenes: serverState.scenes,
    });
  } else {
    // clock: 1 means the server has been initialized (not empty).
    // Use clock: 0 only for empty-room seed tests.
    transport.deliver({
      type: "connect_ok",
      clock: 1,
    });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SyncClient", () => {
  describe("connection lifecycle", () => {
    it("starts disconnected", () => {
      const { client } = createClientAndTransport();
      expect(client.status).toBe("disconnected");
    });

    it("transitions through connecting → syncing → ready", () => {
      const { transport, client } = createClientAndTransport();
      const statuses: SyncClientStatus[] = [];
      client.on("statusChange", (s) => statuses.push(s));

      transport.simulateConnected();
      expect(statuses).toContain("syncing");

      transport.deliver({ type: "connect_ok", clock: 0 });
      expect(statuses).toContain("ready");
      expect(client.status).toBe("ready");
    });

    it("sends connect message with schema and lastClock", () => {
      const { transport } = createClientAndTransport(emptyState(), 42);
      transport.simulateConnected();

      const msg = transport.sent.find((m) => m.type === "connect");
      expect(msg).toEqual({
        type: "connect",
        schema: "0.91.0-test",
        lastClock: 42,
      });
    });

    it("preserves local state when server responds with no state and no diff", () => {
      const initialState: DocumentState = {
        nodes: {
          n1: makeNode("n1", { width: 100 }),
          scene: makeNode("scene", { name: "Main" }, "scene"),
        },
        scenes: ["scene"],
      };
      const { transport, client } = createClientAndTransport(initialState);
      transport.simulateConnected();

      // Server responds with empty room — no state, no diff
      transport.deliver({
        type: "connect_ok",
        clock: 0,
      });

      // Client should NOT overwrite its local state with empty
      expect(client.state.nodes["n1"]).toEqual(makeNode("n1", { width: 100 }));
      expect(client.state.nodes["scene"]).toBeDefined();
      expect(client.state.scenes).toEqual(["scene"]);
      expect(client.serverClock).toBe(0);
      // Note: SyncClient does NOT seed the room — that's the adapter's responsibility
    });

    it("applies server state on connect_ok with full state", () => {
      const { transport, client } = createClientAndTransport();
      const node = makeNode("n1", { width: 100 });
      connectClient(transport, client, {
        nodes: { n1: node },
        scenes: ["s1"],
      });

      expect(client.state.nodes["n1"]).toEqual(node);
      expect(client.state.scenes).toEqual(["s1"]);
      expect(client.serverClock).toBe(1);
    });

    it("applies incremental diff on connect_ok", () => {
      const initialState: DocumentState = {
        nodes: { n1: makeNode("n1", { width: 100 }) },
        scenes: ["s1"],
      };
      const { transport, client } = createClientAndTransport(initialState, 5);
      transport.simulateConnected();

      // Server sends incremental diff
      transport.deliver({
        type: "connect_ok",
        clock: 7,
        diff: {
          nodes: {
            n1: { op: "patch", fields: { width: { op: "put", value: 200 } } },
          },
        },
      });

      expect(client.state.nodes["n1"]).toEqual(makeNode("n1", { width: 200 }));
      expect(client.serverClock).toBe(7);
    });
  });

  describe("push and ack", () => {
    it("pushes a diff and gets commit ack", () => {
      const { transport, client } = createClientAndTransport();
      connectClient(transport, client);
      transport.sent = []; // Clear connect messages

      client.pushDiff({
        nodes: { n1: { op: "put", node: makeNode("n1", { width: 100 }) } },
      });

      // With pushInterval: -1, push is sent synchronously
      const pushMsg = transport.sent.find((m) => m.type === "push")!;
      expect(pushMsg).toBeDefined();
      expect(pushMsg.type).toBe("push");

      // Server acks with commit
      transport.deliver({
        type: "push_ok",
        serverClock: 1,
        clientClock: (pushMsg as { clientClock: number }).clientClock,
        result: "commit",
      });

      expect(client.isDirty).toBe(false);
      expect(client.canonical.nodes["n1"]).toEqual(
        makeNode("n1", { width: 100 })
      );
    });

    it("handles rebase response", () => {
      const { transport, client } = createClientAndTransport();
      connectClient(transport, client);
      transport.sent = [];

      client.pushDiff({
        nodes: { n1: { op: "put", node: makeNode("n1", { width: 100 }) } },
      });

      // Server rebases — normalizes width to a clamped value
      transport.deliver({
        type: "push_ok",
        serverClock: 1,
        clientClock: 1,
        result: "rebase",
        diff: {
          nodes: {
            n1: { op: "put", node: makeNode("n1", { width: 50 }) },
          },
        },
      });

      // Canonical should use server's version
      expect(client.canonical.nodes["n1"]).toEqual(
        makeNode("n1", { width: 50 })
      );
    });

    it("handles discard response", () => {
      const { transport, client } = createClientAndTransport();
      connectClient(transport, client);
      transport.sent = [];

      client.pushDiff({
        nodes: { n1: { op: "put", node: makeNode("n1") } },
      });

      transport.deliver({
        type: "push_ok",
        serverClock: 0,
        clientClock: 1,
        result: "discard",
      });

      // Canonical should be unchanged
      expect(client.canonical.nodes["n1"]).toBeUndefined();
      // Local state should also reflect the discard (speculative removed)
      expect(client.state.nodes["n1"]).toBeUndefined();
    });
  });

  describe("remote patches", () => {
    it("applies remote patch to canonical and recomputes local", () => {
      const initialState: DocumentState = {
        nodes: { n1: makeNode("n1", { width: 100 }) },
        scenes: [],
      };
      const { transport, client } = createClientAndTransport(initialState);
      connectClient(transport, client);

      const stateChanges: DocumentState[] = [];
      client.on("stateChange", (s) => stateChanges.push(s));

      // Remote patch from another client
      transport.deliver({
        type: "patch",
        serverClock: 1,
        diff: {
          nodes: {
            n1: {
              op: "patch",
              fields: { width: { op: "put", value: 200 } },
            },
          },
        },
      });

      expect(client.state.nodes["n1"]).toEqual(makeNode("n1", { width: 200 }));
      expect(client.serverClock).toBe(1);
      expect(stateChanges.length).toBeGreaterThan(0);
    });

    it("preserves speculative changes over remote patches", () => {
      const initialState: DocumentState = {
        nodes: {
          n1: makeNode("n1", { width: 100, height: 50 }),
        },
        scenes: [],
      };
      const { transport, client } = createClientAndTransport(initialState);
      connectClient(transport, client);

      // Local change (not yet ack'd)
      client.pushDiff({
        nodes: {
          n1: {
            op: "patch",
            fields: { width: { op: "put", value: 999 } },
          },
        },
      });

      // Remote change to a DIFFERENT field
      transport.deliver({
        type: "patch",
        serverClock: 1,
        diff: {
          nodes: {
            n1: {
              op: "patch",
              fields: { height: { op: "put", value: 200 } },
            },
          },
        },
      });

      // Local state should have BOTH: local width=999 AND remote height=200
      expect(client.state.nodes["n1"]).toEqual(
        makeNode("n1", { width: 999, height: 200 })
      );
    });
  });

  describe("optimistic state", () => {
    it("local state reflects unsent changes immediately", () => {
      const { transport, client } = createClientAndTransport();
      connectClient(transport, client);

      client.pushDiff({
        nodes: { n1: { op: "put", node: makeNode("n1", { width: 100 }) } },
      });

      // Before push is flushed, local state should already include the change
      expect(client.state.nodes["n1"]).toEqual(makeNode("n1", { width: 100 }));
      expect(client.isDirty).toBe(true);
    });

    it("composes multiple rapid local changes", () => {
      const { transport, client } = createClientAndTransport();
      connectClient(transport, client);

      client.pushDiff({
        nodes: { n1: { op: "put", node: makeNode("n1", { width: 100 }) } },
      });
      client.pushDiff({
        nodes: {
          n1: {
            op: "patch",
            fields: { width: { op: "put", value: 200 } },
          },
        },
      });

      expect(client.state.nodes["n1"]).toEqual(makeNode("n1", { width: 200 }));
    });
  });

  describe("presence", () => {
    it("emits presenceChange on server presence message", () => {
      const { transport, client } = createClientAndTransport();
      connectClient(transport, client);

      const presenceEvents: Record<string, unknown>[] = [];
      client.on("presenceChange", (p) => presenceEvents.push(p));

      transport.deliver({
        type: "presence",
        peers: {
          peer1: {
            cursor: { cursor_id: "c1", x: 10, y: 20, t: Date.now() },
            profile: { name: "Alice", color: "#ff0000" },
          },
        },
      });

      expect(presenceEvents).toHaveLength(1);
      expect(presenceEvents[0]).toHaveProperty("peer1");
    });
  });

  describe("error handling", () => {
    it("emits error on server error message", () => {
      const { transport, client } = createClientAndTransport();
      connectClient(transport, client);

      const errors: { code: string; message: string }[] = [];
      client.on("error", (e) => errors.push(e));

      transport.deliver({
        type: "error",
        code: "SCHEMA_MISMATCH",
        message: "Incompatible schema version",
      });

      expect(errors).toEqual([
        { code: "SCHEMA_MISMATCH", message: "Incompatible schema version" },
      ]);
    });
  });

  describe("cleanup", () => {
    it("destroy clears all handlers and disconnects", () => {
      const { transport, client } = createClientAndTransport();
      connectClient(transport, client);

      const stateHandler = vi.fn<(state: DocumentState) => void>();
      const errorHandler =
        vi.fn<(err: { code: string; message: string }) => void>();
      client.on("stateChange", stateHandler);
      client.on("error", errorHandler);

      // Record call count before destroy
      const callsBefore = stateHandler.mock.calls.length;

      client.destroy();
      expect(client.status).toBe("disconnected");

      // Delivering messages after destroy should not call any handler
      transport.deliver({
        type: "patch",
        serverClock: 1,
        diff: { nodes: { n1: { op: "remove" } } },
      });
      transport.deliver({
        type: "error",
        code: "TEST",
        message: "should be ignored",
      });

      expect(stateHandler.mock.calls.length).toBe(callsBefore);
      expect(errorHandler).not.toHaveBeenCalled();
    });
  });
});
