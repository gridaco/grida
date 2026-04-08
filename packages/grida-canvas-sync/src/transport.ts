/**
 * @module transport
 *
 * Transport abstraction for the sync protocol.
 *
 * `SyncClient` depends on `ISyncTransport`, not on WebSocket directly.
 * This allows unit testing with `MockTransport` and future transport
 * swaps (SharedWorker, WebRTC, etc.) without changing the client.
 */

import type { ClientMessage, ServerMessage } from "./protocol";

// ---------------------------------------------------------------------------
// Transport interface
// ---------------------------------------------------------------------------

export type TransportStatus = "disconnected" | "connecting" | "connected";

export interface ISyncTransport {
  /** Current connection status. */
  readonly status: TransportStatus;

  /** Send a message to the server. Throws if not connected. */
  send(message: ClientMessage): void;

  /** Register a handler for incoming server messages. Returns unsubscribe fn. */
  onMessage(handler: (message: ServerMessage) => void): () => void;

  /** Register a handler for status changes. Returns unsubscribe fn. */
  onStatusChange(handler: (status: TransportStatus) => void): () => void;

  /** Open the connection. */
  connect(): void;

  /** Close the connection. */
  disconnect(): void;
}

// ---------------------------------------------------------------------------
// WebSocket transport
// ---------------------------------------------------------------------------

export interface WebSocketTransportOptions {
  /** Full WebSocket URL (e.g. "wss://live.grida.co/room/abc"). */
  readonly url: string;
  /** Reconnect delay in ms after an unexpected close. Default: 1000. */
  readonly reconnectDelay?: number;
  /** Max reconnect attempts. Default: Infinity. */
  readonly maxReconnectAttempts?: number;
}

export class WebSocketTransport implements ISyncTransport {
  private _status: TransportStatus = "disconnected";
  private _ws: WebSocket | null = null;
  private _messageHandlers = new Set<(msg: ServerMessage) => void>();
  private _statusHandlers = new Set<(status: TransportStatus) => void>();
  private _reconnectAttempts = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _intentionalClose = false;

  private readonly _url: string;
  private readonly _reconnectDelay: number;
  private readonly _maxReconnectAttempts: number;

  constructor(options: WebSocketTransportOptions) {
    this._url = options.url;
    this._reconnectDelay = options.reconnectDelay ?? 1000;
    this._maxReconnectAttempts = options.maxReconnectAttempts ?? Infinity;
  }

  get status(): TransportStatus {
    return this._status;
  }

  send(message: ClientMessage): void {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocketTransport: not connected");
    }
    this._ws.send(JSON.stringify(message));
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
    if (this._status !== "disconnected") return;
    this._intentionalClose = false;
    this._openSocket();
  }

  disconnect(): void {
    this._intentionalClose = true;
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._setStatus("disconnected");
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private _openSocket(): void {
    this._setStatus("connecting");
    const ws = new WebSocket(this._url);

    ws.onopen = () => {
      this._reconnectAttempts = 0;
      this._setStatus("connected");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        for (const handler of this._messageHandlers) {
          handler(msg);
        }
      } catch {
        // Malformed message — ignore
      }
    };

    ws.onclose = () => {
      this._ws = null;
      this._setStatus("disconnected");
      if (!this._intentionalClose) {
        this._scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onerror is always followed by onclose in browsers
    };

    this._ws = ws;
  }

  private _scheduleReconnect(): void {
    if (this._reconnectAttempts >= this._maxReconnectAttempts) return;
    this._reconnectAttempts++;
    const delay = this._reconnectDelay * Math.min(this._reconnectAttempts, 10);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._openSocket();
    }, delay);
  }

  private _setStatus(status: TransportStatus): void {
    if (this._status === status) return;
    this._status = status;
    for (const handler of this._statusHandlers) {
      handler(status);
    }
  }
}
