/**
 * GRIDA-SEC-004 — socketless sidecar daemon capability consumer.
 */
import http, { type Server } from "node:http";
import { Socket } from "node:net";
import { getRequestListener } from "@hono/node-server";

const MAX_ACTIVE_CONNECTIONS = 64;

/**
 * Consumes only already-connected loopback sockets transferred by Electron
 * main. It has no listener, target field, bind, or connect operation.
 */
export class AgentSidecarDaemonSockets {
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  private closed = false;

  constructor(
    fetcher: (request: Request) => Promise<Response>,
    private readonly onFatal: (error: Error) => void
  ) {
    this.server = http.createServer(
      getRequestListener((request) => fetcher(request), {
        hostname: "127.0.0.1",
        autoCleanupIncoming: true,
      })
    );
    this.server.maxConnections = MAX_ACTIVE_CONNECTIONS;
  }

  accept(message: unknown, handle: unknown): void {
    if (!isConnectionMessage(message) || !(handle instanceof Socket)) {
      if (handle instanceof Socket) handle.destroy();
      this.onFatal(new Error("invalid agent daemon socket capability"));
      return;
    }
    // Capacity pressure can be caused by unauthenticated local clients. Drop
    // it as ordinary load; only malformed trusted-IPC input is fatal.
    if (this.closed || this.sockets.size >= MAX_ACTIVE_CONNECTIONS) {
      handle.destroy();
      return;
    }
    this.sockets.add(handle);
    handle.once("close", () => this.sockets.delete(handle));
    handle.once("error", () => undefined);
    // `pauseOnConnect` on the main-owned listener guarantees no request bytes
    // race ahead of the HTTP parser installation here.
    this.server.emit("connection", handle);
    handle.resume();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    this.server.closeAllConnections();
  }
}

function isConnectionMessage(
  value: unknown
): value is Readonly<{ v: 1; type: "daemon.connection" }> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    record.v === 1 &&
    record.type === "daemon.connection"
  );
}
