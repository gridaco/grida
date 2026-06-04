/**
 * GRIDA-SEC-004 — shell runner allowlist (pre-srt; demo-grade).
 *
 * V1.x ships a hardcoded allowlist of "safe-ish" dev commands. This
 * is the demo-grade gate that lets us prove the end-to-end shell
 * shape (open folder → run command → see output) without depending
 * on the full manifest + srt sub-policy machinery the approved plan
 * calls for.
 *
 * Known limitations until srt lands:
 *
 *   - There is no per-cmd fs/net sub-policy enforcement — the child
 *     inherits the agent host's full OS reach. srt is what makes the
 *     sub-policy enforceable at the kernel level.
 *
 * The cwd-must-be-inside-an-opened-workspace check (in `runner.ts`)
 * is the second gate. Without an opened workspace, no shell call
 * runs — opening a folder is the user's explicit grant.
 */

/**
 * Commands the demo accepts. Curated for "useful for showing the
 * shape works" — `ls`/`pwd`/`echo`/`cat` for the basics, `rg`/`git`
 * for "things you'd actually want." Shells, language runtimes, and
 * package managers are intentionally absent because this surface is
 * agent-callable; `bash -c`, `node -e`, and `pnpm run` collapse the
 * allowlist to arbitrary code execution.
 */
const ALLOWED_COMMANDS: ReadonlySet<string> = new Set([
  "ls",
  "pwd",
  "echo",
  "cat",
  "head",
  "tail",
  "wc",
  "find",
  "grep",
  "rg",
  // KNOWN, ACCEPTED LIMITATION (V1.x, pre-srt): `git` is an
  // arbitrary-code-execution and arbitrary-file-read vector even with
  // `shell: false`. `git -c core.pager=…` / `-c core.sshCommand=…`,
  // `--upload-pack`, and `apply`/`clone` run attacker-chosen programs;
  // `--git-dir`, `apply`, and a `.git/config` credential read reach
  // arbitrary files. This collapses the no-shell / allowlist guarantee.
  // We keep `git` because it is the single most useful dev command and
  // accept the risk for V1.x, pending the srt per-cmd sub-policy that can
  // constrain its fs/net reach at the kernel level (see `policy.ts`).
  "git",
]);

export function isAllowedCommand(cmd: string): boolean {
  // Reject absolute paths or paths with separators — `cmd` must be a
  // bare binary name so the OS PATH resolution picks the host's copy
  // (and so the allowlist check actually means something).
  if (cmd.length === 0) return false;
  if (cmd.includes("/") || cmd.includes("\\")) return false;
  return ALLOWED_COMMANDS.has(cmd);
}

export function listAllowedCommands(): readonly string[] {
  return [...ALLOWED_COMMANDS].sort();
}
