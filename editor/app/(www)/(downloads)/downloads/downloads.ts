import { Octokit, type RestEndpointMethodTypes } from "@octokit/rest";
import { unstable_cache } from "next/cache";
import assert from "assert";

export namespace downloads {
  type GithubReleaseAssets =
    RestEndpointMethodTypes["repos"]["getLatestRelease"]["response"]["data"]["assets"];
  type GithubReleaseAsset = GithubReleaseAssets[number];

  export interface DownloadLinks {
    mac_dmg_arm64: string;
    // Nullable: the editor deploys on merge to main, before the first
    // x64-bearing desktop release is cut (issue #947). A non-null type would
    // make getLinks() throw on the missing asset and getLinksForPage's catch
    // would degrade ALL platforms to the static v0.0.1 fallback during that
    // window. The Intel button is hidden while this is null.
    mac_dmg_x64: string | null;
    linux_deb_x64: string;
    linux_rpm_x64: string;
    linux_deb_arm64: string;
    linux_rpm_arm64: string;
    windows_exe_x64: string;
  }

  export type Platform = "mac" | "windows" | "linux";
  export type Arch = "x64" | "arm64";
  export type Maker = "dmg" | "squirrel.windows" | "deb" | "rpm";

  type Distro = {
    maker: "dmg" | "squirrel.windows" | "deb" | "rpm";
    pattern: string;
    ext: "dmg" | "exe" | "deb" | "rpm";
    arch: {
      arm64?: string | undefined;
      x64?: string | undefined;
    };
  };

  const config: {
    mac: Distro[];
    windows: Distro[];
    linux: Distro[];
  } = {
    mac: [
      {
        maker: "dmg",
        // Grida-0.0.1-arm64.dmg
        pattern: "Grida-[version]-[arch].[ext]",
        ext: "dmg",
        arch: {
          arm64: "arm64",
          x64: "x64",
        },
      },
    ],
    windows: [
      {
        maker: "squirrel.windows",
        // Grida.Setup.0.0.1.x64.exe
        pattern: "Grida.Setup.[version].[arch].[ext]",
        ext: "exe",
        arch: {
          x64: "x64",
        },
      },
    ],
    linux: [
      {
        maker: "deb",
        // grida_0.0.1_arm64.deb
        pattern: "grida_[version]_[arch].[ext]",
        ext: "deb",
        arch: {
          arm64: "arm64",
          x64: "amd64",
        },
      },
      {
        maker: "rpm",
        // Grida-0.0.1-1.x86_64.rpm
        pattern: "Grida-[version]-1.[arch].[ext]",
        ext: "rpm",
        arch: {
          arm64: "arm64",
          x64: "x86_64",
        },
      },
    ],
  };

  export function getDesktopOS(
    userAgent: string
  ): "windows" | "mac" | "linux" | null {
    if (userAgent.includes("Win")) return "windows";
    if (userAgent.includes("Mac")) return "mac";
    if (userAgent.includes("Linux")) return "linux";
    return null;
  }

  export async function getLinks(): Promise<DownloadLinks> {
    const f = new Fetcher();

    const mac_dmg_arm64 = await f.getAsset("mac", "dmg", "arm64");
    // May be absent until the first x64-bearing release ships (issue #947).
    const mac_dmg_x64 = await f.getAsset("mac", "dmg", "x64");
    const linux_deb_x64 = await f.getAsset("linux", "deb", "x64");
    const linux_rpm_x64 = await f.getAsset("linux", "rpm", "x64");
    const linux_deb_arm64 = await f.getAsset("linux", "deb", "arm64");
    const linux_rpm_arm64 = await f.getAsset("linux", "rpm", "arm64");
    const windows_x64 = await f.getAsset("windows", "squirrel.windows", "x64");

    return {
      mac_dmg_arm64: mac_dmg_arm64.browser_download_url,
      mac_dmg_x64: mac_dmg_x64?.browser_download_url ?? null,
      linux_deb_x64: linux_deb_x64.browser_download_url,
      linux_rpm_x64: linux_rpm_x64.browser_download_url,
      linux_deb_arm64: linux_deb_arm64.browser_download_url,
      linux_rpm_arm64: linux_rpm_arm64.browser_download_url,
      windows_exe_x64: windows_x64.browser_download_url,
    };
  }

  export interface DownloadLinksForPage extends DownloadLinks {
    default: {
      platform: Platform;
      maker: Maker;
      arch: Arch;
      url: string;
    } | null;
  }

  function pickDefault(
    os: Platform | null,
    links: DownloadLinks
  ): DownloadLinksForPage["default"] {
    switch (os) {
      case "mac":
        return {
          platform: "mac",
          maker: "dmg",
          arch: "arm64",
          url: links.mac_dmg_arm64,
        };
      case "windows":
        return {
          platform: "windows",
          maker: "squirrel.windows",
          arch: "x64",
          url: links.windows_exe_x64,
        };
      case "linux":
        return {
          platform: "linux",
          maker: "deb",
          arch: "x64",
          url: links.linux_deb_x64,
        };
      default:
        return null;
    }
  }

  // Cached wrapper around getLinks() — hits GitHub's unauthenticated
  // releases endpoint at most ~once per hour per region, keeping the
  // page out of trouble with the 60 req/hr/IP rate limit.
  // `unstable_cache` only memoizes successful resolutions; on throw,
  // the next render re-attempts (so transient API blips self-heal).
  const getCachedLinks = unstable_cache(
    () => getLinks(),
    ["downloads:getLinks"],
    {
      revalidate: 3600,
    }
  );

  /**
   * Page-bound helper: latest-release links + OS-aware default, cached.
   * Falls back to the static v0.0.1 URLs if the GitHub API is unreachable.
   */
  export async function getLinksForPage(
    os: Platform | null
  ): Promise<DownloadLinksForPage> {
    try {
      const links = await getCachedLinks();
      return { ...links, default: pickDefault(os, links) };
    } catch (err) {
      console.warn(
        "[downloads] getLinks failed; falling back to static v0.0.1 links.",
        err
      );
      return getLinks_v001(os);
    }
  }

  /**
   * @deprecated
   * Static fallback used only when the GitHub API is unreachable.
   * Prefer `getLinksForPage()`, which calls this internally on failure.
   */
  export function getLinks_v001(
    platform: Platform | null,
    _arch?: Arch
  ): DownloadLinks & {
    default: {
      platform: Platform;
      maker: Maker;
      arch: Arch;
      url: string;
    } | null;
  } {
    const links: DownloadLinks = {
      mac_dmg_arm64:
        "https://github.com/gridaco/grida/releases/download/v0.0.1/Grida-0.0.1-arm64.dmg",
      mac_dmg_x64:
        "https://github.com/gridaco/grida/releases/download/v0.0.1/Grida-0.0.1-x64.dmg",
      linux_deb_x64:
        "https://github.com/gridaco/grida/releases/download/v0.0.1/grida_0.0.1_amd64.deb",
      linux_rpm_x64:
        "https://github.com/gridaco/grida/releases/download/v0.0.1/Grida-0.0.1-1.x86_64.rpm",
      linux_deb_arm64:
        "https://github.com/gridaco/grida/releases/download/v0.0.1/grida_0.0.1_arm64.deb",
      linux_rpm_arm64:
        "https://github.com/gridaco/grida/releases/download/v0.0.1/Grida-0.0.1-1.arm64.rpm",
      windows_exe_x64:
        "https://github.com/gridaco/grida/releases/download/v0.0.1/Grida.Setup.0.0.1.x64.exe",
    };

    let d: {
      platform: Platform;
      maker: Maker;
      arch: Arch;
      url: string;
    } | null = null;
    switch (platform) {
      case "mac": {
        d = {
          platform: "mac",
          maker: "dmg",
          arch: "arm64",
          url: links.mac_dmg_arm64,
        };
        break;
      }
      case "windows": {
        d = {
          platform: "windows",
          maker: "squirrel.windows",
          arch: "x64",
          url: links.windows_exe_x64,
        };
        break;
      }
      case "linux":
        d = {
          platform: "linux",
          maker: "deb",
          arch: "x64",
          url: links.linux_deb_x64,
        };
        break;
    }

    return {
      default: d,
      mac_dmg_arm64:
        "https://github.com/gridaco/grida/releases/download/v0.0.1/Grida-0.0.1-arm64.dmg",
      mac_dmg_x64:
        "https://github.com/gridaco/grida/releases/download/v0.0.1/Grida-0.0.1-x64.dmg",
      linux_deb_x64:
        "https://github.com/gridaco/grida/releases/download/v0.0.1/grida_0.0.1_amd64.deb",
      linux_rpm_x64:
        "https://github.com/gridaco/grida/releases/download/v0.0.1/Grida-0.0.1-1.x86_64.rpm",
      linux_deb_arm64:
        "https://github.com/gridaco/grida/releases/download/v0.0.1/grida_0.0.1_arm64.deb",
      linux_rpm_arm64:
        "https://github.com/gridaco/grida/releases/download/v0.0.1/Grida-0.0.1-1.arm64.rpm",
      windows_exe_x64:
        "https://github.com/gridaco/grida/releases/download/v0.0.1/Grida.Setup.0.0.1.x64.exe",
    };
  }

  export class Fetcher {
    private m_assets: GithubReleaseAssets | null = null;
    get assets() {
      return this.m_assets;
    }
    private m_tag: string = "";
    get version() {
      // v0.0.1 -> 0.0.1
      return this.m_tag.replace("v", "");
    }

    /**
     * @param init when passed, it won't fetch the latest release
     */
    constructor(init?: { assets: GithubReleaseAssets; tag: string }) {
      if (init) {
        this.m_assets = init.assets;
        this.m_tag = init.tag;
      }
    }

    async fetch() {
      // Memoize: subsequent calls return the same release without re-hitting
      // GitHub. `getLinks()` resolves 6 assets via separate `getAsset` calls;
      // without this, a single cache miss in `getCachedLinks` would burn
      // 6 unauthenticated requests against the 60/hr/IP limit.
      //
      // Failures are memoized as `[]` so the same cap applies on the error
      // path — otherwise `m_assets` stays null and each of the 6 sequential
      // getAsset calls retries the API. `getAsset` already handles the
      // empty-asset case gracefully via its assert+catch, returning null.
      // A fresh Fetcher is created per render, so the error cache is
      // per-render and transient failures self-heal on the next request.
      if (this.m_assets) return this.m_assets;
      try {
        const release = await fetchrelease();
        this.m_tag = release.data.tag_name;
        this.m_assets = release.data.assets;
      } catch {
        this.m_assets = [];
      }
      return this.m_assets;
    }

    async getAssets(
      platform: Platform,
      maker?: Maker,
      arch?: Arch
    ): Promise<GithubReleaseAsset[]> {
      await this.fetch();
      return getAssetsByPlatform(
        this.version,
        this.m_assets!,
        platform,
        maker,
        arch
      );
    }

    async getAsset(
      platform: Platform,
      maker: Maker,
      arch: Arch
    ): Promise<GithubReleaseAsset> {
      try {
        await this.fetch();
        const assets = await getAssetsByPlatform(
          this.version,
          this.m_assets!,
          platform,
          maker,
          arch
        );

        // console.log(assets);
        assert(assets.length === 1);
        return assets[0];
      } catch {
        // oxlint-disable-next-line typescript-eslint/no-explicit-any -- fallback for missing asset
        return null as any;
      }
    }
  }

  async function fetchrelease() {
    const octokit = new Octokit();
    const owner = "gridaco";
    const repo = "grida";
    const release = octokit.repos.getLatestRelease({ owner, repo });
    return release;
  }

  function getAssetsByPlatform(
    version: string,
    assets: GithubReleaseAsset[],
    platform: Platform,
    maker?: Maker,
    arch?: Arch
  ): GithubReleaseAsset[] {
    const validAssets: GithubReleaseAsset[] = [];
    const distros = config[platform];
    if (!distros) return validAssets;

    // Filter by maker if provided
    const filteredDistros = maker
      ? distros.filter((distro) => distro.maker === maker)
      : distros;

    for (const distro of filteredDistros) {
      if (arch) {
        const expectedName = __make_name(distro, {
          version,
          arch,
          ext: distro.ext,
        });
        const asset = assets.find((a) => a.name === expectedName);
        if (asset) validAssets.push(asset);
      } else {
        // Fallback: try all defined arch identifiers in distro.arch
        for (const key in distro.arch) {
          const archIdentifier = (distro.arch as Record<string, string>)[key];
          if (!archIdentifier) continue;
          const expectedName = __make_name(distro, {
            version,
            arch: archIdentifier,
            ext: distro.ext,
          });
          const asset = assets.find((a) => a.name === expectedName);
          if (asset && !validAssets.includes(asset)) {
            validAssets.push(asset);
          }
        }
      }
    }
    return validAssets;
  }

  function __make_name(
    distro: Distro,
    attr: { version: string; arch: string; ext: string }
  ): string | null {
    const archMapping =
      (distro.arch as Record<string, string>)[attr.arch] || null;
    if (!archMapping) return null;
    return distro.pattern
      .replace("[version]", attr.version)
      .replace("[arch]", archMapping)
      .replace("[ext]", attr.ext);
  }
}
