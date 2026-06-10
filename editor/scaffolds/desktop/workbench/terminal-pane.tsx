/**
 * Terminal pane — the human-interactive shell at the bottom of the
 * workspace workbench (xterm.js over `bridge.terminal`, VSCode-style).
 *
 * Lifecycle: one PTY per mount. The workbench keeps this component
 * mounted while the panel is merely collapsed (ctrl+` toggle), so the
 * shell — and anything running in it — survives hide/show. Unmount
 * (window close, shell exit, workbench teardown) kills the PTY; there
 * is no reattach in v1.
 *
 * GRIDA-SEC-004 — this is a view over the `terminal` bridge namespace
 * (`@/lib/desktop/bridge`); it never touches `window.grida` directly.
 */
"use client";

import { useEffect, useRef } from "react";
import {
  terminal as bridgeTerminal,
  type Workspace,
} from "@/lib/desktop/bridge";
import { isTerminalToggleEvent } from "./workspace-workbench-keybindings";
import "@xterm/xterm/css/xterm.css";

export type TerminalPaneProps = {
  workspace: Workspace;
  /**
   * The shell process ended (`exit`, crash, or kill). The workbench
   * unmounts the pane in response; the next toggle spawns a fresh shell.
   */
  onSessionEnded: () => void;
};

export function TerminalPane({ workspace, onSessionEnded }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Latest callback without re-running the terminal effect (same ref
  // pattern as the workbench's openTabsRef).
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let disposed = false;
    let termId: string | null = null;
    let dispose: (() => void) | null = null;

    (async () => {
      // xterm.js is browser-only; dynamic import keeps it out of the
      // SSR module graph (desktop routes are still server-rendered up
      // to the bridge gate).
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed) return;

      const term = new Terminal({ fontSize: 12, cursorBlink: true });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(el);
      // ctrl+` must keep toggling the pane while the terminal has
      // focus: tell xterm to skip the chord so the keydown bubbles up
      // to the workbench's window handler.
      term.attachCustomKeyEventHandler((e) => !isTerminalToggleEvent(e));
      fit.fit();

      const fitAndResize = () => {
        // A collapsed panel measures 0×0; fitting then would clamp the
        // grid to garbage. Skip — the observer re-fires on expand.
        if (el.clientWidth === 0 || el.clientHeight === 0) return;
        fit.fit();
        if (termId) void bridgeTerminal.resize(termId, term.cols, term.rows);
      };
      const observer = new ResizeObserver(fitAndResize);
      observer.observe(el);

      dispose = () => {
        observer.disconnect();
        term.dispose();
      };

      try {
        const { id } = await bridgeTerminal.create(
          { workspaceId: workspace.id, cols: term.cols, rows: term.rows },
          {
            onData: (data) => term.write(data),
            onExit: () => onSessionEndedRef.current(),
          }
        );
        if (disposed) {
          void bridgeTerminal.kill(id);
          return;
        }
        termId = id;
      } catch (err) {
        term.write(
          `\r\nfailed to start terminal: ${err instanceof Error ? err.message : String(err)}\r\n`
        );
        return;
      }

      term.onData((data) => {
        if (termId) void bridgeTerminal.write(termId, data);
      });
      term.focus();
    })();

    return () => {
      disposed = true;
      dispose?.();
      if (termId) void bridgeTerminal.kill(termId);
    };
  }, [workspace.id]);

  return (
    <div
      ref={containerRef}
      data-testid="terminal-pane"
      // xterm owns the inner canvas; the wrapper just reserves the box.
      // bg matches xterm's default dark background so the padding gutter
      // doesn't flash the app background around the grid.
      className="h-full w-full overflow-hidden bg-black p-1"
    />
  );
}
