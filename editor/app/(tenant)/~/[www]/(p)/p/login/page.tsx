"use client";

import React from "react";
import PortalLogin from "@/scaffolds/p/login";
import { useRouter } from "next/navigation";

type Params = {
  www: string;
};

export default function CustomerPortalLoginPage({
  params,
}: {
  params: Params;
}) {
  const { www } = params;
  const router = useRouter();

  const onSession = () => {
    router.replace(`../session`);
  };

  const locale = "ko"; // FIXME:

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <PortalLogin locale={locale} www={www} onSession={onSession} />
      </div>
    </div>
  );
}
