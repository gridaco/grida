/**
 * @module client
 *
 * `SyncClient` — the client-side sync engine.
 *
 * Maintains three layers of state:
 *   canonical  — last server-confirmed state
 *   speculative — diffs that have been pushed but not yet ack'd
 *   unsent     — local changes not yet pushed
 *
 * The "local state" that the editor renders is:
 *   apply(canonical, compose(...speculative, unsent))
 *
 * On server ack/patch, the client rebases: undo speculative, apply server
 * truth, re-apply remaining speculative + unsent.
 */

import type {
  DocumentDiff,
  PresenceState,
  ServerMessage,
  ClientMessage,
  ConnectOkMessage,
  PushOkMessage,
  PatchMessage,
  NodeId,
  SerializedNode,
} from "./protocol";
import {
  type DocumentState,
  applyDiff,
  composeDiffs,
  isDiffEmpty,
} from "./diff";
import type { ISyncTransport, TransportStatus } from "./transport";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncClientOptions {
  /** Schema version for the connect handshake. */
  readonly schema: string;
  /** Transport to use for sending/receiving messages. */
  readonly transport: ISyncTransport;
  /** Initial document state (from OPFS cache or empty). */
  readonly initialState: DocumentState;
  /** Last known server clock (from OPFS sync-state.json). 0 for fresh. */
  readonly lastClock?: number;
  /**
   * Push debounce interval in ms. Default: 50.
   * Set to a negative value (e.g. -1) for synchronous flush (useful for tests).
   */
  readonly pushInterval?: number;
}

export type SyncClientStatus =
  | "disconnected"
  | "connecting"
  | "syncing" // connect handshake sent, waiting for connect_ok
  | "ready"; // connected and in sync

export type SyncClientEventMap = {
  /** Fired when the merged local state changes (canonical + speculative + unsent). */
  stateChange: DocumentState;
  /** Fired on presence updates from peers. */
  presenceChange: Record<string, PresenceState>;
  /** Fired on status changes. */
  statusChange: SyncClientStatus;
  /** Fired on server errors. */
  error: { code: string; message: string };
};

type EventHandler<K extends keyof SyncClientEventMap> = (
  data: SyncClientEventMap[K]
) => void;

// ---------------------------------------------------------------------------
// SyncClient
// ---------------------------------------------------------------------------

export class SyncClient {
  // -- State layers --
  private _canonical: DocumentState;
  private _speculative: DocumentDiff[] = [];
  private _unsent: DocumentDiff = {};
  private _localState: DocumentState;

  // -- Clock --
  private _serverClock: number;
  private _clientClock: number = 0;

  // -- Transport --
  private readonly _transport: ISyncTransport;
  private readonly _schema: string;
  private readonly _pushInterval: number;

  // -- Push scheduling --
  private _pushTimer: ReturnType<typeof setTimeout> | null = null;
  private _pushInFlight = false;

  // -- Status --
  private _status: SyncClientStatus = "disconnected";

  // -- Event handlers --
  private _handlers: {
    [K in keyof SyncClientEventMap]: Set<EventHandler<K>>;
  } = {
    stateChange: new Set(),
    presenceChange: new Set(),
    statusChange: new Set(),
    error: new Set(),
  };

  // -- Cleanup --
  private _unsubscribeMessage: (() => void) | null = null;
  private _unsubscribeStatus: (() => void) | null = null;

  constructor(options: SyncClientOptions) {
    this._canonical = options.initialState;
    this._localState = options.initialState;
    this._serverClock = options.lastClock ?? 0;
    this._schema = options.schema;
    this._transport = options.transport;
    this._pushInterval = options.pushInterval ?? 50;

    // Wire up transport
    this._unsubscribeMessage = this._transport.onMessage(
      this._handleServerMessage.bind(this)
    );
    this._unsubscribeStatus = this._transport.onStatusChange(
      this._handleTransportStatus.bind(this)
    );
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Current sync status. */
  get status(): SyncClientStatus {
    return this._status;
  }

  /** Last known server clock. */
  get serverClock(): number {
    return this._serverClock;
  }

  /** The merged local state (what the editor should render). */
  get state(): DocumentState {
    return this._localState;
  }

  /** The canonical (server-confirmed) state. */
  get canonical(): DocumentState {
    return this._canonical;
  }

  /** Whether there are unsent or unacknowledged changes. */
  get isDirty(): boolean {
    return this._speculative.length > 0 || !isDiffEmpty(this._unsent);
  }

  /** Subscribe to events. Returns an unsubscribe function. */
  on<K extends keyof SyncClientEventMap>(
    event: K,
    handler: EventHandler<K>
  ): () => void {
    (this._handlers[event] as Set<EventHandler<K>>).add(handler);
    return () =>
      (this._handlers[event] as Set<EventHandler<K>>).delete(handler);
  }

  /**
   * Push a local diff. This is the primary mutation API.
   * The diff is applied optimistically and scheduled for push to server.
   */
  pushDiff(diff: DocumentDiff): void {
    if (isDiffEmpty(diff)) return;

    // Compose into unsent buffer
    this._unsent = composeDiffs(this._unsent, diff);

    // Recompute local state
    this._recomputeLocalState();

    // Schedule a push
    this._schedulePush();
  }

  /** Update local presence (sent with the next push or immediately). */
  setPresence(presence: PresenceState): void {
    if (this._status === "ready") {
      this._transport.send({
        type: "presence_update",
        presence,
      });
    }
  }

  /** Connect to the server. */
  connect(): void {
    this._transport.connect();
  }

  /** Disconnect from the server. */
  disconnect(): void {
    if (this._pushTimer !== null) {
      clearTimeout(this._pushTimer);
      this._pushTimer = null;
    }
    this._transport.disconnect();
  }

  /** Tear down all subscriptions. Call this when done. */
  destroy(): void {
    this.disconnect();
    this._unsubscribeMessage?.();
    this._unsubscribeStatus?.();
    this._unsubscribeMessage = null;
    this._unsubscribeStatus = null;
    for (const set of Object.values(this._handlers)) {
      set.clear();
    }
  }

  // -------------------------------------------------------------------------
  // Server message handling
  // -------------------------------------------------------------------------

  private _handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case "connect_ok":
        this._handleConnectOk(msg);
        break;
      case "push_ok":
        this._handlePushOk(msg);
        break;
      case "patch":
        this._handlePatch(msg);
        break;
      case "presence":
        this._emit("presenceChange", { ...msg.peers });
        break;
      case "pong":
        // Heartbeat response — no action needed
        break;
      case "error":
        this._emit("error", { code: msg.code, message: msg.message });
        break;
    }
  }

  private _handleConnectOk(msg: ConnectOkMessage): void {
    if (msg.state) {
      // Full state — server sent everything
      this._canonical = {
        nodes: msg.state as Record<NodeId, SerializedNode>,
        scenes: msg.scenes ?? [],
      };
    } else if (msg.diff) {
      // Incremental — apply catch-up diff
      this._canonical = applyDiff(this._canonical, msg.diff);
      if (msg.scenes) {
        this._canonical = { ...this._canonical, scenes: msg.scenes };
      }
    }

    this._serverClock = msg.clock;
    this._setStatus("ready");
    this._recomputeLocalState();

    // If we have unsent changes from before reconnect, push them
    if (!isDiffEmpty(this._unsent)) {
      this._schedulePush();
    }
  }

  private _handlePushOk(msg: PushOkMessage): void {
    // Find and remove the acknowledged speculative diff
    // Speculative diffs are in push order; the first one matches the ack
    if (this._speculative.length === 0) return;

    switch (msg.result) {
      case "commit":
        // Server accepted our diff as-is — apply to canonical
        this._canonical = applyDiff(this._canonical, this._speculative[0]);
        this._speculative.shift();
        break;
      case "rebase":
        // Server modified our diff — use server's version
        if (msg.diff) {
          this._canonical = applyDiff(this._canonical, msg.diff);
        }
        this._speculative.shift();
        break;
      case "discard":
        // Server rejected our diff — drop it
        this._speculative.shift();
        break;
    }

    this._serverClock = msg.serverClock;
    this._pushInFlight = false;
    this._recomputeLocalState();

    // If there's more to push, schedule it
    if (!isDiffEmpty(this._unsent) || this._speculative.length > 0) {
      this._schedulePush();
    }
  }

  private _handlePatch(msg: PatchMessage): void {
    // Another client's change, broadcast by the server
    this._canonical = applyDiff(this._canonical, msg.diff);
    this._serverClock = msg.serverClock;
    this._recomputeLocalState();
  }

  // -------------------------------------------------------------------------
  // Transport status handling
  // -------------------------------------------------------------------------

  private _handleTransportStatus(status: TransportStatus): void {
    switch (status) {
      case "connecting":
        this._setStatus("connecting");
        break;
      case "connected":
        // Send the connect handshake
        this._setStatus("syncing");
        this._transport.send({
          type: "connect",
          schema: this._schema,
          lastClock: this._serverClock,
        });
        break;
      case "disconnected":
        this._pushInFlight = false;
        this._setStatus("disconnected");
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Push scheduling
  // -------------------------------------------------------------------------

  private _schedulePush(): void {
    if (this._pushTimer !== null) return; // Already scheduled
    if (this._status !== "ready") return; // Not connected

    if (this._pushInterval < 0) {
      // Synchronous flush (test mode)
      this._flush();
    } else {
      this._pushTimer = setTimeout(() => {
        this._pushTimer = null;
        this._flush();
      }, this._pushInterval);
    }
  }

  private _flush(): void {
    if (this._status !== "ready") return;
    if (this._pushInFlight) return; // Wait for ack before sending another
    if (isDiffEmpty(this._unsent)) return; // Nothing to send

    const diff = this._unsent;
    this._unsent = {};
    this._speculative.push(diff);
    this._pushInFlight = true;

    const clientClock = ++this._clientClock;

    this._transport.send({
      type: "push",
      clientClock,
      diff,
    });
  }

  // -------------------------------------------------------------------------
  // State recomputation
  // -------------------------------------------------------------------------

  /**
   * Recompute localState from canonical + speculative + unsent.
   * Emits "stateChange" if the state actually changed.
   */
  private _recomputeLocalState(): void {
    let merged = this._canonical;

    for (const spec of this._speculative) {
      merged = applyDiff(merged, spec);
    }

    if (!isDiffEmpty(this._unsent)) {
      merged = applyDiff(merged, this._unsent);
    }

    // Ref check — if nothing changed, skip the event
    if (merged === this._localState) return;

    this._localState = merged;
    this._emit("stateChange", merged);
  }

  // -------------------------------------------------------------------------
  // Event emission
  // -------------------------------------------------------------------------

  private _emit<K extends keyof SyncClientEventMap>(
    event: K,
    data: SyncClientEventMap[K]
  ): void {
    for (const handler of this._handlers[event] as Set<EventHandler<K>>) {
      handler(data);
    }
  }

  private _setStatus(status: SyncClientStatus): void {
    if (this._status === status) return;
    this._status = status;
    this._emit("statusChange", status);
  }
}
