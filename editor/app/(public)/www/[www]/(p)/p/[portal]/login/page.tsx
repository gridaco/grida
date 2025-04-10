"use client";

import React from "react";
import PortalLogin from "@/scaffolds/p/login";
import { useRouter } from "next/navigation";

type Params = {
  portal: string;
};

export default function CustomerPortalLoginPage({
  params,
}: {
  params: Params;
}) {
  const { portal } = params;
  const router = useRouter();

  const onSession = () => {
    router.replace(`../${portal}/session`);
  };

  const locale = "ko"; // FIXME:

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <PortalLogin locale={locale} policy={portal} onSession={onSession} />
      </div>
    </div>
  );
}
