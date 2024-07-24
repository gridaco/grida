"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React from "react";

export function Tabs({ form_id: id }: { form_id: string }) {
  const router = useRouter();
  const pathname = usePathname();

  // path is /d/:id/:tab/~
  const tab = pathname.split("/")[3];

  return (
    <nav className="flex items-center justify-start md:justify-center gap-2">
      <Link href={`/d/${id}/data`} prefetch={false}>
        <Tab selected={tab === "data"}>Data</Tab>
      </Link>
      <Link href={`/d/${id}/design`} prefetch={false}>
        <Tab selected={tab === "design"}>Design</Tab>
      </Link>
      <Link href={`/d/${id}/connect`} prefetch={false}>
        <Tab selected={tab === "connect"}>Connect</Tab>
      </Link>
      <Link href={`/d/${id}/settings`} prefetch={false}>
        <Tab selected={tab === "settings"}>Settings</Tab>
      </Link>
    </nav>
  );
}

function Tab({
  selected,
  children,
}: React.PropsWithChildren<{
  selected: boolean;
}>) {
  return (
    <div
      data-selected={selected}
      className="
        py-2 border-b-2 border-transparent opacity-50
        data-[selected='true']:border-foreground
        data-[selected='true']:opacity-100
        transition-all
        font-medium text-sm
      "
    >
      <Button variant="ghost">{children}</Button>
    </div>
  );
}
