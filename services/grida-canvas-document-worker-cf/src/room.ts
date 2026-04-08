/**
 * @module room
 *
 * SyncRoom — the Cloudflare Durable Object that owns a single document.
 *
 * One SyncRoom instance per document/room. It:
 *   - Holds the canonical document state in memory
 *   - Processes client pushes (validate → apply → ack → broadcast)
 *   - Handles WebSocket lifecycle with hibernation support
 *   - Persists state to embedded SQLite via SyncStorage
 *   - Relays presence (volatile, not persisted)
 */

import type {
  ClientMessage,
  ServerMessage,
  DocumentDiff,
  PresenceState,
  NodeId,
  SerializedNode,
} from "@grida/canvas-sync";
import {
  DocumentClock,
  applyDiff,
  validateDiff,
  type DocumentState,
} from "@grida/canvas-sync";
import { SyncStorage } from "./storage";

// ---------------------------------------------------------------------------
// Session metadata (attached to WebSocket via tags)
// ---------------------------------------------------------------------------

const SESSION_TAG_PREFIX = "session:";

interface SessionState {
  schemaVersion?: string;
  presence?: PresenceState;
}

// ---------------------------------------------------------------------------
// G1DO — the Durable Object class
// ---------------------------------------------------------------------------

export class G1DO implements DurableObject {
  private readonly state: DurableObjectState;
  private storage!: SyncStorage;
  private clock!: DocumentClock;
  private canonical!: DocumentState;

  /** Per-session ephemeral state (keyed by session ID). */
  private sessions = new Map<string, SessionState>();

  private initialized = false;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
    // Block all requests until initialization is done
    this.state.blockConcurrencyWhile(async () => {
      this._initialize();
    });
  }

  private _initialize(): void {
    if (this.initialized) return;

    this.storage = new SyncStorage(this.state.storage.sql);
    const stored = this.storage.getFullState();

    this.canonical = {
      nodes: stored.nodes,
      scenes: stored.scenes,
    };
    this.clock = new DocumentClock(stored.clock);
    this.initialized = true;

    // Recover sessions from hibernated WebSockets
    for (const ws of this.state.getWebSockets()) {
      const tags = this.state.getTags(ws);
      const sessionTag = tags.find((t) => t.startsWith(SESSION_TAG_PREFIX));
      if (sessionTag) {
        const sessionId = sessionTag.slice(SESSION_TAG_PREFIX.length);
        if (!this.sessions.has(sessionId)) {
          this.sessions.set(sessionId, {});
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // HTTP handler (WebSocket upgrade)
  // -------------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    // WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      return this._handleWebSocketUpgrade(request);
    }

    return new Response("Expected WebSocket", { status: 426 });
  }

  private _handleWebSocketUpgrade(_request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Generate a unique session ID
    const sessionId = crypto.randomUUID();

    // Accept with hibernation support and tag with session ID
    this.state.acceptWebSocket(server, [SESSION_TAG_PREFIX + sessionId]);

    this.sessions.set(sessionId, {});

    return new Response(null, { status: 101, webSocket: client });
  }

  // -------------------------------------------------------------------------
  // Hibernatable WebSocket handlers
  // -------------------------------------------------------------------------

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer
  ): Promise<void> {
    if (typeof message !== "string") return;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(message) as ClientMessage;
    } catch {
      this._send(ws, {
        type: "error",
        code: "INVALID_JSON",
        message: "Could not parse message as JSON",
      });
      return;
    }

    const sessionId = this._getSessionId(ws);
    if (!sessionId) return;

    switch (msg.type) {
      case "connect":
        this._handleConnect(ws, sessionId, msg);
        break;
      case "push":
        this._handlePush(ws, sessionId, msg);
        break;
      case "ping":
        this._send(ws, { type: "pong" });
        break;
      case "presence_update":
        this._handlePresenceUpdate(sessionId, msg.presence);
        break;
    }
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    const sessionId = this._getSessionId(ws);
    if (sessionId) {
      this.sessions.delete(sessionId);
      // Broadcast updated presence (peer left)
      this._broadcastPresence();
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    const sessionId = this._getSessionId(ws);
    if (sessionId) {
      this.sessions.delete(sessionId);
    }
    ws.close(1011, "WebSocket error");
  }

  // -------------------------------------------------------------------------
  // Protocol handlers
  // -------------------------------------------------------------------------

  private _handleConnect(
    ws: WebSocket,
    sessionId: string,
    msg: { schema: string; lastClock: number }
  ): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.schemaVersion = msg.schema;
    }

    if (msg.lastClock === 0 || msg.lastClock < this.clock.value) {
      // Client needs a full state or delta
      const delta =
        msg.lastClock > 0 ? this.storage.getDelta(msg.lastClock) : null;

      if (delta && msg.lastClock > 0) {
        // Incremental catch-up
        this._send(ws, {
          type: "connect_ok",
          clock: this.clock.value,
          diff: delta,
          scenes: this.canonical.scenes,
        });
      } else {
        // Full state
        this._send(ws, {
          type: "connect_ok",
          clock: this.clock.value,
          state: this.canonical.nodes,
          scenes: this.canonical.scenes,
        });
      }
    } else {
      // Client is up to date
      this._send(ws, {
        type: "connect_ok",
        clock: this.clock.value,
      });
    }
  }

  private _handlePush(
    ws: WebSocket,
    sessionId: string,
    msg: { clientClock: number; diff: DocumentDiff; presence?: PresenceState }
  ): void {
    // Validate the diff
    const validation = validateDiff(this.canonical, msg.diff);

    if (!validation.valid) {
      this._send(ws, {
        type: "push_ok",
        serverClock: this.clock.value,
        clientClock: msg.clientClock,
        result: "discard",
      });
      return;
    }

    // Apply the diff
    const newClock = this.clock.tick();
    this.canonical = applyDiff(this.canonical, msg.diff);

    // Persist to SQLite
    this.storage.applyDiff(msg.diff, newClock);

    // Ack the pusher
    this._send(ws, {
      type: "push_ok",
      serverClock: newClock,
      clientClock: msg.clientClock,
      result: "commit",
    });

    // Broadcast to all other sessions
    this._broadcastExcept(sessionId, {
      type: "patch",
      serverClock: newClock,
      diff: msg.diff,
    });

    // Handle presence piggy-backed on push
    if (msg.presence) {
      this._handlePresenceUpdate(sessionId, msg.presence);
    }
  }

  private _handlePresenceUpdate(
    sessionId: string,
    presence: PresenceState
  ): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.presence = presence;
    }
    this._broadcastPresence();
  }

  // -------------------------------------------------------------------------
  // Broadcasting
  // -------------------------------------------------------------------------

  /** Send a message to all connected WebSockets except the given session. */
  private _broadcastExcept(excludeSessionId: string, msg: ServerMessage): void {
    const payload = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      const sid = this._getSessionId(ws);
      if (sid && sid !== excludeSessionId) {
        try {
          ws.send(payload);
        } catch {
          // WebSocket may have closed between getWebSockets() and send()
        }
      }
    }
  }

  /** Broadcast current presence state to all sessions. */
  private _broadcastPresence(): void {
    // Build per-session presence views (each session gets everyone else's presence)
    const allPresence: Record<string, PresenceState> = {};
    for (const [sid, session] of this.sessions) {
      if (session.presence) {
        allPresence[sid] = session.presence;
      }
    }

    for (const ws of this.state.getWebSockets()) {
      const sid = this._getSessionId(ws);
      if (!sid) continue;

      // Build peers map excluding self
      const peers: Record<string, PresenceState> = {};
      for (const [peerId, presence] of Object.entries(allPresence)) {
        if (peerId !== sid) {
          peers[peerId] = presence;
        }
      }

      // Only send if there are peers with presence
      if (Object.keys(peers).length > 0) {
        try {
          ws.send(JSON.stringify({ type: "presence", peers }));
        } catch {
          // WebSocket may have closed
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Extract the session ID from a WebSocket's tags. */
  private _getSessionId(ws: WebSocket): string | null {
    const tags = this.state.getTags(ws);
    const tag = tags.find((t) => t.startsWith(SESSION_TAG_PREFIX));
    return tag ? tag.slice(SESSION_TAG_PREFIX.length) : null;
  }

  /** Send a typed message to a WebSocket. */
  private _send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // WebSocket may have closed
    }
  }
}
