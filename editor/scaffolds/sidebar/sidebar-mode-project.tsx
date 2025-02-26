"use client";
import React from "react";
import { useWorkspace } from "../workspace";
import { NavProjects, projectstree } from "../workspace/sidebar";
import { usePathname } from "next/navigation";

export function ModeProject() {
  const { state } = useWorkspace();
  const { organization } = state;
  const pathName = usePathname();
  const tree = projectstree(state, { pathName, currentOnly: true });
  return (
    <NavProjects
      label="Project"
      orgname={organization.name}
      projects={tree}
      allowNew={false}
    />
  );
}
