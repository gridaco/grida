/**
 * Terminal pane — the human-interactive shell at the bottom of the
 * workspace workbench (xterm.js over `bridge.terminal`, VSCode-style).
 *
 * Lifecycle: one PTY per mount. The workbench keeps this component
 * mounted while the panel is merely collapsed (ctrl+` toggle), so the
 * shell — and anything running in it — survives hide/show. Unmount
 * (window close, shell exit, the header's close button, workbench
 * teardown) kills the PTY; there is no reattach in v1.
 *
 * GRIDA-SEC-004 — this is a view over the `terminal` bridge namespace
 * (`@/lib/desktop/bridge`); it never touches `window.grida` directly.
 */
"use client";

import { useEffect, useRef } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import type { ITheme, Terminal as XTerminal } from "@xterm/xterm";
import {
  terminal as bridgeTerminal,
  type Workspace,
} from "@/lib/desktop/bridge";
import { isTerminalToggleEvent } from "./workspace-workbench-keybindings";
import "@xterm/xterm/css/xterm.css";

/**
 * Resolve a shadcn theme variable (e.g. `--background`) to a concrete
 * `#rrggbb[aa]` string. xterm paints its grid from parsed colors, so it
 * can't take `var(...)` references — and the theme tokens are `oklch()`
 * values that Chromium's computed styles do NOT serialize to rgb. A 1×1
 * canvas is the one robust CSS-color-to-bytes converter the platform
 * gives us.
 */
function themeColor(varName: string, alpha?: number): string | undefined {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  if (!raw) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.fillStyle = "#000";
  ctx.fillStyle = raw; // invalid strings leave the previous value
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  const base = `#${hex(r)}${hex(g)}${hex(b)}`;
  return alpha === undefined ? base : `${base}${hex(Math.round(alpha * 255))}`;
}

/** xterm theme derived from the active shadcn tokens. ANSI palette is
 * left to xterm's defaults; only the chrome colors follow the app. */
function resolveXtermTheme(): ITheme {
  return {
    background: themeColor("--background"),
    foreground: themeColor("--foreground"),
    cursor: themeColor("--foreground"),
    cursorAccent: themeColor("--background"),
    selectionBackground: themeColor("--primary", 0.3),
  };
}

/**
 * Deterministic trackpad/wheel scrolling for the normal buffer.
 *
 * xterm 6 scrolls through VS Code's SmoothScrollableElement, which
 * normalizes wheel events via the legacy `wheelDeltaY / 120` and rounds
 * every event away from zero — so each tiny pixel-delta trackpad event
 * can scroll a whole notch, and a gesture (dozens of events) rockets
 * the scrollback (xterm.js#4412 class). That widget's listener also
 * runs before `attachCustomWheelEventHandler` is consulted, so the fix
 * must intercept in the CAPTURE phase: convert pixel deltas to lines
 * exactly (with a fractional accumulator, like any native scroller) and
 * stop the event. Alternate-screen apps (vim/less), mouse-protocol
 * consumers (htop), pinch-zoom (ctrl+wheel), and non-pixel wheels keep
 * xterm's own handling.
 */
function attachWheelFix(el: HTMLElement, term: XTerminal): () => void {
  let acc = 0;
  const onWheelCapture = (e: WheelEvent) => {
    if (e.ctrlKey) return;
    if (e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return;
    if (term.buffer.active.type === "alternate") return;
    if (term.modes.mouseTrackingMode !== "none") return;
    e.preventDefault();
    e.stopPropagation();
    const screen = el.querySelector<HTMLElement>(".xterm-screen");
    const cell = screen && term.rows > 0 ? screen.clientHeight / term.rows : 0;
    if (cell <= 0) return;
    acc += e.deltaY / cell;
    const lines = Math.trunc(acc);
    if (lines !== 0) {
      acc -= lines;
      term.scrollLines(lines);
    }
  };
  el.addEventListener("wheel", onWheelCapture, {
    capture: true,
    passive: false,
  });
  return () =>
    el.removeEventListener("wheel", onWheelCapture, { capture: true });
}

export type TerminalPaneProps = {
  workspace: Workspace;
  /**
   * The terminal session is over — the shell exited (`exit`, crash,
   * kill) or the user clicked the header's close button. The workbench
   * unmounts the pane in response (unmount kills the PTY); the next
   * toggle spawns a fresh shell.
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
      // From here to the bridge call the failure surface is xterm
      // itself (terminal construction and wiring) — handled by the
      // .catch on this IIFE, since no grid exists to print into.

      const term = new Terminal({
        fontSize: 12,
        cursorBlink: true,
        theme: resolveXtermTheme(),
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(el);
      // ctrl+` must keep toggling the pane while the terminal has
      // focus: tell xterm to skip the chord so the keydown bubbles up
      // to the workbench's window handler.
      term.attachCustomKeyEventHandler((e) => !isTerminalToggleEvent(e));
      const detachWheelFix = attachWheelFix(el, term);
      fit.fit();

      // Follow live theme switches (next-themes flips the `dark` class
      // on <html>); re-resolve the tokens and hand xterm a new theme.
      const themeObserver = new MutationObserver(() => {
        term.options.theme = resolveXtermTheme();
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme"],
      });

      const fitAndResize = () => {
        // A collapsed panel measures 0×0; fitting then would clamp the
        // grid to garbage. Skip — the observer re-fires on expand. Also
        // drop focus: a hidden terminal must not keep swallowing
        // keystrokes into an invisible shell (covers both the ctrl+`
        // toggle and a drag-to-collapse).
        if (el.clientWidth === 0 || el.clientHeight === 0) {
          term.blur();
          return;
        }
        fit.fit();
        if (termId) void bridgeTerminal.resize(termId, term.cols, term.rows);
      };
      const resizeObserver = new ResizeObserver(fitAndResize);
      resizeObserver.observe(el);

      dispose = () => {
        themeObserver.disconnect();
        resizeObserver.disconnect();
        detachWheelFix();
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
        // The pane may have been resized while create() was in flight —
        // fitAndResize skips the PTY half when termId is null — so
        // replay the latest fitted grid to the shell.
        void bridgeTerminal.resize(id, term.cols, term.rows);
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
    })().catch((err) => {
      // Import or xterm-setup failure (bridge failures are printed into
      // the grid above). No grid exists to render the error, so log and
      // retreat — unmounting beats leaving a dead pane open.
      console.error("[terminal-pane] terminal startup failed:", err);
      if (!disposed) onSessionEndedRef.current();
    });

    return () => {
      disposed = true;
      dispose?.();
      if (termId) void bridgeTerminal.kill(termId);
    };
  }, [workspace.id]);

  return (
    <div
      data-testid="terminal-pane"
      className="flex h-full w-full flex-col overflow-hidden bg-background"
    >
      <div className="flex shrink-0 items-center border-b px-2">
        <span className="text-xs text-muted-foreground">Terminal</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label="Close terminal"
          title="Close terminal"
          // Unmount through the workbench; the unmount cleanup above is
          // the single PTY-kill path.
          onClick={() => onSessionEndedRef.current()}
        >
          <XIcon />
        </Button>
      </div>
      {/* xterm owns the inner canvas; the wrapper just reserves the box.
          The padding gutter shows the pane background, which matches the
          themed xterm background. */}
      <div ref={containerRef} className="min-h-0 w-full flex-1 p-1" />
    </div>
  );
}
