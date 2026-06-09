/**
 * GRIDA-SEC-004 — read-only command categorization (the `accept-edits` gate).
 *
 * This replaces the pre-srt hardcoded command allowlist. The allowlist used to
 * be *the* boundary; it no longer is — the OS sandbox (srt) is the structural
 * boundary (write-confinement + process-tree containment; see
 * `sandbox/policy.ts` and `shell/runner.ts`). This predicate answers ONE
 * question, only for the supervised mode (`accept-edits`): does this command
 * merely inspect, or could it mutate / execute arbitrary code?
 *
 *   - read-only ⇒ auto-runs without prompting.
 *   - not read-only ⇒ surfaces an approval (or the user switches to `auto`).
 *
 * It is NOT a security boundary: `auto` runs anything, contained by the sandbox.
 * So it fails SAFE — anything it can't positively classify as read-only is
 * treated as mutating (returns `false`), which over-restricts (a prompt) rather
 * than over-permits. A gap in this list costs an extra approval, never a breach.
 *
 * Commands run with `shell: false` (`shell/runner.ts`), so redirection, pipes,
 * and glob expansion are inert — the only mutation vectors are a command's own
 * flags, handled per-command below.
 */

/** Pure inspectors: no flag turns these into a write/exec under `shell: false`. */
const READ_ONLY_COMMANDS: ReadonlySet<string> = new Set([
  "ls",
  "pwd",
  "echo",
  "cat",
  "head",
  "tail",
  "wc",
  "grep",
  "rg",
]);

/** `find` is read-only UNLESS it spawns a process or deletes/writes. */
const FIND_MUTATING_FLAGS: ReadonlySet<string> = new Set([
  "-exec",
  "-execdir",
  "-ok",
  "-okdir",
  "-delete",
  "-fprint",
  "-fprint0",
  "-fprintf",
  "-fls",
]);

/**
 * `git` subcommands that touch neither the working tree nor a remote.
 *
 * Known limitation (accepted, not a breach): inspection subcommands that render
 * content — `diff`, `show`, `log -p`, `blame` — honor repo-resident config a
 * command-line flag scan can't see (`[diff] external`, a `*.textconv`/`diff`
 * driver in `.gitattributes`). On a repo with a hostile such config, an
 * auto-run `git diff` could exec that program WITHOUT an approval prompt. This
 * costs a missed prompt, never containment: the OS sandbox still confines the
 * spawned program, and this module is not a security boundary (see the header).
 * The fs-edit tools also can't write these config files (`fs/scope.ts`), so the
 * agent can't plant the config itself — only a pre-existing/cloned repo can.
 */
const GIT_READ_ONLY_SUBCOMMANDS: ReadonlySet<string> = new Set([
  "status",
  "log",
  "diff",
  "show",
  "ls-files",
  "rev-parse",
  "blame",
]);

/**
 * `git` global flags that turn ANY invocation into arbitrary code execution or
 * arbitrary file read even with a read-only subcommand (`-c core.pager=…` /
 * `-c core.sshCommand=…`, `--upload-pack`, `--git-dir`, `--exec-path`). Their
 * presence makes the call not-read-only regardless of subcommand.
 */
function gitGlobalFlagsAreSafe(args: readonly string[]): boolean {
  const unsafe = [
    "-c",
    "--exec-path",
    "--git-dir",
    "--upload-pack",
    "--receive-pack",
  ];
  return !args.some((a) =>
    unsafe.some((u) => a === u || a.startsWith(`${u}=`))
  );
}

/**
 * Whether `cmd` (with its argv) is a read-only/inspection command — the
 * `accept-edits` auto-run set. Bare binary name only (a path defeats the point);
 * unknown ⇒ not read-only.
 */
export function isReadOnlyCommand(
  cmd: string,
  args: readonly string[] = []
): boolean {
  if (cmd.length === 0) return false;
  // Must be a bare name so OS PATH resolution picks the host's copy and the
  // categorization actually means something.
  if (cmd.includes("/") || cmd.includes("\\")) return false;

  if (READ_ONLY_COMMANDS.has(cmd)) return true;

  if (cmd === "find") {
    return !args.some((a) => FIND_MUTATING_FLAGS.has(a));
  }

  if (cmd === "git") {
    if (!gitGlobalFlagsAreSafe(args)) return false;
    // The first non-flag token is the subcommand.
    const sub = args.find((a) => !a.startsWith("-"));
    return sub !== undefined && GIT_READ_ONLY_SUBCOMMANDS.has(sub);
  }

  return false;
}
