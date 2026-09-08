// GRIDA-SEC-014 — bounded hidden terminal input; no key echo or history.
import type { ReadStream, WriteStream } from "node:tty";
import { Cli } from "./cli";
import { ProviderCredentials } from "./provider-credentials";

export namespace ProviderPrompt {
  /** Host-only TTY capabilities, kept separate from pipe-based automation. */
  export type Input = Pick<
    ReadStream,
    | "isTTY"
    | "isRaw"
    | "setRawMode"
    | "on"
    | "removeListener"
    | "resume"
    | "pause"
  >;
  export type Output = Pick<WriteStream, "isTTY" | "write">;

  export function read(
    input: Input,
    output: Output,
    signal: AbortSignal
  ): Promise<Uint8Array> {
    if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function")
      throw new Cli.Failure(
        "interaction_required",
        "Use --key-stdin to configure a provider without an interactive terminal."
      );
    if (signal.aborted) throw new ProviderCredentials.Failure("cancelled");

    return new Promise((resolve, reject) => {
      const bytes = Buffer.alloc(4096);
      let length = 0;
      let settled = false;
      const wasRaw = input.isRaw;
      const timer = setTimeout(
        () =>
          finish(new ProviderCredentials.Failure("credentials_unavailable")),
        30_000
      );
      const stop = () => finish(new ProviderCredentials.Failure("cancelled"));
      const unavailable = () =>
        finish(new ProviderCredentials.Failure("credentials_unavailable"));
      function finish(error?: unknown) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", stop);
        input.removeListener("data", data);
        input.removeListener("end", unavailable);
        input.removeListener("error", unavailable);
        for (const cleanup of [
          () => input.pause(),
          () => input.setRawMode(wasRaw),
          () => output.write("\n"),
        ]) {
          try {
            cleanup();
          } catch {
            error = new ProviderCredentials.Failure("credentials_unavailable");
          }
        }
        const result = error
          ? undefined
          : Uint8Array.from(bytes.subarray(0, length));
        bytes.fill(0);
        if (error) reject(error);
        else resolve(result!);
      }
      function data(chunk: unknown) {
        if (!(chunk instanceof Uint8Array)) return unavailable();
        for (const byte of chunk) {
          if (byte === 3 || byte === 4) return stop();
          if (byte === 10 || byte === 13) return finish();
          if (byte === 8 || byte === 127) {
            if (length) bytes[--length] = 0;
          } else if (byte < 32 || byte > 126 || length === bytes.length) {
            return finish(
              new ProviderCredentials.Failure("invalid_credentials")
            );
          } else {
            bytes[length++] = byte;
          }
        }
      }
      try {
        input.setRawMode(true);
        output.write(
          "API key (hidden; stored in plaintext with private permissions): "
        );
        signal.addEventListener("abort", stop, { once: true });
        input.on("data", data);
        input.on("end", unavailable);
        input.on("error", unavailable);
        input.resume();
        if (signal.aborted) stop();
      } catch {
        unavailable();
      }
    });
  }
}
