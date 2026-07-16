import { once } from "node:events";
import net, { Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentSidecarDaemonSockets } from "./agent-sidecar-daemon-sockets";

const servers = new Set<net.Server>();

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve()))
    )
  );
  servers.clear();
});

describe("AgentSidecarDaemonSockets", () => {
  it("serves HTTP on an accepted socket without owning a listener", async () => {
    const fatal = vi.fn<(error: Error) => void>();
    const sockets = new AgentSidecarDaemonSockets(
      async (request) => new Response(new URL(request.url).pathname),
      fatal
    );
    const pair = await socketPair();
    sockets.accept({ v: 1, type: "daemon.connection" }, pair.accepted);

    pair.client.write(
      "GET /socketless HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"
    );
    let response = "";
    pair.client.setEncoding("utf8");
    pair.client.on("data", (chunk) => (response += chunk));
    await once(pair.client, "close");

    expect(response).toContain("200 OK");
    expect(response).toContain("/socketless");
    expect(fatal).not.toHaveBeenCalled();
    sockets.close();
  });

  it("rejects malformed capabilities as fatal", () => {
    const fatal = vi.fn<(error: Error) => void>();
    const sockets = new AgentSidecarDaemonSockets(
      async () => new Response(null),
      fatal
    );
    const handle = new Socket();
    const destroy = vi.spyOn(handle, "destroy");

    sockets.accept({ v: 1, type: "other" }, handle);

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(fatal).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/invalid/) })
    );
    sockets.close();
  });

  it("drops capacity overflow without converting local load into a fatal", () => {
    const fatal = vi.fn<(error: Error) => void>();
    const sockets = new AgentSidecarDaemonSockets(
      async () => new Response(null),
      fatal
    );
    const active = (sockets as unknown as { sockets: Set<Socket> }).sockets;
    for (let index = 0; index < 64; index += 1) active.add(new Socket());
    const overflow = new Socket();
    const destroy = vi.spyOn(overflow, "destroy");

    sockets.accept({ v: 1, type: "daemon.connection" }, overflow);

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(fatal).not.toHaveBeenCalled();
    sockets.close();
  });

  it("destroys active transferred sockets on close", async () => {
    const sockets = new AgentSidecarDaemonSockets(
      async () => new Response(null),
      vi.fn<(error: Error) => void>()
    );
    const pair = await socketPair();
    sockets.accept({ v: 1, type: "daemon.connection" }, pair.accepted);
    const closed = once(pair.client, "close");

    sockets.close();

    await closed;
    expect(pair.accepted.destroyed).toBe(true);
  });
});

async function socketPair(): Promise<{
  client: Socket;
  accepted: Socket;
}> {
  const server = net.createServer({ pauseOnConnect: true });
  servers.add(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test server did not bind");
  }
  const accepted = new Promise<Socket>((resolve) =>
    server.once("connection", resolve)
  );
  const client = net.connect(address.port, "127.0.0.1");
  await once(client, "connect");
  return { client, accepted: await accepted };
}
