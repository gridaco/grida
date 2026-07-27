/** Cold-start window policy, kept pure so launch-intent precedence is pinned.
 *  (see test/desktop-startup-restore-last-workspace.md) */
export namespace startup_window {
  export type Bootstrap = "restore-last-workspace" | "welcome";

  export function canDispatchLaunchIntent(input: {
    app_ready: boolean;
    entry_main: boolean;
  }): boolean {
    return input.app_ready && input.entry_main;
  }

  export function bootstrap(input: { pending_files: number }): Bootstrap {
    return input.pending_files === 0 ? "restore-last-workspace" : "welcome";
  }
}
