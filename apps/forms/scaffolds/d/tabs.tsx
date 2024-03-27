"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React from "react";

export function Tabs({ form_id: id }: { form_id: string }) {
  const router = useRouter();
  const pathname = usePathname();

  // path is /d/:id/:tab/~
  const tab = pathname.split("/")[3];

  return (
    <>
      <Link href={`/d/${id}/data`}>
        <Tab selected={tab === "data"}>Data</Tab>
      </Link>
      <Link href={`/d/${id}/blocks`}>
        <Tab selected={tab === "blocks"}>Blocks</Tab>
      </Link>
      <Link href={`/d/${id}/connect`}>
        <Tab selected={tab === "connect"}>Connect</Tab>
      </Link>
      <Link href={`/d/${id}/settings`}>
        <Tab selected={tab === "settings"}>Settings</Tab>
      </Link>
    </>
  );
}

function Tab({
  selected,
  children,
}: React.PropsWithChildren<{
  selected: boolean;
}>) {
  return (
    <button
      data-selected={selected}
      className="
        mx-2 px-2 py-4 border-b-2 border-transparent opacity-50 hover:border-black dark:hover:border-white min-w-10
        data-[selected='true']:border-black
        dark:data-[selected='true']:border-white
        data-[selected='true']:opacity-100
        transition-all
        font-medium text-sm
      "
    >
      {children}
    </button>
  );
}
