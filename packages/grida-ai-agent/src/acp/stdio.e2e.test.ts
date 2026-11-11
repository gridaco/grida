/**
 * A separate process hosts the retained HTTP adapter and handles initialize,
 * session/new, and session/load over newline-delimited JSON-RPC.
 * These requests use the real session store without invoking a model.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

type RpcMessage = {
  id?: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
};

class AcpProcess {
  private buffer = "";
  private readonly messages: RpcMessage[] = [];
  private waiters: Array<() => void> = [];
  readonly child: ChildProcess;
  readonly stderr: string[] = [];

  constructor(stateDir: string) {
    this.child = spawn(
      process.execPath,
      ["--import", "tsx", "src/testing/acp-stdio-host.ts", stateDir],
      {
        cwd: path.resolve(__dirname, "..", ".."),
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    this.child.stdout!.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      let nl: number;
      while ((nl = this.buffer.indexOf("\n")) !== -1) {
        const line = this.buffer.slice(0, nl).trim();
        this.buffer = this.buffer.slice(nl + 1);
        if (!line) continue;
        this.messages.push(JSON.parse(line) as RpcMessage);
      }
      this.waiters.splice(0).forEach((w) => w());
    });
    this.child.stderr!.on("data", (d: Buffer) =>
      this.stderr.push(d.toString())
    );
  }

  send(message: Record<string, unknown>): void {
    this.child.stdin!.write(`${JSON.stringify(message)}\n`);
  }

  async response(id: number, timeoutMs = 30_000): Promise<RpcMessage> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.messages.find((m) => m.id === id);
      if (found) return found;
      if (
        this.child.exitCode !== null ||
        this.child.signalCode !== null ||
        Date.now() > deadline
      ) {
        throw new Error(
          `no response for id=${id}; stderr:\n${this.stderr.join("")}`
        );
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 250);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  async close(): Promise<unknown[]> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      return [this.child.exitCode, this.child.signalCode];
    }
    const exited = once(this.child, "exit");
    const timeout = setTimeout(() => this.child.kill("SIGKILL"), 5_000);
    try {
      this.child.stdin!.end();
      return await exited;
    } finally {
      clearTimeout(timeout);
    }
  }
}

describe("HTTP adapter over a real ACP stdio process", () => {
  let stateDir: string;
  let acp: AcpProcess | null = null;

  beforeEach(async () => {
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-acp-e2e-"));
  });

  afterEach(async () => {
    await acp?.close();
    acp = null;
    await fs.rm(stateDir, { recursive: true, force: true });
  });

  it(
    "initialize → session/new → session/load over stdio",
    { timeout: 60_000 },
    async () => {
      acp = new AcpProcess(stateDir);

      acp.send({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: { protocolVersion: 1, clientCapabilities: {} },
      });
      const init = await acp.response(0);
      expect(init.error).toBeUndefined();
      expect(init.result).toMatchObject({
        protocolVersion: 1,
        agentInfo: { name: "grida-agent" },
      });
      expect(
        (init.result as { agentCapabilities: { loadSession: boolean } })
          .agentCapabilities.loadSession
      ).toBe(true);

      acp.send({
        jsonrpc: "2.0",
        id: 1,
        method: "session/new",
        params: { cwd: stateDir, mcpServers: [] },
      });
      const created = await acp.response(1);
      expect(created.error).toBeUndefined();
      const sessionId = (created.result as { sessionId: string }).sessionId;
      expect(typeof sessionId).toBe("string");
      expect(sessionId.length).toBeGreaterThan(0);

      acp.send({
        jsonrpc: "2.0",
        id: 2,
        method: "session/load",
        params: { sessionId, cwd: stateDir, mcpServers: [] },
      });
      const loaded = await acp.response(2);
      expect(loaded.error).toBeUndefined();
      expect(acp.child.exitCode).toBeNull();
      expect(acp.child.signalCode).toBeNull();
      expect(await acp.close()).toEqual([0, null]);
    }
  );
});
