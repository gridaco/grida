"use client";

import React from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { DesktopDragArea } from "@/host/desktop";
import { usePathname } from "next/navigation";

export default function Header() {
  return (
    <DesktopDragArea className="px-4 flex items-center desktop-title-bar-height border-b bg-sidebar">
      <Breadcrumbs />
    </DesktopDragArea>
  );
}

function Breadcrumbs() {
  const pathname = usePathname();

  const [_, org, proj] = pathname.split("/");

  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem>
          <BreadcrumbLink
            href={`/${org}`}
            className="text-sm text-ellipsis overflow-hidden whitespace-nowrap w-full"
          >
            {org}
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        {proj && (
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-[160px] text-ellipsis overflow-hidden whitespace-nowrap w-full">
              <span className="text-sm text-ellipsis overflow-hidden">
                {proj}
              </span>
            </BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
