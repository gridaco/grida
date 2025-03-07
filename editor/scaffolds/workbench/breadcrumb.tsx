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
import { useEditorState } from "../editor";
import { usePathname } from "next/navigation";
import { ResourceTypeIcon } from "@/components/resource-type-icon";

export function Breadcrumbs() {
  const [state] = useEditorState();
  const pathname = usePathname();

  const {
    organization: { name: org },
    project: { name: proj },
    document_title,
    doctype,
  } = state;

  const [__org, __proj, id, ...paths] = pathname.split("/").slice(1);

  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap">
        <div className="hidden md:block">
          <BreadcrumbItem>
            <BreadcrumbLink
              href={`/${org}/${proj}`}
              className="text-sm text-ellipsis overflow-hidden whitespace-nowrap w-full"
            >
              {proj}
            </BreadcrumbLink>
          </BreadcrumbItem>
        </div>
        <div className="hidden md:block">
          <BreadcrumbSeparator />
        </div>
        <BreadcrumbItem>
          <ResourceTypeIcon
            type={doctype}
            className="inline me-2 align-middle size-3.5 min-w-3.5"
          />
          <BreadcrumbPage className="max-w-[160px] text-ellipsis overflow-hidden whitespace-nowrap w-full">
            <span className="text-sm text-ellipsis overflow-hidden">
              {document_title}
            </span>
          </BreadcrumbPage>
        </BreadcrumbItem>

        <BreadcrumbList className="hidden lg:flex">
          {paths.map((path, i) => (
            <React.Fragment key={i}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-sm">{path}</BreadcrumbPage>
              </BreadcrumbItem>
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
