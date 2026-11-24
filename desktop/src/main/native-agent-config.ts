// GRIDA-SEC-004 — Settings authorizes an exact native configuration write.
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

type Personalization =
  | { suggestedPrompts: boolean }
  | { webSearch: "automatic" | "disabled" };

const TIMEOUT = 10_000;
const READY = "ready\n";

const execute = promisify(execFile);

export function nativeAgentErrorCode(diagnostics: string): string | undefined {
  return /^grida-agent: ([a-z0-9_]{1,96})(?: \(.*\))?$/m.exec(diagnostics)?.[1];
}

export function configurationErrorMessage(error: string): string | undefined {
  switch (error) {
    case "config_toml_invalid":
    case "config_encoding_invalid":
      return "config.toml must contain valid UTF-8 TOML.";
    case "config_schema_unsupported":
      return "Set schema_version = 1 in config.toml.";
    case "config_home_must_be_absolute":
      return "Set GRIDA_HOME to an absolute directory path.";
    case "config_home_unavailable":
    case "config_directory_unavailable":
    case "config_directory_invalid":
    case "config_directory_unsafe":
    case "config_file_unavailable":
    case "config_file_invalid":
    case "config_file_unsafe":
    case "config_access_control_unsafe":
      return "Grida couldn’t read config.toml. Check the file’s ownership and permissions.";
    case "config_file_too_large":
      return "config.toml must be no larger than 64 KiB.";
    case "config_file_changed":
    case "config_directory_changed":
      return "config.toml changed while Grida was reading it. Try again.";
    case "config_invalid_value_model_context_window":
    case "config_invalid_value_model_auto_compact_token_limit":
      return `Set ${error.slice("config_invalid_value_".length)} to a positive safe integer, or remove the key to use the default.`;
  }
}

export class NativeAgentConfig {
  constructor(
    private readonly home: string,
    private readonly executable: () => string
  ) {}

  async check(): Promise<string[]> {
    try {
      const { stdout } = await execute(this.executable(), ["config", "check"], {
        env: { GRIDA_HOME: this.home },
        maxBuffer: 128 * 1024,
        timeout: TIMEOUT,
        windowsHide: true,
      });
      const { unknown_keys, file_diagnostic } = JSON.parse(stdout) as {
        unknown_keys?: unknown;
        file_diagnostic?: { code?: unknown };
      };
      if (typeof file_diagnostic?.code === "string") {
        const diagnostic = configurationErrorMessage(file_diagnostic.code);
        if (diagnostic) return [diagnostic];
      }
      if (!Array.isArray(unknown_keys)) throw new Error("config_check_invalid");
      return unknown_keys
        .slice(0, 16)
        .filter((key): key is string => typeof key === "string")
        .map((key) => `Unknown setting ${JSON.stringify(key.slice(0, 256))}.`);
    } catch (error) {
      const stderr = (error as { stderr?: unknown })?.stderr;
      const code =
        typeof stderr === "string" ? nativeAgentErrorCode(stderr) : undefined;
      return [
        (code && configurationErrorMessage(code)) ??
          "Grida couldn’t validate config.toml. Check the file’s ownership and permissions.",
      ];
    }
  }

  create(check: () => void, signal?: AbortSignal): Promise<void> {
    return this.write(["create"], check, signal);
  }

  set(
    change: Personalization,
    check: () => void,
    signal?: AbortSignal
  ): Promise<void> {
    const [key, value] =
      "suggestedPrompts" in change
        ? ["suggested-prompts", String(change.suggestedPrompts)]
        : ["web-search", change.webSearch];
    return this.write(["set-personalization", key, value], check, signal);
  }

  private async write(
    args: string[],
    check: () => void,
    signal?: AbortSignal
  ): Promise<void> {
    const authorize = () => {
      signal?.throwIfAborted();
      check();
    };
    authorize();
    const child = spawn(
      this.executable(),
      ["config", "--confirm-stdio", ...args],
      {
        env: { GRIDA_HOME: this.home },
        shell: false,
        windowsHide: true,
        stdio: "pipe",
      }
    );
    await new Promise<void>((resolve, reject) => {
      let finished = false;
      let confirmed = false;
      let output = "";
      let diagnostics = "";
      let refusal: Error | undefined;
      const timeout = setTimeout(
        () => finish(refusal ?? new Error("global_config_write_timeout")),
        TIMEOUT
      );
      const refuse = (error: unknown) => {
        if (finished || refusal) return;
        refusal =
          error instanceof Error
            ? error
            : new Error("global_config_write_denied");
        // EOF lets the writer discard staging and release its lock itself.
        child.stdin.end();
      };
      const cancel = () => {
        if (!confirmed) refuse(signal?.reason);
      };
      const finish = (error?: unknown) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        signal?.removeEventListener("abort", cancel);
        if (error !== undefined) {
          child.stdin.destroy();
          child.kill();
          reject(error);
        } else {
          resolve();
        }
      };
      signal?.addEventListener("abort", cancel, { once: true });
      child.stdout.setEncoding("utf8").on("data", (data: string) => {
        if (finished || refusal) return;
        output += data;
        if (!READY.startsWith(output)) {
          finish(new Error("global_config_response_invalid"));
          return;
        }
        if (output !== READY) return;
        try {
          authorize();
          if (refusal) return;
          confirmed = true;
          child.stdin.end("y");
        } catch (error) {
          refuse(error);
        }
      });
      child.stderr.setEncoding("utf8").on("data", (data: string) => {
        diagnostics = (diagnostics + data).slice(-4096);
      });
      child.stdin.on("error", (error) => finish(refusal ?? error));
      child.stdout.on("error", finish);
      child.stderr.on("error", finish);
      child.once("error", finish);
      child.once("close", (code) => {
        if (refusal) return finish(refusal);
        if (code === 0 && (confirmed || output === "")) return finish();
        finish(
          new Error(
            nativeAgentErrorCode(diagnostics) ?? "global_config_write_failed"
          )
        );
      });
      if (signal?.aborted) cancel();
    });
  }
}
