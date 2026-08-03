/** GRIDA-SEC-004 — one main-process-owned path fact for durable media. */
import os from "node:os";
import path from "node:path";

export namespace DesktopMediaRoot {
  export type ResolveInput = Readonly<{
    platform: NodeJS.Platform;
    home: string;
    environment: Readonly<NodeJS.ProcessEnv>;
    insiders: boolean;
  }>;

  /**
   * Resolve app-managed media into the platform's durable local-data family,
   * outside the agent's secret home and without deriving from Electron's
   * browser-profile API.
   */
  export function resolve(input: ResolveInput): string {
    const paths = input.platform === "win32" ? path.win32 : path.posix;
    if (!paths.isAbsolute(input.home)) {
      throw new TypeError("media-home-must-be-absolute");
    }

    if (input.platform === "darwin") {
      return paths.join(
        input.home,
        "Library",
        "Application Support",
        productDirectory(input.platform, input.insiders),
        "Media"
      );
    }

    if (input.platform === "win32") {
      const localAppData = absoluteEnvironmentPath(
        paths,
        input.environment.LOCALAPPDATA
      );
      return paths.join(
        localAppData ?? paths.join(input.home, "AppData", "Local"),
        productDirectory(input.platform, input.insiders),
        "Media"
      );
    }

    const xdgDataHome = absoluteEnvironmentPath(
      paths,
      input.environment.XDG_DATA_HOME
    );
    return paths.join(
      xdgDataHome ?? paths.join(input.home, ".local", "share"),
      productDirectory(input.platform, input.insiders),
      "media"
    );
  }

  /**
   * One process-wide path fact shared by the sidecar sandbox grant and native
   * media host. The build-time channel flag keeps Stable and Insiders isolated.
   */
  export const current = resolve({
    platform: process.platform,
    home: os.homedir(),
    environment: process.env,
    insiders: typeof INSIDERS !== "undefined" && INSIDERS === 1,
  });

  function productDirectory(
    platform: NodeJS.Platform,
    insiders: boolean
  ): string {
    if (platform === "darwin" || platform === "win32") {
      return insiders ? "Grida Insiders" : "Grida";
    }
    return insiders ? "grida-insiders" : "grida";
  }

  function absoluteEnvironmentPath(
    paths: path.PlatformPath,
    value: string | undefined
  ): string | undefined {
    const candidate = value?.trim();
    return candidate && paths.isAbsolute(candidate) ? candidate : undefined;
  }
}
