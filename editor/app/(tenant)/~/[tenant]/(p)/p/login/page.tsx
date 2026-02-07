import React from "react";
import PortalLogin from "./login";
import { getLocale } from "@/i18n/server";
import Link from "next/link";
import { createWWWClient, service_role } from "@/lib/supabase/server";
import type { Database, PortalPresetLoginPage } from "@app/database";

type Params = {
  tenant: string;
};

type WwwPublicRow = Database["grida_www"]["Views"]["www_public"]["Row"];

async function fetchPortalTitle(tenant: string): Promise<string> {
  const client = await createWWWClient();

  const { data: wwwPublic } = await client
    .from("www_public")
    .select("title")
    .eq("name", tenant)
    .single()
    .returns<Pick<WwwPublicRow, "title">>();

  return typeof wwwPublic?.title === "string" && wwwPublic.title.trim()
    ? wwwPublic.title
    : "Customer Portal";
}

/**
 * Resolves tenant name -> project_id -> primary portal preset -> login page overrides.
 * Uses service_role because portal_preset requires project_id which is not on www_public.
 */
async function fetchLoginPageOverrides(
  tenant: string
): Promise<PortalPresetLoginPage | null> {
  // Resolve tenant -> project_id
  const { data: www } = await service_role.www
    .from("www")
    .select("project_id")
    .eq("name", tenant)
    .single();

  const projectId = www?.project_id != null ? Number(www.project_id) : null;
  if (!projectId) return null;

  // Fetch primary preset
  const { data } = await service_role.ciam
    .from("portal_preset")
    .select("portal_login_page")
    .eq("project_id", projectId)
    .eq("is_primary", true)
    .limit(1);

  if (!data || data.length === 0) return null;

  const raw = data[0].portal_login_page as PortalPresetLoginPage | null;
  if (!raw || typeof raw !== "object") return null;

  const hasValue = Object.values(raw).some(
    (v) => typeof v === "string" && v.trim().length > 0
  );
  return hasValue ? raw : null;
}

export default async function CustomerPortalLoginPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { tenant } = await params;
  const locale = await getLocale(["en", "ko"]);
  const title = await fetchPortalTitle(tenant);
  const loginPageOverrides = await fetchLoginPageOverrides(tenant);

  return (
    <div className="min-h-svh bg-background flex flex-col">
      <header className="h-14 border-b" data-testid="portal-login-navbar">
        <div className="mx-auto h-full w-full max-w-screen-sm px-6 flex items-center">
          <Link
            href="#"
            className="flex items-center gap-2 min-w-0"
            data-testid="portal-login-navbar-brand-link"
          >
            <span
              className="font-semibold truncate"
              data-testid="portal-login-navbar-title"
            >
              {title}
            </span>
          </Link>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          <PortalLogin locale={locale} overrides={loginPageOverrides} />
        </div>
      </main>
    </div>
  );
}
