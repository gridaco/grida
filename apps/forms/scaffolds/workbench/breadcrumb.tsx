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

export function Breadcrumbs() {
  const [state] = useEditorState();
  const pathname = usePathname();

  const {
    organization: { name: org },
    project: { name: proj },
    document_title,
  } = state;

  const [__org, __proj, id, ...paths] = pathname.split("/").slice(1);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href={`/${org}/${proj}`}>{proj}</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{document_title}</BreadcrumbPage>
        </BreadcrumbItem>
        {paths.map((path, i) => (
          <React.Fragment key={i}>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{path}</BreadcrumbPage>
            </BreadcrumbItem>
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
