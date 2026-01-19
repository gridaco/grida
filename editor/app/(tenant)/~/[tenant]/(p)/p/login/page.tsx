import React from "react";
import PortalLogin from "./login";
import { getLocale } from "@/i18n/server";
import Link from "next/link";
import { createWWWClient } from "@/lib/supabase/server";
import type { Database } from "@app/database";

type Params = {
  tenant: string;
};

type WwwPublicRow = Database["grida_www"]["Views"]["www_public"]["Row"];

async function fetchPortalTitle(tenant: string) {
  const client = await createWWWClient();

  const { data: wwwPublic } = await client
    .from("www_public")
    .select("title")
    .eq("name", tenant)
    .single()
    .returns<Pick<WwwPublicRow, "title">>();

  const title =
    typeof wwwPublic?.title === "string" && wwwPublic.title.trim()
      ? wwwPublic.title
      : "Customer Portal";

  return title;
}

export default async function CustomerPortalLoginPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { tenant } = await params;
  const locale = await getLocale(["en", "ko"]);
  const title = await fetchPortalTitle(tenant);

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
          <PortalLogin locale={locale} />
        </div>
      </main>
    </div>
  );
}
