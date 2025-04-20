import React from "react";
import PortalLogin from "./login";
import { getLocale } from "@/i18n/server";

export default async function CustomerPortalLoginPage() {
  const locale = await getLocale(["en", "ko"]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <PortalLogin locale={locale} />
      </div>
    </div>
  );
}
