"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import { cn } from "@app/ui/lib/utils";
import { app, nav } from "@/lib/desktop/bridge";
import { useNavigationState } from "@/lib/desktop/bridge-react";

/**
 * Standard title-bar row height. Matches Tailwind `h-10` and the
 * `titleBarOverlay.height` value the Electron main process passes to
 * `BrowserWindow` on Windows / Linux (`desktop/src/window.ts`) so the
 * OS-rendered window-control buttons sit flush with the renderer's
 * title bar instead of clipping a few pixels off.
 */
export const TITLEBAR_HEIGHT_PX = 40;

/**
 * Left inset on macOS to clear the native traffic-light buttons.
 *
 * `BrowserWindow` is constructed with `titleBarStyle: "hidden"` +
 * `trafficLightPosition: { x: 14, y: 14 }`. The three native buttons
 * are 12px circles laid out with ~20px gaps, so the rightmost edge
 * lands around x = 14 + (12 + 8) × 3 ≈ 74. We pad 78 for visual
 * margin and so the leftmost interactive control doesn't appear
 * adjacent to the close button.
 *
 * macOS in hidden-titlebar mode does NOT publish the WCO
 * `env(titlebar-area-*)` CSS env vars, so the inset is hardcoded
 * here rather than read from CSS.
 */
const MAC_TRAFFIC_LIGHT_INSET_PX = 78;

/**
 * Spread onto any child element that needs to receive pointer events
 * inside a `<TitleBar>` (buttons, links, inputs). The bar's
 * background is `-webkit-app-region: drag`; without this opt-out a
 * click on a control would be intercepted by the OS as a window-move
 * gesture and the `onClick` handler would never fire.
 *
 * Plain text is intentionally left as part of the drag region — the
 * macOS convention is that grabbing the document title moves the
 * window, and it's nice on every platform.
 */
export const TITLEBAR_NO_DRAG_STYLE: CSSProperties = {
  // `WebkitAppRegion` is an Electron / Chromium extension that
  // TypeScript's `CSSProperties` doesn't know about. The cast keeps
  // it inline-styleable without polluting the global types.
  WebkitAppRegion: "no-drag",
} as CSSProperties;

const TITLEBAR_DRAG_STYLE: CSSProperties = {
  WebkitAppRegion: "drag",
} as CSSProperties;

/**
 * Detect the host platform via the desktop bridge.
 *
 * The bridge isn't installed during SSR, so we always return `null`
 * on the first render and re-snapshot after mount. The `try/catch`
 * tolerates a missing bridge silently — the title bar still renders,
 * just without the macOS traffic-light inset (which is fine on a
 * non-Electron preview where the OS draws no traffic lights anyway).
 */
function usePlatform(): NodeJS.Platform | string | null {
  const [platform, setPlatform] = useState<string | null>(null);
  useEffect(() => {
    try {
      setPlatform(app.getAppInfo().platform);
    } catch {
      // Bridge missing — leave as null; the rendering branch below
      // falls through to the WCO env-var path with safe defaults.
    }
  }, []);
  return platform;
}

/**
 * Frameless-window title bar for `/desktop/*` pages.
 *
 * Renders a 40px-tall row pinned at the top of the page. The bar's
 * background is a drag region: anywhere not covered by an
 * interactive child can be grabbed to move the window.
 *
 * Reserves the OS-controls strip so page content never overlaps it:
 *
 *   - **macOS** — 78px of left padding for the traffic-light buttons
 *     (hidden-titlebar mode draws them natively at `{x:14, y:14}`).
 *   - **Windows / Linux** — uses the WCO `env(titlebar-area-x)` and
 *     `env(titlebar-area-width)` env vars from `titleBarOverlay` to
 *     keep content inside the OS-supplied safe zone. When the env
 *     vars aren't exposed (older Electron, non-WCO browsers) the
 *     fallbacks collapse to zero insets and the bar fills the
 *     window — safe behaviour.
 *
 * **Composition.**
 *
 * ```tsx
 * <TitleBar>
 *   <span className="font-medium">{docName}</span>
 *   <Button style={TITLEBAR_NO_DRAG_STYLE} onClick={toggle}>…</Button>
 * </TitleBar>
 * ```
 *
 * Children render directly in the bar's content row. Buttons and
 * other interactive elements must spread {@link TITLEBAR_NO_DRAG_STYLE}
 * so clicks land on the handler instead of being eaten by the drag
 * region. Plain text inherits the drag region.
 *
 * Pages that don't need any controls in the bar can render
 * `<TitleBar />` bare — the drag region still works.
 */
export function TitleBar({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const platform = usePlatform();
  const isMac = platform === "darwin";

  return (
    <div
      role="presentation"
      data-platform={platform ?? undefined}
      className={cn(
        // `select-none` so dragging the bar doesn't accidentally
        // start a text selection on the title.
        "grida-titlebar relative flex shrink-0 select-none items-stretch border-b bg-background",
        className
      )}
      style={{
        ...TITLEBAR_DRAG_STYLE,
        height: TITLEBAR_HEIGHT_PX,
        // OS-controls inset. The mac branch hardcodes the
        // traffic-light width since hidden-titlebar mode doesn't
        // publish env vars. Win/Linux read the WCO env vars; the
        // fallbacks collapse to zero, which is correct when no
        // overlay is active.
        paddingLeft: isMac
          ? `${MAC_TRAFFIC_LIGHT_INSET_PX}px`
          : "env(titlebar-area-x, 0px)",
        // `100%` here refers to the bar's own width — which equals
        // the window width because the bar is a top-level row. The
        // formula reduces to `window_width - safe_zone_width -
        // safe_zone_x`, i.e. exactly the width of the right-side
        // OS-controls strip on LTR Windows / Linux.
        paddingRight: isMac
          ? "0px"
          : "calc(100% - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100%))",
      }}
    >
      <div className="flex h-full w-full items-center gap-2 px-3 text-xs text-muted-foreground">
        <NavButtons />
        {children}
      </div>
    </div>
  );
}

/**
 * Auto-rendered Back / Forward pair, sourced from Chromium's
 * per-window session history via the desktop bridge. Renders
 * **only when there's history** — both buttons stay hidden in a
 * just-loaded window with no navigations yet, which keeps document
 * windows (loaded once with `?docId=…` and never navigated) free of
 * dead UI.
 *
 * Once any direction is available, the pair is shown together with
 * the unavailable side disabled — matching the convention from
 * Notion / Spotify / Apple Music desktop. The browser-style "always
 * visible, always disabled" pattern was rejected because Grida's
 * routes are flat and the buttons would be noise on every page that
 * happened to be at the entry point.
 *
 * Each button opts out of the drag region via
 * {@link TITLEBAR_NO_DRAG_STYLE} — without it the OS would consume
 * the click as a window-move gesture.
 */
function NavButtons() {
  const state = useNavigationState();
  if (!state) return null;
  if (!state.can_go_back && !state.can_go_forward) return null;
  return (
    <div
      className="-ml-1 flex items-center gap-0.5"
      style={TITLEBAR_NO_DRAG_STYLE}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={!state.can_go_back}
        onClick={() => void nav.back()}
        aria-label="Go back"
        title="Go back"
      >
        <ChevronLeftIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={!state.can_go_forward}
        onClick={() => void nav.forward()}
        aria-label="Go forward"
        title="Go forward"
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}
