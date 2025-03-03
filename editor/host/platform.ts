import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { cookies } from "next/headers";

export type Platform =
  | "aix"
  | "android"
  | "darwin"
  | "freebsd"
  | "haiku"
  | "linux"
  | "openbsd"
  | "sunos"
  | "win32"
  | "cygwin"
  | "netbsd";

export type PlatformInfo = {
  application: "desktop" | "web";
  desktop_app_platform: Platform | null;
  desktop_app_version: string | null;
};

/**
 * server only
 * @param cookieStore
 * @returns
 */
export async function getPlatform(
  cookieStore?: ReadonlyRequestCookies
): Promise<PlatformInfo> {
  cookieStore = (await cookieStore) || (await cookies());
  const _grida_desktop_version = cookieStore.get(
    "grida-desktop-version"
  )?.value;

  const _grida_desktop_platform = cookieStore.get(
    "grida-desktop-platform"
  )?.value;

  const application = _grida_desktop_version ? "desktop" : "web";
  return {
    application,
    desktop_app_platform: (_grida_desktop_platform as Platform) ?? null,
    desktop_app_version: _grida_desktop_version ?? null,
  };
}
