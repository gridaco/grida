/** Cold-start window policy, kept pure so launch-intent precedence is pinned.
 *  (see test/desktop-startup-restore-last-workspace.md) */
export namespace startup_window {
  export type Bootstrap = "restore-last-workspace" | "welcome";

  export function canDispatchLaunchIntent(input: {
    app_ready: boolean;
    bootstrap_complete: boolean;
  }): boolean {
    return input.app_ready && input.bootstrap_complete;
  }

  export function bootstrap(input: {
    pending_files: number;
    pending_deep_links: number;
  }): Bootstrap {
    return input.pending_files === 0 && input.pending_deep_links === 0
      ? "restore-last-workspace"
      : "welcome";
  }
}
