/** Renderer client for the optional native browser capability. */
import { DesktopBrowser } from "@grida/desktop-bridge";
import { getDesktopBridge } from "./bridge";

export namespace Browser {
  export function getBridge(): DesktopBrowser.Bridge | null {
    const bridge = getDesktopBridge();
    return bridge?.caps.native.browser &&
      bridge.browser?.version === DesktopBrowser.VERSION
      ? bridge.browser
      : null;
  }

  export function isSupported(): boolean {
    return getBridge() !== null;
  }

  export async function confirmClearSession(): Promise<boolean> {
    const bridge = getDesktopBridge();
    if (!bridge) return false;
    return (
      (await bridge.dialog.confirm({
        message: "Clear this workspace’s browser data?",
        detail:
          "Closes browser pages for this workspace in every window and clears cookies, cache and website storage. You may need to sign in to websites again.",
        buttons: ["Clear Browser Data", "Cancel"],
        default_id: 1,
        cancel_id: 1,
      })) === 0
    );
  }

  /** Address entry accepts explicit URLs and familiar hostname input. */
  export function address(value: string): string | null {
    const input = value.trim();
    if (!input) return null;
    const explicit = DesktopBrowser.normalizeUrl(input);
    if (explicit) return explicit;
    if (
      /^[a-z][a-z0-9+.-]*:/i.test(input) &&
      !/^[^/:\s]+:\d+(?:\/|$)/.test(input)
    )
      return null;
    const local = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(?::|\/|$)/i.test(
      input
    );
    return DesktopBrowser.normalizeUrl(
      `${local ? "http" : "https"}://${input}`
    );
  }
}
