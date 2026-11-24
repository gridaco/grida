import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeAgentConfig } from "./native-agent-config";

let home: string;
let executable: string;
let config: NativeAgentConfig;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "grida-config-writer-"));
  executable = path.join(home, "agent");
  config = new NativeAgentConfig(home, () => executable);
});

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

const fixture = (body: string) =>
  fs.writeFile(executable, "#!/bin/sh\n" + body, { mode: 0o700 });

const writer = [
  "printf 'ready\\n'",
  'response="$(/bin/cat)"',
  '[ "$response" = y ] || { printf refused > "$GRIDA_HOME/refused"; exit 1; }',
  'printf "%s\\n" "$@" > "$GRIDA_HOME/written"',
].join("\n");

it.skipIf(process.platform === "win32")(
  "sends only the requested setting after native write admission",
  async () => {
    await fixture(writer);
    const check = vi.fn<() => void>();
    await config.set({ webSearch: "disabled" }, check);
    expect(check).toHaveBeenCalledTimes(2);
    expect(await fs.readFile(path.join(home, "written"), "utf8")).toBe(
      "config\n--confirm-stdio\nset-personalization\nweb-search\ndisabled\n"
    );
  }
);

it.skipIf(process.platform === "win32")(
  "withholds permission if the Settings sender changes before the commit",
  async () => {
    await fixture(writer);
    const check = vi.fn<() => void>();
    check
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error("revoked");
      });
    await expect(config.create(check)).rejects.toThrow("revoked");
    expect(await fs.readFile(path.join(home, "refused"), "utf8")).toBe(
      "refused"
    );
    await expect(fs.stat(path.join(home, "written"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  }
);

it.skipIf(process.platform === "win32")(
  "waits for the result of a confirmed write after the Settings frame leaves",
  async () => {
    await fixture(
      writer.replace(
        'printf "%s',
        'printf acknowledged > "$GRIDA_HOME/acknowledged"\n' +
          'while [ ! -e "$GRIDA_HOME/release" ]; do /bin/sleep 0.01; done\n' +
          'printf "%s'
      )
    );
    const owner = new AbortController();
    const pending = config.set(
      { suggestedPrompts: false },
      () => {},
      owner.signal
    );
    void pending.catch(() => {});
    await vi.waitFor(async () =>
      expect(await fs.readFile(path.join(home, "acknowledged"), "utf8")).toBe(
        "acknowledged"
      )
    );
    owner.abort();
    await fs.writeFile(path.join(home, "release"), "");
    await expect(pending).resolves.toBeUndefined();
    expect(await fs.readFile(path.join(home, "written"), "utf8")).toContain(
      "set-personalization\nsuggested-prompts\nfalse"
    );
  }
);

it.skipIf(process.platform === "win32")(
  "reports an existing-file no-op and forwards a bounded conflict code",
  async () => {
    await fixture("exit 0");
    await expect(config.create(() => {})).resolves.toBeUndefined();
    await fixture(
      "printf 'grida-agent: config_revision_changed (\"/local/config.toml\")\\n' >&2\nexit 1"
    );
    await expect(config.create(() => {})).rejects.toThrow(
      "config_revision_changed"
    );
  }
);

it.skipIf(process.platform === "win32")(
  "shows native diagnostics for the affected setting without echoing values",
  async () => {
    await fixture(
      "printf 'grida-agent: config_invalid_value_model_context_window (\"/local/config.toml\")\\n' >&2\nexit 1"
    );
    expect(await config.check()).toEqual([
      "Set model_context_window to a positive safe integer, or remove the key to use the default.",
    ]);
    await fixture("printf '%s\\n' '{\"unknown_keys\":[\"unexpected\"]}'");
    expect(await config.check()).toEqual(['Unknown setting "unexpected".']);
    await fixture(
      `printf '%s\\n' '${JSON.stringify({
        unknown_keys: [],
        file_diagnostic: { code: "config_file_too_large" },
      })}'`
    );
    expect(await config.check()).toEqual([
      "config.toml must be no larger than 64 KiB.",
    ]);
  }
);
