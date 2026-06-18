/**
 * Runnable harness for the agent-provider class (issue #813), ACP path.
 *
 *   node --import tsx src/agent-provider/consume.bin.ts "<prompt>"
 *
 * Drives Claude via @agentclientprotocol/claude-agent-acp on the user's own
 * subscription and prints the streamed `ProviderChunk`s. Desktop / local only.
 */
import { openProvider } from "./index";
import type { ProviderChunk } from "./types";

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function printChunk(c: ProviderChunk): void {
  switch (c.type) {
    case "text":
      process.stdout.write(c.text);
      break;
    case "reasoning":
      process.stderr.write(`${DIM}${c.text}${RESET}`);
      break;
    case "tool":
      process.stderr.write(
        `\n${DIM}[tool ${c.status}] ${c.name}${c.detail ? `: ${c.detail}` : ""}${RESET}\n`
      );
      break;
    case "error":
      process.stderr.write(`\n[error] ${c.message}\n`);
      break;
  }
}

async function main(): Promise<void> {
  const prompt = process.argv.slice(2).join(" ").trim();
  if (!prompt) {
    process.stderr.write('usage: consume "<prompt>"\n');
    process.exit(2);
  }

  process.stderr.write("[grida] opening claude (ACP) provider…\n");
  const session = await openProvider("claude", { cwd: process.cwd() });
  process.stderr.write(
    `[grida] session ready: ${JSON.stringify(session.info)}\n\n`
  );

  try {
    const t0 = process.hrtime.bigint();
    const result = await session.prompt(prompt, printChunk);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;

    process.stdout.write("\n");
    process.stderr.write(
      `\n[grida] turn done: stopReason=${result.stopReason} sessionId=${result.providerSessionId} (${ms.toFixed(0)}ms)\n`
    );
  } finally {
    await session.dispose();
  }
  process.exit(0);
}

void main().catch((err: unknown) => {
  process.stderr.write(
    `\n[fatal] ${err instanceof Error ? err.stack : String(err)}\n`
  );
  process.exit(1);
});
