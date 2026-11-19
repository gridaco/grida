import "server-only";
import { DesktopCompatibility } from "@grida/desktop-bridge";

/** The running deployment publishes the same policy to Main and its renderer. */
export function readDesktopCompatibilityPolicy(): DesktopCompatibility.Policy | null {
  return DesktopCompatibility.parse({
    minimumSupportedVersion: process.env.GRIDA_DESKTOP_MINIMUM_VERSION ?? null,
    updateVersion: process.env.GRIDA_DESKTOP_UPDATE_VERSION ?? null,
  });
}
