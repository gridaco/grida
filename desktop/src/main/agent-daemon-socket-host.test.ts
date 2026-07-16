import { EventEmitter, once } from "node:events";
import { fork, type ChildProcess } from "node:child_process";
import net, { Socket } from "node:net";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentDaemonSocketHost } from "./agent-daemon-socket-host";

const children = new Set<ChildProcess>();

afterEach(() => {
  for (const child of children) child.kill("SIGKILL");
  children.clear();
});

describe("AgentDaemonSocketHost", () => {
  it("cancels the owned listener when close races asynchronous listen", async () => {
    const child = fakeChild();
    const fatal = vi.fn<(error: Error) => void>();
    const host = new AgentDaemonSocketHost(child.value, fatal);
    const listening = host.listen();
    const rejection = listening.catch((error: unknown) => error);

    host.close();

    expect(await rejection).toEqual(
      expect.objectContaining({
        message: expect.stringMatching(/closed while listening/),
      })
    );
    expect(() => host.port).toThrow(/before listen/);
    expect(
      (host as unknown as { server: net.Server | null }).server
    ).toBeNull();
    expect(fatal).not.toHaveBeenCalled();
  });

  it("binds only loopback and drops connections before sidecar readiness", async () => {
    const child = fakeChild();
    const fatal = vi.fn<(error: Error) => void>();
    const host = new AgentDaemonSocketHost(child.value, fatal);
    const port = await host.listen();

    const socket = net.connect(port, "127.0.0.1");
    const closed = once(socket, "close");
    await closed;

    expect(child.send).not.toHaveBeenCalled();
    expect(fatal).not.toHaveBeenCalled();
    host.close();
  });

  it("transfers only the fixed connection capability after exact-port readiness", async () => {
    const child = fakeChild((message, handle, options, callback) => {
      expect(message).toEqual({ v: 1, type: "daemon.connection" });
      expect(handle).toBeInstanceOf(Socket);
      expect(options).toEqual({ keepOpen: false });
      handle.destroy();
      callback(null);
    });
    const fatal = vi.fn<(error: Error) => void>();
    const host = new AgentDaemonSocketHost(child.value, fatal);
    const port = await host.listen();
    expect(() => host.markReady(port)).toThrow(/does not match/);
    child.events.emit("message", { v: 1, type: "daemon.capability.ready" });
    await host.waitForCapabilityReady();
    expect(() => host.markReady(port + 1)).toThrow(/does not match/);
    host.markReady(port);

    const socket = net.connect(port, "127.0.0.1");
    const closed = once(socket, "close");
    await closed;

    expect(child.send).toHaveBeenCalledTimes(1);
    expect(fatal).not.toHaveBeenCalled();
    host.close();
  });

  it("treats sidecar messages and IPC disconnects as fatal", async () => {
    const child = fakeChild();
    const fatal = vi.fn<(error: Error) => void>();
    const host = new AgentDaemonSocketHost(child.value, fatal);
    await host.listen();

    child.events.emit("message", { type: "unexpected" });
    child.events.emit("disconnect");

    expect(fatal).toHaveBeenCalledTimes(2);
    expect(fatal.mock.calls[0][0].message).toMatch(/unexpected IPC/);
    expect(fatal.mock.calls[1][0].message).toMatch(/disconnected/);
    host.close();
  });

  it("routes post-listen server errors through the supervised fatal path", async () => {
    const child = fakeChild();
    const fatal = vi.fn<(error: Error) => void>();
    const host = new AgentDaemonSocketHost(child.value, fatal);
    await host.listen();

    (host as unknown as { server: net.Server }).server.emit(
      "error",
      new Error("late listener failure")
    );

    expect(fatal).toHaveBeenCalledWith(
      expect.objectContaining({ message: "late listener failure" })
    );
    host.close();
  });

  it("contains a synchronous IPC-close race and reports it as fatal", async () => {
    const child = fakeChild(() => {
      throw new Error("IPC channel is closed");
    });
    const fatal = vi.fn<(error: Error) => void>();
    const host = new AgentDaemonSocketHost(child.value, fatal);
    const port = await host.listen();
    child.events.emit("message", { v: 1, type: "daemon.capability.ready" });
    await host.waitForCapabilityReady();
    host.markReady(port);
    const socket = loopbackSocket();

    expect(() =>
      (host as unknown as { transfer(socket: Socket): void }).transfer(socket)
    ).not.toThrow();

    expect(socket.destroyed).toBe(true);
    expect(fatal).toHaveBeenCalledWith(
      expect.objectContaining({ message: "IPC channel is closed" })
    );
    host.close();
  });

  it("bounds pending transfers and destroys them on close", async () => {
    const child = fakeChild();
    const fatal = vi.fn<(error: Error) => void>();
    const host = new AgentDaemonSocketHost(child.value, fatal);
    const port = await host.listen();
    child.events.emit("message", { v: 1, type: "daemon.capability.ready" });
    await host.waitForCapabilityReady();
    host.markReady(port);
    const transfer = (
      host as unknown as { transfer(socket: Socket): void }
    ).transfer.bind(host);
    const pending: Socket[] = [];
    for (let index = 0; index < 64; index += 1) {
      const socket = loopbackSocket();
      pending.push(socket);
      transfer(socket);
    }
    const overflow = loopbackSocket();
    const overflowDestroy = vi.spyOn(overflow, "destroy");

    transfer(overflow);

    expect(child.send).toHaveBeenCalledTimes(64);
    expect(overflowDestroy).toHaveBeenCalledTimes(1);
    host.close();
    expect(pending.every((socket) => socket.destroyed)).toBe(true);
    expect(fatal).not.toHaveBeenCalled();
  });

  it("round-trips HTTP through a real child-process socket transfer", async () => {
    const child = fork(
      path.join(__dirname, "../test-fixtures/agent-daemon-socket-child.cjs"),
      [],
      { stdio: ["ignore", "ignore", "pipe", "ipc"] }
    );
    children.add(child);
    await once(child, "spawn");
    const fatal = vi.fn<(error: Error) => void>();
    const host = new AgentDaemonSocketHost(child, fatal);
    const port = await host.listen();
    const capabilityReady = host.waitForCapabilityReady();
    child.send({ type: "fixture.attest" });
    await capabilityReady;
    host.markReady(port);

    const response = await fetch(`http://127.0.0.1:${port}/health`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("socket-capability-ok");
    expect(fatal).not.toHaveBeenCalled();
    host.close();
    child.kill("SIGTERM");
    await once(child, "exit");
    children.delete(child);
  });
});

function fakeChild(
  implementation?: (
    message: unknown,
    handle: Socket,
    options: { keepOpen: boolean },
    callback: (error: Error | null) => void
  ) => void
): {
  value: ChildProcess;
  events: EventEmitter;
  send: ReturnType<typeof vi.fn>;
} {
  const events = new EventEmitter();
  const send = vi.fn<
    (
      message: unknown,
      handle: Socket,
      options: { keepOpen: boolean },
      callback: (error: Error | null) => void
    ) => void
  >(
    implementation ??
      (() => {
        // Deliberately retain the callback to model an in-flight transfer.
      })
  );
  Object.assign(events, { connected: true, send });
  return { value: events as unknown as ChildProcess, events, send };
}

function loopbackSocket(): Socket {
  const socket = new Socket();
  Object.defineProperty(socket, "remoteAddress", { value: "127.0.0.1" });
  return socket;
}
