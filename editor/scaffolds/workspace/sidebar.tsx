"use client";
import React, { useMemo } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarMenuBadge,
  SidebarGroupAction,
} from "@/components/ui/sidebar";
import { Home, Settings2, ChevronRight, ChevronDown } from "lucide-react";
import { type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  OrganizationWithAvatar,
  useWorkspace,
  WorkspaceState,
} from "@/scaffolds/workspace";
import { PlusIcon } from "@radix-ui/react-icons";
import { CreateNewProjectDialog } from "./new-project-dialog";
import Link from "next/link";
import { GDocument } from "@/types";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import { editorlink } from "@/lib/forms/url";
import { CreateNewDocumentButton } from "./create-new-document-button";
import { OrganizationAvatar } from "@/components/organization-avatar";
import { createClientWorkspaceClient } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";
import { sitemap } from "@/www/data/sitemap";
import "core-js/features/object/group-by";
import { DarwinSidebarHeaderDragArea } from "../desktop";

function SidebarMenuLinkButton({
  href,
  layout,
  children,
  ...props
}: React.ComponentProps<typeof SidebarMenuButton> & {
  href: string;
  /**
   * If true, the this is a layout link, and also stays selected when the path is a subpath of the href
   */
  layout?: boolean;
}) {
  const pathName = usePathname();

  const selected =
    pathName === href || (layout && pathName.startsWith(href + "/"));

  return (
    <SidebarMenuButton {...props} asChild isActive={selected}>
      <Link href={href}>{children}</Link>
    </SidebarMenuButton>
  );
}

const menu = {
  navMain: [
    // // TODO:
    // {
    //   title: "Search",
    //   url: "#",
    //   icon: Search,
    // },
    {
      title: "Home",
      url: "/dashboard",
      icon: Home,
      isActive: true,
    },
    // TODO:
    // {
    //   title: "Recents",
    //   url: "#",
    //   icon: Clock,
    //   badge: "10",
    // },
  ],
};

export function projectstree(
  state: WorkspaceState,
  { pathName, currentOnly }: { pathName?: string; currentOnly?: boolean }
) {
  const { organization, projects, documents } = state;
  const groups = Object.groupBy(documents, (d) => d.project_id);
  const tree = projects.map((project) => {
    const path = `/${organization.name}/${project.name}`;
    return {
      ...project,
      url: path,
      selected: pathName?.startsWith(path),
      children: (groups[project.id] || []).map((doc) => ({
        ...doc,
        url: editorlink(".", {
          org: organization.name,
          proj: project.name,
          document_id: doc.id,
        }),
      })),
    };
  });

  if (currentOnly) {
    return tree.filter((project) => project.selected);
  }

  return tree;
}

export default function WorkspaceSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { state } = useWorkspace();
  const { loading, organization, organizations, projects, documents } = state;

  const pathName = usePathname();

  const tree = useMemo(() => {
    return projectstree(state, { pathName });
  }, [documents, projects, organization.name, pathName]);

  const settings = {
    title: "Settings",
    icon: Settings2,
    url: `/organizations/${organization.name}/settings`,
    target: "_blank",
  };

  const navSecondary = [
    settings,
    // // TODO:
    // {
    //   title: "Templates",
    //   url: "/templates",
    //   icon: Blocks,
    // },
    // {
    //   title: "Help",
    //   url: "/help",
    //   icon: MessageCircleQuestion,
    // },
  ];

  return (
    <Sidebar className="border-r-0" {...props}>
      <DarwinSidebarHeaderDragArea />
      <SidebarHeader className="desktop-drag-area border-b">
        <OrganizationSwitcher
          organization={organization}
          organizations={organizations}
        />
        <NavMain items={menu.navMain} />
      </SidebarHeader>
      <SidebarContent>
        <NavProjects orgname={organization.name} projects={tree} allowNew />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      {/* <SidebarRail /> */}
    </Sidebar>
  );
}

export function NavProjects({
  orgname,
  projects,
  label = "Projects",
  allowNew,
}: {
  orgname: string;
  label?: string;
  projects: {
    url: string;
    id: number;
    name: string;
    selected?: boolean;
    children: (GDocument & { url: string })[];
  }[];
  allowNew?: boolean;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      {allowNew && (
        <CreateNewProjectDialog org={orgname}>
          <SidebarGroupAction>
            <PlusIcon className="w-4 h-4" />
          </SidebarGroupAction>
        </CreateNewProjectDialog>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {projects.map((project) => (
            <Collapsible
              key={project.name}
              open={project.selected || projects.length === 1 || undefined}
            >
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="sm"
                  asChild
                  isActive={project.selected}
                >
                  <Link href={project.url}>
                    <ResourceTypeIcon
                      type="project"
                      className="inline align-middle w-4 h-4"
                    />
                    <span>{project.name}</span>
                  </Link>
                </SidebarMenuButton>
                <CollapsibleTrigger asChild>
                  <SidebarMenuAction
                    className="left-2 bg-sidebar-accent text-sidebar-accent-foreground data-[state=open]:rotate-90"
                    showOnHover
                  >
                    <ChevronRight />
                  </SidebarMenuAction>
                </CollapsibleTrigger>
                <CreateNewDocumentButton
                  project_name={project.name}
                  project_id={project.id}
                >
                  <SidebarMenuAction showOnHover>
                    <PlusIcon />
                  </SidebarMenuAction>
                </CreateNewDocumentButton>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {project.children.map((page) => (
                      <SidebarMenuSubItem key={page.id}>
                        <SidebarMenuSubButton size="sm" asChild>
                          <Link href={page.url}>
                            <ResourceTypeIcon
                              type={page.doctype}
                              className="inline align-middle w-4 h-4"
                            />
                            <span>{page.title}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function OrganizationSwitcher({
  organization,
  organizations,
}: {
  organization: OrganizationWithAvatar;
  organizations: OrganizationWithAvatar[];
}) {
  const supabase = useMemo(() => createClientWorkspaceClient(), []);
  const onLogoutClick = () => {
    supabase.auth.signOut().then(() => {
      window.location.href = "/";
    });
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton className="w-fit px-1.5">
              <OrganizationAvatar
                className="inline size-6 border shadow-sm rounded"
                avatar_url={organization.avatar_url}
                alt={organization.display_name}
              />
              <span className="truncate font-semibold">
                {organization.display_name}
              </span>
              <ChevronDown className="opacity-50" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-64 rounded-lg"
            align="start"
            side="bottom"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Organizations
            </DropdownMenuLabel>
            {organizations.map((org, index) => (
              <Link key={org.id} href={`/${org.name}`}>
                <DropdownMenuItem className="gap-2 p-2">
                  <OrganizationAvatar
                    className="inline size-6 border shadow-sm rounded"
                    avatar_url={org.avatar_url}
                    alt={org.display_name}
                  />
                  {org.display_name}
                </DropdownMenuItem>
              </Link>
            ))}
            <DropdownMenuSeparator />
            <Link href="/organizations/new">
              <DropdownMenuItem className="gap-2 p-2">
                <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                  <PlusIcon className="size-4" />
                </div>
                <div className="font-medium text-muted-foreground">
                  New Organization
                </div>
              </DropdownMenuItem>
            </Link>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onLogoutClick}>
              <div className="text-xs text-muted-foreground">Log out</div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <Link href={sitemap.links.downlaods} target="_blank">
              <DropdownMenuItem>
                <div className="text-xs text-muted-foreground">
                  Get Desktop App
                </div>
              </DropdownMenuItem>
            </Link>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function NavMain({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon: LucideIcon;
    isActive?: boolean;
  }[];
}) {
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton size="sm" asChild isActive={item.isActive}>
            <a href={item.url}>
              <item.icon />
              <span>{item.title}</span>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

function NavSecondary({
  items,
  ...props
}: {
  items: {
    title: string;
    url: string;
    target?: string;
    icon: LucideIcon;
    badge?: React.ReactNode;
  }[];
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton size="sm" asChild>
                <Link href={item.url} target={item.target}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
              {item.badge && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
