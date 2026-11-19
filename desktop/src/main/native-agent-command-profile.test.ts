import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function signal(pid: number, value: 0 | "SIGKILL"): boolean {
  try {
    return process.kill(pid, value);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

describe.skipIf(process.platform !== "darwin" && process.platform !== "linux")(
  "Native command profile",
  () => {
    let shellHome: string;
    let shell: string;

    beforeEach(async () => {
      shellHome = await fs.mkdtemp(
        path.join(await fs.realpath(os.tmpdir()), "grida-shell-")
      );
      shell = path.join(shellHome, "login-shell");
      vi.spyOn(os, "homedir").mockReturnValue(shellHome);
      vi.stubEnv("SHELL", shell);
      vi.resetModules();
    });

    afterEach(async () => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
      await fs.rm(shellHome, { recursive: true, force: true });
    });

    it("captures the login environment from home without a terminal or app variables", async () => {
      await fs.writeFile(
        shell,
        `#!/bin/sh
[ "$PWD" = "$HOME" ] && [ "$1" = "-ilc" ] || exit 1
if (exec 3</dev/tty) 2>/dev/null; then exit 1; fi
if IFS= read -r line; then exit 1; fi
export PATH="$HOME/bin:/usr/bin:/bin"
export GRIDA_INTERNAL=private ELECTRON_INTERNAL=private
exec /bin/sh -c "$2"
`,
        { mode: 0o700 }
      );
      const { NativeCommandProfiles } =
        await import("./native-agent-command-profile");
      const environment = await NativeCommandProfiles.programEnvironment();
      expect(environment.PATH).toBe(`${shellHome}/bin:/usr/bin:/bin`);
      expect(
        Object.keys(environment).filter(
          (name) => name.startsWith("GRIDA_") || name.startsWith("ELECTRON_")
        )
      ).toEqual([]);
      expect(
        Buffer.byteLength(JSON.stringify(environment))
      ).toBeLessThanOrEqual(24 * 1024);
    });

    it("falls back for all callers and stops the shell and its child when login hangs", async () => {
      const pidFile = path.join(shellHome, "shell-pids");
      await fs.writeFile(
        shell,
        `#!/bin/sh
trap '' TERM
/bin/sleep 60 &
printf '%s %s\\n' "$$" "$!" >> "$HOME/shell-pids"
wait
`,
        { mode: 0o700 }
      );
      const { NativeCommandProfiles } =
        await import("./native-agent-command-profile");
      const attempts = Promise.all([
        NativeCommandProfiles.programEnvironment(),
        NativeCommandProfiles.programEnvironment(),
      ]);
      let finished = false;
      void attempts.then(() => {
        finished = true;
      });
      try {
        await expect.poll(() => finished, { timeout: 7_000 }).toBe(true);
        for (const environment of await attempts) {
          expect(environment.PATH).toBe(process.env.PATH);
        }
        const pids = (await fs.readFile(pidFile, "utf8"))
          .trim()
          .split(/\s+/)
          .map(Number);
        expect(pids).toHaveLength(2);
        await expect.poll(() => pids.some((pid) => signal(pid, 0))).toBe(false);
      } finally {
        // Also clean both processes when testing a broken timeout implementation.
        const contents = await fs.readFile(pidFile, "utf8").catch(() => "");
        for (const pid of contents.match(/\d+/g)?.map(Number).reverse() ?? []) {
          signal(pid, "SIGKILL");
        }
      }
    }, 12_000);
  }
);
