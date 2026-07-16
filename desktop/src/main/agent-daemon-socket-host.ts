/**
 * GRIDA-SEC-004 — main-owned daemon socket capability boundary.
 */
import net, { type Server, type Socket } from "node:net";
import type { ChildProcess } from "node:child_process";

const HOSTNAME = "127.0.0.1";
const MAX_PENDING_TRANSFERS = 64;

/**
 * Main-owned loopback listener for the socketless sidecar daemon.
 *
 * Each accepted socket is paused and transferred as an OS capability over the
 * per-spawn Node IPC descriptor. The sidecar can serve that already-connected
 * socket, but it receives no listener and no operation that can choose or open
 * a destination. This works across SRT's Linux network namespace and lets
 * macOS run with `allowLocalBinding: false`.
 */
export class AgentDaemonSocketHost {
  private server: Server | null = null;
  private portValue: number | null = null;
  private ready = false;
  private capabilityAttested = false;
  private closed = false;
  private readonly pending = new Set<Socket>();
  private capabilityReadyResolve: (() => void) | null = null;
  private capabilityReadyReject: ((error: Error) => void) | null = null;
  private readonly capabilityReady = new Promise<void>((resolve, reject) => {
    this.capabilityReadyResolve = resolve;
    this.capabilityReadyReject = reject;
  });

  private readonly onMessage = (message: unknown, handle: unknown) => {
    if (
      this.capabilityAttested ||
      handle !== undefined ||
      !isCapabilityReadyMessage(message)
    ) {
      this.onFatal(new Error("agent sidecar sent an unexpected IPC message"));
      return;
    }
    this.capabilityAttested = true;
    this.capabilityReadyResolve?.();
    this.capabilityReadyResolve = null;
    this.capabilityReadyReject = null;
  };

  private readonly onDisconnect = () => {
    if (!this.closed) {
      const error = new Error("agent sidecar capability channel disconnected");
      this.capabilityReadyReject?.(error);
      this.capabilityReadyResolve = null;
      this.capabilityReadyReject = null;
      this.onFatal(error);
    }
  };

  constructor(
    private readonly child: ChildProcess,
    private readonly onFatal: (error: Error) => void
  ) {
    // A disconnect/close may precede the supervisor awaiting the attestation;
    // attach a sink now while preserving rejection for later awaiters.
    void this.capabilityReady.catch(() => undefined);
    child.on("message", this.onMessage);
    child.once("disconnect", this.onDisconnect);
  }

  get port(): number {
    if (this.portValue === null) {
      throw new Error("agent daemon socket host port read before listen");
    }
    return this.portValue;
  }

  async listen(): Promise<number> {
    if (this.server) return this.port;
    if (!this.child.send || !this.child.connected) {
      throw new Error("agent sidecar capability channel is unavailable");
    }
    const server = net.createServer({ pauseOnConnect: true }, (socket) =>
      this.transfer(socket)
    );
    server.maxConnections = MAX_PENDING_TRANSFERS;
    await new Promise<void>((resolve, reject) => {
      let listening = false;
      const onError = (error: Error) => {
        if (listening) {
          if (!this.closed) this.onFatal(error);
          return;
        }
        server.off("error", onError);
        server.close();
        reject(error);
      };
      server.on("error", onError);
      server.listen(0, HOSTNAME, () => {
        listening = true;
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("agent daemon socket host did not bind a TCP port");
    }
    this.server = server;
    this.portValue = address.port;
    return address.port;
  }

  waitForCapabilityReady(): Promise<void> {
    return this.capabilityReady;
  }

  markReady(port: number): void {
    if (!this.capabilityAttested || port !== this.port || this.ready) {
      throw new Error("agent daemon ready port does not match its host grant");
    }
    this.ready = true;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    this.child.off("message", this.onMessage);
    this.child.off("disconnect", this.onDisconnect);
    this.capabilityReadyReject?.(
      new Error("agent daemon socket host closed before capability readiness")
    );
    this.capabilityReadyResolve = null;
    this.capabilityReadyReject = null;
    for (const socket of this.pending) socket.destroy();
    this.pending.clear();
    this.server?.close();
    this.server = null;
    this.portValue = null;
  }

  private transfer(socket: Socket): void {
    if (
      !this.ready ||
      this.closed ||
      !this.child.send ||
      !this.child.connected ||
      this.pending.size >= MAX_PENDING_TRANSFERS ||
      !isLoopbackPeer(socket.remoteAddress)
    ) {
      socket.destroy();
      return;
    }
    this.pending.add(socket);
    try {
      this.child.send(
        { v: 1, type: "daemon.connection" },
        socket,
        { keepOpen: false },
        (error) => {
          this.pending.delete(socket);
          if (!error) return;
          socket.destroy();
          if (!this.closed) this.onFatal(error);
        }
      );
    } catch (error) {
      this.pending.delete(socket);
      socket.destroy();
      if (!this.closed) {
        this.onFatal(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
}

function isLoopbackPeer(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1";
}

function isCapabilityReadyMessage(
  value: unknown
): value is Readonly<{ v: 1; type: "daemon.capability.ready" }> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    record.v === 1 &&
    record.type === "daemon.capability.ready"
  );
}
