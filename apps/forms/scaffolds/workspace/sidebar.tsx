"use client";

import React from "react";
import Link from "next/link";
import {
  CaretDownIcon,
  DotsHorizontalIcon,
  GearIcon,
  HomeIcon,
  Pencil1Icon,
  PlusIcon,
  TrashIcon,
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
  SidebarHeader,
  SidebarMenuLink,
} from "@/components/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
      <SidebarHeader className="pt-4">
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
      </SidebarHeader>
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
                      <SidebarMenuLink href={`/${organization.name}/${p.name}`}>
                        <SidebarMenuItem key={p.name} muted>
                          <ResourceTypeIcon
                            type="project"
                            className="inline align-middle me-2 w-4 h-4"
                          />
                          {p.name}
                          <SidebarMenuItemActions>
                            <DropdownMenu>
                              <DropdownMenuTrigger>
                                <SidebarMenuItemAction>
                                  <DotsHorizontalIcon className="w-4 h-4" />
                                </SidebarMenuItemAction>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuItem
                                  onClick={() => {
                                    // TODO:
                                    alert("not implemented");
                                  }}
                                >
                                  <Pencil1Icon className="me-2 min-w-4 w-4 h-4 align-middle" />
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    // TODO:
                                    alert("not implemented");
                                  }}
                                >
                                  <TrashIcon className="me-2 min-w-4 w-4 h-4 align-middle text-destructive" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </SidebarMenuItemActions>
                        </SidebarMenuItem>
                      </SidebarMenuLink>

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
