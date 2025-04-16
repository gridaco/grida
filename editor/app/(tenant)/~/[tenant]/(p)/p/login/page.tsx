"use client";

import React from "react";
import PortalLogin from "@/scaffolds/p/login";
import { useRouter } from "next/navigation";

export default function CustomerPortalLoginPage() {
  const router = useRouter();

  const onSession = () => {
    router.replace(`../session`);
  };

  const sendEmail = async (email: string) => {
    const res = await fetch(`/api/p/access/with-email`, {
      method: "POST",
      body: JSON.stringify({
        email: email,
      }),
    });
    return res.ok;
  };

  const locale = "ko"; // FIXME: i18n

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <PortalLogin
          locale={locale}
          onSession={onSession}
          sendEmail={sendEmail}
        />
      </div>
    </div>
  );
}
