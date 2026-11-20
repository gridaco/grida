import "server-only";
import { DesktopCompatibility } from "@grida/desktop-bridge";
import { version as desktopVersion } from "../../../desktop/package.json";

/** The editor and the packaged app take their version from the same manifest. */
export const desktopCompatibility = DesktopCompatibility.parse({
  desktopVersion,
});
