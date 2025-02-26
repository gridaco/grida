import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { cookies } from "next/headers";

/**
 * server only
 * @param cookieStore
 * @returns
 */
export async function getPlatform(cookieStore?: ReadonlyRequestCookies) {
  cookieStore = (await cookieStore) || (await cookies());
  const _grida_desktop_version = cookieStore.get(
    "grida-desktop-version"
  )?.value;
  const platform = _grida_desktop_version ? "desktop" : "web";
  return {
    platform,
    desktop_app_version: _grida_desktop_version,
  };
}
