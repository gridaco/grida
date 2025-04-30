"use client";
import React from "react";
import { useWorkspace } from "../workspace";
import { NavProjects, projectstree } from "../workspace/sidebar";
import { usePathname } from "next/navigation";

export function ModeProject() {
  const workspace = useWorkspace();
  const { organization } = workspace;
  const pathName = usePathname();
  const tree = projectstree(workspace, { pathName, currentOnly: true });
  return (
    <NavProjects
      label="Project"
      orgname={organization.name}
      projects={tree}
      allowNew={false}
    />
  );
}
