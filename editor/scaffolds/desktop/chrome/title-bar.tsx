"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import { cn } from "@app/ui/lib/utils";
import { app, nav } from "@/lib/desktop/bridge";
import { useNavigationState } from "@/lib/desktop/bridge-react";

/**
 * Left inset on macOS to clear the native traffic-light buttons.
 *
 * `BrowserWindow` is constructed with `titleBarStyle: "hidden"` +
 * `trafficLightPosition: { x: 14, y: 16 }`. The 12px native buttons
 * therefore center at `16 + 12 / 2 = 22px`, matching the title controls
 * and workspace tabs. The three native buttons
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
 * Width occupied by native right-edge window controls in Window Controls
 * Overlay mode. `100vw` keeps the calculation correct for title bars that own
 * only one column of the window; the CSS env fallbacks reduce it to zero on
 * macOS hidden-titlebar mode and in ordinary browsers.
 */
export const DESKTOP_WINDOW_CONTROLS_RIGHT_INSET =
  "calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw))";

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
 * Renders a 44px-tall row pinned at the top of the page. The bar's
 * background is a drag region: anywhere not covered by an
 * interactive child can be grabbed to move the window.
 * Interactive children opt out with the shared `.desktop-no-drag` class
 * from `editor/app/editor.css`; plain text remains draggable.
 *
 * Reserves the OS-controls strip so page content never overlaps it:
 *
 *   - **macOS** — 78px of left padding for the traffic-light buttons
 *     (hidden-titlebar mode draws them natively at `{x:14, y:16}`).
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
 *   <Button className="desktop-no-drag" onClick={toggle}>…</Button>
 * </TitleBar>
 * ```
 *
 * Children render directly in the bar's content row. Buttons and
 * other interactive elements must use `.desktop-no-drag` so clicks land on
 * the handler instead of being eaten by the drag region. Plain text remains
 * part of the drag region.
 *
 * Pages that don't need any controls in the bar can render
 * `<TitleBar />` bare — the drag region still works.
 */
export function TitleBar({
  children,
  className,
  leading,
  hideNavigationTo,
  navigationScope = "window",
  reserveRightWindowControls = true,
  navigationDisabled = false,
}: {
  children?: ReactNode;
  className?: string;
  /** Optional control before the history buttons. */
  leading?: ReactNode;
  /** Hide history arrows to a destination that has its own control here. */
  hideNavigationTo?: "home";
  navigationScope?: nav.Scope;
  /**
   * Keep the Windows/Linux window-controls overlay out of this bar's content.
   * Disable only when the bar occupies a left-side region that cannot contain
   * those right-edge controls; that layout must reserve their space itself.
   */
  reserveRightWindowControls?: boolean;
  /** Keep a long-running page operation from being orphaned through history. */
  navigationDisabled?: boolean;
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
        "desktop-drag-area desktop-title-bar-height grida-titlebar relative flex shrink-0 select-none items-stretch border-b bg-background",
        className
      )}
      style={{
        // OS-controls inset. The mac branch hardcodes the
        // traffic-light width since hidden-titlebar mode doesn't
        // publish env vars. Win/Linux read the WCO env vars; the
        // fallbacks collapse to zero, which is correct when no
        // overlay is active.
        paddingLeft: isMac
          ? `${MAC_TRAFFIC_LIGHT_INSET_PX}px`
          : "env(titlebar-area-x, 0px)",
        // The viewport-based formula reduces to `window_width -
        // safe_zone_width - safe_zone_x`, i.e. the right-side OS-controls
        // strip on LTR Windows/Linux. A partial-width title bar disables this
        // inset and leaves that platform-safe space to its surrounding layout.
        paddingRight:
          isMac || !reserveRightWindowControls
            ? "0px"
            : DESKTOP_WINDOW_CONTROLS_RIGHT_INSET,
      }}
    >
      <div className="flex h-full w-full items-center gap-2 px-3 text-xs text-muted-foreground">
        {leading}
        <NavButtons
          disabled={navigationDisabled}
          hideNavigationTo={hideNavigationTo}
          scope={navigationScope}
        />
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
 * The default shows both directions when either is available. A surface
 * with a dedicated destination control can omit history arrows to that
 * destination. The group needs at least one usable direction to appear.
 *
 * Each button opts out of the drag region via `.desktop-no-drag` — without it
 * the OS would consume the click as a window-move gesture.
 */
function NavButtons({
  disabled = false,
  hideNavigationTo,
  scope,
}: {
  disabled?: boolean;
  hideNavigationTo?: "home";
  scope: nav.Scope;
}) {
  const state = useNavigationState(scope);
  if (!state) return null;
  const showBack =
    !hideNavigationTo || state.back_destination !== hideNavigationTo;
  const showForward =
    !hideNavigationTo || state.forward_destination !== hideNavigationTo;
  if (
    !(showBack && state.can_go_back) &&
    !(showForward && state.can_go_forward)
  )
    return null;
  return (
    <div className="desktop-no-drag -ml-1 flex items-center gap-0.5">
      {showBack && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled || !state.can_go_back}
          onClick={() => void nav.go("back", scope)}
          aria-label="Go back"
          title="Go back"
        >
          <ChevronLeftIcon />
        </Button>
      )}
      {showForward && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled || !state.can_go_forward}
          onClick={() => void nav.go("forward", scope)}
          aria-label="Go forward"
          title="Go forward"
        >
          <ChevronRightIcon />
        </Button>
      )}
    </div>
  );
}
