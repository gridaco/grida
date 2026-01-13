import { notFound } from "next/navigation";
import { CustomerSignupTestClient } from "./_page";
import { getLocale } from "@/i18n/server";

export default async function CustomerSignupTestPage() {
  // Test-only page: never expose in hosted environments.
  if (process.env.VERCEL === "1") return notFound();
  const locale = await getLocale(["en", "ko"]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <CustomerSignupTestClient locale={locale} />
      </div>
    </div>
  );
}
