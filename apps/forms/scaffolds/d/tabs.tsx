"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

export function Tabs({
  org,
  proj,
  form_id: id,
}: {
  org: string;
  proj: string;
  form_id: string;
}) {
  const pathname = usePathname();

  // path is /:org/:proj/:id/:tab/~
  const tab = pathname.split("/")[4];

  return (
    <nav className="flex items-center justify-start md:justify-center gap-2">
      <Link href={`/${org}/${proj}/${id}/data`} prefetch={false}>
        <Tab selected={tab === "data"}>Data</Tab>
      </Link>
      <Link href={`/${org}/${proj}/${id}/design`} prefetch={false}>
        <Tab selected={tab === "design"}>Design</Tab>
      </Link>
      <Link href={`/${org}/${proj}/${id}/connect`} prefetch={false}>
        <Tab selected={tab === "connect"}>Connect</Tab>
      </Link>
      <Link href={`/${org}/${proj}/${id}/settings`} prefetch={false}>
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
