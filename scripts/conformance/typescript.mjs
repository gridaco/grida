// Thin driver: no host imports, command dispatch, storage or network capability.
import { pathToFileURL } from "node:url";
import path from "node:path";
import { referenceRoot } from "./baseline.mjs";
const { Cli } = await import(
  pathToFileURL(path.join(referenceRoot, "packages/grida-cli/src/cli.ts")).href
);

const limit = 1024 * 1024;
const invalid = {
  error: { code: "invalid_request", message: "Invalid conformance request." },
};
const emit = (response) =>
  process.stdout.write(JSON.stringify(response) + "\n");

function respond(bytes) {
  if (bytes.at(-1) === 13) bytes = bytes.subarray(0, -1);
  if (bytes.length > limit) {
    emit(invalid);
    process.exitCode = 1;
    return false;
  }
  let response;
  try {
    const line = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const request = JSON.parse(line);
    if (
      !request ||
      Object.keys(request).join() !== "argv" ||
      !Array.isArray(request.argv) ||
      !request.argv.every((value) => typeof value === "string")
    )
      throw new Error("invalid request");
    try {
      response = { invocation: Cli.parse(request.argv) };
    } catch (error) {
      if (!(error instanceof Cli.Failure)) throw error;
      response = { error: { code: error.code, message: error.message } };
    }
  } catch {
    response = invalid;
  }
  emit(response);
  return true;
}

// JSONL is delimited by the LF byte. Unicode line/paragraph separators inside
// a valid JSON string must not be treated as record boundaries by readline.
async function main() {
  let pending = Buffer.alloc(0);
  for await (const chunk of process.stdin) {
    let start = 0;
    while (start < chunk.length) {
      const end = chunk.indexOf(10, start);
      const piece = chunk.subarray(start, end < 0 ? chunk.length : end);
      if (pending.length + piece.length > limit + 1) {
        emit(invalid);
        process.exitCode = 1;
        return;
      }
      pending = Buffer.concat([pending, piece]);
      if (end < 0) break;
      if (!respond(pending)) return;
      pending = Buffer.alloc(0);
      start = end + 1;
    }
  }
  if (pending.length) respond(pending);
}
await main();
