import { DesktopCompatibility } from "@grida/desktop-bridge";

const LATEST_RELEASE_URL =
  "https://api.github.com/repos/gridaco/grida/releases/latest";
const RELEASE_TIMEOUT_MS = 5_000;
const RELEASE_MAX_BYTES = 256 * 1024;

const packageArchitectures = {
  x64: { deb: "amd64", rpm: "x86_64" },
  arm64: { deb: "arm64", rpm: "arm64" },
} as const;

/** Linux has no Electron update feed. Manual checks use the published release. */
export namespace DesktopLinuxUpdates {
  export async function latestVersion(
    arch: string,
    fetch: (url: string, init: RequestInit) => Promise<Response>
  ): Promise<string | null> {
    if (arch !== "x64" && arch !== "arm64") return null;
    try {
      const response = await fetch(LATEST_RELEASE_URL, {
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(RELEASE_TIMEOUT_MS),
      });
      if (
        !response.ok ||
        !response.headers.get("content-type")?.startsWith("application/json") ||
        !response.body
      ) {
        void response.body?.cancel().catch(() => {});
        return null;
      }

      const reader = response.body.getReader();
      const bytes = new Uint8Array(RELEASE_MAX_BYTES);
      let length = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (length + value.length > bytes.length) {
          void reader.cancel().catch(() => {});
          return null;
        }
        bytes.set(value, length);
        length += value.length;
      }
      return readRelease(
        JSON.parse(new TextDecoder().decode(bytes.subarray(0, length))),
        arch
      );
    } catch {
      return null;
    }
  }

  function readRelease(
    value: unknown,
    arch: keyof typeof packageArchitectures
  ): string | null {
    if (typeof value !== "object" || value === null) return null;
    const { draft, prerelease, tag_name, assets } = value as Record<
      string,
      unknown
    >;
    if (
      draft !== false ||
      prerelease !== false ||
      typeof tag_name !== "string" ||
      !tag_name.startsWith("v") ||
      !Array.isArray(assets)
    ) {
      return null;
    }
    const version = tag_name.slice(1);
    if (!DesktopCompatibility.releaseUrl(version)) return null;

    // Keep these filenames aligned with the Desktop release assembler.
    const { deb, rpm } = packageArchitectures[arch];
    const names = [
      `grida_${version}_${deb}.deb`,
      `Grida-${version}-1.${rpm}.rpm`,
    ];
    const available = new Set(
      assets.flatMap((asset: unknown) => {
        if (typeof asset !== "object" || asset === null) return [];
        const { name, state, size } = asset as Record<string, unknown>;
        return typeof name === "string" &&
          state === "uploaded" &&
          typeof size === "number" &&
          size > 0
          ? [name]
          : [];
      })
    );
    return names.every((name) => available.has(name)) ? version : null;
  }
}
