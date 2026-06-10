/**
 * stdio wiring for the ACP adapter — the `grida-agent acp` runtime shape:
 * the editor (ACP client) launches this process and speaks
 * newline-delimited JSON-RPC over stdin/stdout (acp.md §what-acp-is).
 *
 * Node-only by nature (process streams); the adapter itself is
 * transport-only and lives in `adapter.ts`.
 */
import { Readable, Writable } from "node:stream";
import { AgentSideConnection, ndJsonStream } from "@agentclientprotocol/sdk";
import { AcpAgentAdapter, type AcpAgentAdapterOptions } from "./adapter";

export type AcpStdioHandle = {
  /** Settles when the peer closes stdin (the client hung up). */
  closed: Promise<void>;
};

export function runAcpStdio(
  options: AcpAgentAdapterOptions,
  io: { input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream } = {}
): AcpStdioHandle {
  const input = (io.input ?? process.stdin) as Readable;
  const output = (io.output ?? process.stdout) as Writable;
  const stream = ndJsonStream(
    Writable.toWeb(output) as WritableStream<Uint8Array>,
    Readable.toWeb(input) as ReadableStream<Uint8Array>
  );
  new AgentSideConnection(
    (connection) => new AcpAgentAdapter(connection, options),
    stream
  );
  const closed = new Promise<void>((resolve) => {
    input.once("end", resolve);
    input.once("close", resolve);
  });
  return { closed };
}
