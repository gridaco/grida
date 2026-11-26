import "server-only";
import { DesktopCompatibility } from "@grida/desktop-bridge";
import { version as desktopVersion } from "../../../desktop/package.json";

/** The editor takes its compatibility line from the packaged app version. */
export const desktopCompatibility =
  DesktopCompatibility.fromBuildVersion(desktopVersion);
