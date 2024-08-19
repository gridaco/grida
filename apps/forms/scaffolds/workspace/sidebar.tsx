"use client";

import React from "react";
import Link from "next/link";
import {
  CaretDownIcon,
  DotsHorizontalIcon,
  GearIcon,
  HomeIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import { OrganizationAvatar } from "@/components/organization-avatar";
import { WorkspaceMenu } from "./org-menu";
import {
  SidebarMenuItem,
  SidebarMenuList,
  SidebarSectionHeaderItem,
  SidebarMenuItemAction,
  SidebarMenuItemActions,
  SidebarSectionHeaderLabel,
  SidebarRoot,
  SidebarSection,
  SidebarMenuItemLabel,
} from "@/components/sidebar";
import { CreateNewProjectDialog } from "./new-project-dialog";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import { useWorkspace } from "./workspace";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";
import { editorlink } from "@/lib/forms/url";

export function WorkspaceSidebar() {
  const { state } = useWorkspace();
  const { loading, organization, projects, documents } = state;

  return (
    <SidebarRoot>
      <header className="sticky top-0 mx-2 pt-4 py-2 bg-background border-b z-10">
        <WorkspaceMenu current={organization.id}>
          <SidebarMenuItem className="py-2">
            <OrganizationAvatar
              className="inline-flex align-middle w-6 h-6 me-2 border rounded"
              avatar_url={organization.avatar_url}
              alt={organization.display_name}
            />
            <span>{organization.display_name}</span>
            <CaretDownIcon className="inline w-4 h-4 ms-2 text-muted-foreground" />
          </SidebarMenuItem>
        </WorkspaceMenu>
        <section className="my-2">
          <ul className="flex flex-col gap-0.5">
            <li>
              <SidebarMenuItem muted>
                <HomeIcon className="inline align-middle me-2 w-4 h-4" />
                <Link href={`/${organization.name}`}>Home</Link>
              </SidebarMenuItem>
            </li>
            {/* <li>
                <MenuItem muted>
                  <MagnifyingGlassIcon className="inline align-middle me-2 w-4 h-4" />
                  <Link href="/dashboard/settings">Search</Link>
                </MenuItem>
              </li> */}
            <li>
              <SidebarMenuItem muted>
                <GearIcon className="inline align-middle me-2 w-4 h-4" />
                <Link href={`/organizations/${organization.name}/settings`}>
                  Settings
                </Link>
              </SidebarMenuItem>
            </li>
          </ul>
        </section>
      </header>
      <div className="h-full">
        <SidebarSection>
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>
              <span>Projects</span>
            </SidebarSectionHeaderLabel>
            <SidebarMenuItemActions>
              <CreateNewProjectDialog org={organization.name}>
                <SidebarMenuItemAction>
                  <PlusIcon className="w-4 h-4" />
                </SidebarMenuItemAction>
              </CreateNewProjectDialog>
            </SidebarMenuItemActions>
          </SidebarSectionHeaderItem>
          <>
            {loading ? (
              <SidebarMenuList className="gap-1.5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className={cn(i % 4 !== 0 ? "ml-2" : "")}>
                    <Skeleton className="w-full h-6" />
                  </div>
                ))}
              </SidebarMenuList>
            ) : (
              <SidebarMenuList>
                {projects.map((p) => {
                  const projectdocs = documents.filter(
                    (d) => d.project_id === p.id
                  );
                  return (
                    <div key={p.id}>
                      <Link href={`/${organization.name}/${p.name}`}>
                        <SidebarMenuItem key={p.name} muted>
                          <ResourceTypeIcon
                            type="project"
                            className="inline align-middle me-2 w-4 h-4"
                          />
                          {p.name}
                          <SidebarMenuItemActions>
                            <SidebarMenuItemAction>
                              <DotsHorizontalIcon className="w-4 h-4" />
                            </SidebarMenuItemAction>
                          </SidebarMenuItemActions>
                        </SidebarMenuItem>
                      </Link>

                      {projectdocs.map((doc, i) => (
                        <Link
                          key={doc.id}
                          href={editorlink(".", {
                            org: organization.name,
                            proj: p.name,
                            document_id: doc.id,
                          })}
                          prefetch={false}
                        >
                          <SidebarMenuItem level={1} muted>
                            <ResourceTypeIcon
                              type={doc.doctype}
                              className="inline align-middle min-w-4 w-4 h-4 me-2"
                            />
                            <SidebarMenuItemLabel>
                              {doc.title}
                            </SidebarMenuItemLabel>
                          </SidebarMenuItem>
                        </Link>
                      ))}
                    </div>
                  );
                })}
              </SidebarMenuList>
            )}
          </>
        </SidebarSection>
      </div>
    </SidebarRoot>
  );
}
