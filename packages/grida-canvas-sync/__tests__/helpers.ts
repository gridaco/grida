/**
 * Test harness: MockTransport + MockServer for multi-client integration tests.
 *
 * MockServer simulates the SyncRoom (Durable Object) behavior:
 *   - Maintains canonical state
 *   - Processes pushes (validate → apply → ack + broadcast)
 *   - Handles connect handshakes
 *   - Relays presence
 *
 * MockTransport is a synchronous in-memory transport that delivers messages
 * immediately (no async, no timers), making tests deterministic.
 */

import type {
  ClientMessage,
  ServerMessage,
  DocumentDiff,
  NodeId,
  SerializedNode,
  PushMessage,
  ConnectMessage,
  PresenceState,
} from "../src/protocol";
import { type DocumentState, applyDiff, isDiffEmpty } from "../src/diff";
import { validateDiff } from "../src/validate";
import { DocumentClock } from "../src/clock";
import { SyncClient } from "../src/client";
import type { ISyncTransport, TransportStatus } from "../src/transport";

// ---------------------------------------------------------------------------
// MockTransport — synchronous, deterministic
// ---------------------------------------------------------------------------

export class MockTransport implements ISyncTransport {
  status: TransportStatus = "disconnected";
  sent: ClientMessage[] = [];

  private _messageHandlers = new Set<(msg: ServerMessage) => void>();
  private _statusHandlers = new Set<(status: TransportStatus) => void>();

  /** Callback wired by MockServer to receive client messages. */
  _onClientMessage: ((msg: ClientMessage) => void) | null = null;

  send(message: ClientMessage): void {
    this.sent.push(message);
    // Deliver to server immediately (synchronous)
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

  connect(): void {
    // no-op — MockServer controls status via simulateConnected()
  }

  disconnect(): void {
    this._setStatus("disconnected");
  }

  // --- Test helpers ---

  simulateConnected(): void {
    this._setStatus("connected");
  }

  simulateDisconnected(): void {
    this._setStatus("disconnected");
  }

  /** Deliver a server message to the client. */
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
// MockServer — simulates SyncRoom behavior
// ---------------------------------------------------------------------------

interface MockSession {
  id: string;
  transport: MockTransport;
  presence?: PresenceState;
}

export class MockServer {
  canonical: DocumentState;
  clock: DocumentClock;
  private sessions: Map<string, MockSession> = new Map();

  constructor(initialState: DocumentState = { nodes: {}, scenes: [] }) {
    this.canonical = initialState;
    this.clock = new DocumentClock(0);
  }

  /** Register a client transport with this server. Returns the session id. */
  addSession(sessionId: string, transport: MockTransport): void {
    const session: MockSession = { id: sessionId, transport };
    this.sessions.set(sessionId, session);

    // Wire the transport to deliver messages to our handler
    transport._onClientMessage = (msg) =>
      this._handleClientMessage(sessionId, msg);
  }

  /** Simulate the client connecting (transport goes connected → client sends connect → server replies). */
  connectSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    session.transport.simulateConnected();
  }

  /** Disconnect a session. */
  disconnectSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.transport.simulateDisconnected();
  }

  /** Process all pending work (for tests that use pushInterval > 0). */
  // In our tests, pushInterval=0 and delivery is synchronous, so this is usually not needed.

  // -------------------------------------------------------------------------
  // Message handling — mirrors SyncRoom logic
  // -------------------------------------------------------------------------

  private _handleClientMessage(sessionId: string, msg: ClientMessage): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    switch (msg.type) {
      case "connect":
        this._handleConnect(session, msg);
        break;
      case "push":
        this._handlePush(session, msg);
        break;
      case "ping":
        session.transport.deliver({ type: "pong" });
        break;
      case "presence_update":
        this._handlePresenceUpdate(session, msg.presence);
        break;
    }
  }

  private _handleConnect(session: MockSession, msg: ConnectMessage): void {
    if (msg.lastClock === 0 || msg.lastClock < this.clock.value) {
      // Send full state
      session.transport.deliver({
        type: "connect_ok",
        clock: this.clock.value,
        state: this.canonical.nodes,
        scenes: this.canonical.scenes,
      });
    } else {
      // Client is up to date
      session.transport.deliver({
        type: "connect_ok",
        clock: this.clock.value,
      });
    }
  }

  private _handlePush(session: MockSession, msg: PushMessage): void {
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

    // Apply the diff to canonical
    const newClock = this.clock.tick();
    this.canonical = applyDiff(this.canonical, msg.diff);

    // Ack the pusher
    session.transport.deliver({
      type: "push_ok",
      serverClock: newClock,
      clientClock: msg.clientClock,
      result: "commit",
    });

    // Broadcast to all OTHER sessions
    for (const [id, other] of this.sessions) {
      if (id === session.id) continue;
      if (other.transport.status !== "connected") continue;
      other.transport.deliver({
        type: "patch",
        serverClock: newClock,
        diff: msg.diff,
      });
    }

    // Handle presence piggy-backed on push
    if (msg.presence) {
      this._handlePresenceUpdate(session, msg.presence);
    }
  }

  private _handlePresenceUpdate(
    session: MockSession,
    presence: PresenceState
  ): void {
    session.presence = presence;
    // Broadcast presence to all OTHER sessions
    const peers: Record<string, PresenceState> = {};
    for (const [id, s] of this.sessions) {
      if (id === session.id) continue;
      if (s.presence) peers[id] = s.presence;
    }
    // Also include the sender's presence for others
    for (const [id, other] of this.sessions) {
      if (id === session.id) continue;
      if (other.transport.status !== "connected") continue;
      other.transport.deliver({
        type: "presence",
        peers: { ...peers, [session.id]: presence },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

export function makeNode(
  id: string,
  props: Record<string, unknown> = {},
  type: string = "rectangle"
): SerializedNode {
  return { type, id, ...props } as SerializedNode;
}

export function emptyState(): DocumentState {
  return { nodes: {}, scenes: [] };
}

/**
 * Create a full test setup: server + N clients, all connected.
 */
export function createRoom(
  clientCount: number,
  initialState: DocumentState = emptyState()
): {
  server: MockServer;
  clients: SyncClient[];
  transports: MockTransport[];
} {
  const server = new MockServer(initialState);
  const clients: SyncClient[] = [];
  const transports: MockTransport[] = [];

  for (let i = 0; i < clientCount; i++) {
    const transport = new MockTransport();
    const client = new SyncClient({
      schema: "0.91.0-test",
      transport,
      initialState,
      lastClock: 0,
      pushInterval: -1, // Synchronous flush for deterministic tests
    });

    server.addSession(`client-${i}`, transport);
    clients.push(client);
    transports.push(transport);
  }

  return { server, clients, transports };
}

/** Connect all clients in a room (handshake completes synchronously). */
export function connectAll(
  server: MockServer,
  transports: MockTransport[]
): void {
  for (let i = 0; i < transports.length; i++) {
    server.connectSession(`client-${i}`);
  }
}

/**
 * Assert that all clients and the server have converged to the same state.
 */
export function assertConvergence(
  server: MockServer,
  clients: SyncClient[]
): void {
  for (let i = 0; i < clients.length; i++) {
    const clientNodes = clients[i].state.nodes;
    const serverNodes = server.canonical.nodes;

    // Same set of node IDs
    const clientIds = Object.keys(clientNodes).sort();
    const serverIds = Object.keys(serverNodes).sort();
    if (clientIds.join(",") !== serverIds.join(",")) {
      throw new Error(
        `Client ${i} node IDs [${clientIds}] !== server [${serverIds}]`
      );
    }

    // Same field values for each node
    for (const id of serverIds) {
      const sNode = serverNodes[id];
      const cNode = clientNodes[id];
      for (const key of Object.keys(sNode)) {
        const sv = JSON.stringify(sNode[key]);
        const cv = JSON.stringify(cNode[key]);
        if (sv !== cv) {
          throw new Error(
            `Client ${i} node "${id}" field "${key}": ${cv} !== server ${sv}`
          );
        }
      }
    }

    // Same scenes
    const clientScenes = clients[i].state.scenes.join(",");
    const serverScenes = server.canonical.scenes.join(",");
    if (clientScenes !== serverScenes) {
      throw new Error(
        `Client ${i} scenes [${clientScenes}] !== server [${serverScenes}]`
      );
    }
  }
}
