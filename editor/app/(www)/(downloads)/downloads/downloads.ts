import { Octokit, type RestEndpointMethodTypes } from "@octokit/rest";
import assert from "assert";

export namespace downloads {
  type GithubReleaseAssets =
    RestEndpointMethodTypes["repos"]["getLatestRelease"]["response"]["data"]["assets"];
  type GithubReleaseAsset = GithubReleaseAssets[number];

  export interface DownloadLinks {
    mac_dmg_x64: string;
    mac_dmg_arm64: string;
    mac_dmg_universal: string;
    linux_deb_x64: string;
    linux_rpm_x64: string;
    linux_deb_arm64: string;
    linux_rpm_arm64: string;
    windows_exe_x64: string;
  }

  export type Platform = "mac" | "windows" | "linux";
  export type Arch = "x64" | "arm64" | "universal";
  export type Maker = "dmg" | "squirrel.windows" | "deb" | "rpm";

  const content_types = {
    dmg: "application/x-apple-diskimage",
    exe: "application/x-msdos-program",
    deb: "application/x-debian-package",
    rpm: "application/x-redhat-package-manager",
  };

  type Distro = {
    maker: "dmg" | "squirrel.windows" | "deb" | "rpm";
    pattern: string;
    ext: "dmg" | "exe" | "deb" | "rpm";
    arch: {
      arm64?: string | undefined;
      universal?: string | undefined;
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
          universal: "universal",
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

    const mac_dmg_x64 = await f.getAsset("mac", "dmg", "x64");
    const mac_dmg_arm64 = await f.getAsset("mac", "dmg", "arm64");
    const mac_dmg_universal = await f.getAsset("mac", "dmg", "universal");
    const linux_deb_x64 = await f.getAsset("linux", "deb", "x64");
    const linux_rpm_x64 = await f.getAsset("linux", "rpm", "x64");
    const linux_deb_arm64 = await f.getAsset("linux", "deb", "arm64");
    const linux_rpm_arm64 = await f.getAsset("linux", "rpm", "arm64");
    const windows_x64 = await f.getAsset("windows", "squirrel.windows", "x64");

    return {
      mac_dmg_x64: mac_dmg_x64.browser_download_url,
      mac_dmg_arm64: mac_dmg_arm64.browser_download_url,
      mac_dmg_universal: mac_dmg_universal.browser_download_url,
      linux_deb_x64: linux_deb_x64.browser_download_url,
      linux_rpm_x64: linux_rpm_x64.browser_download_url,
      linux_deb_arm64: linux_deb_arm64.browser_download_url,
      linux_rpm_arm64: linux_rpm_arm64.browser_download_url,
      windows_exe_x64: windows_x64.browser_download_url,
    };
  }

  /**
   * @deprecated
   * temporary static version of getLinks, until we find a reliable way to fetch release without rate limiting
   */
  export function getLinks_v001(
    platform: Platform | null,
    arch?: Arch
  ): DownloadLinks & {
    default: {
      platform: Platform;
      maker: Maker;
      arch: Arch;
      url: string;
    } | null;
  } {
    const links: DownloadLinks = {
      mac_dmg_x64:
        "https://github.com/gridaco/grida/releases/download/v0.0.1/Grida-0.0.1-x64.dmg",
      mac_dmg_arm64:
        "https://github.com/gridaco/grida/releases/download/v0.0.1/Grida-0.0.1-arm64.dmg",
      mac_dmg_universal:
        "https://github.com/gridaco/grida/releases/download/v0.0.1/Grida-0.0.1-universal.dmg",
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
          arch: "universal",
          url: links.mac_dmg_universal,
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
      mac_dmg_x64:
        "https://github.com/gridaco/grida/releases/download/v0.0.1/Grida-0.0.1-x64.dmg",
      mac_dmg_arm64:
        "https://github.com/gridaco/grida/releases/download/v0.0.1/Grida-0.0.1-arm64.dmg",
      mac_dmg_universal:
        "https://github.com/gridaco/grida/releases/download/v0.0.1/Grida-0.0.1-universal.dmg",
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
      if (this.m_assets) this.m_assets;
      const release = await fetchrelease();
      this.m_tag = release.data.tag_name;
      this.m_assets = release.data.assets;
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
      } catch (e) {
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
