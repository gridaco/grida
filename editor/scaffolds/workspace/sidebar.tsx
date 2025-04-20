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
import {
  Home,
  Settings2,
  ChevronRight,
  ChevronDown,
  Trash2Icon,
} from "lucide-react";
import { type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { useWorkspace, WorkspaceState } from "@/scaffolds/workspace";
import {
  DotsHorizontalIcon,
  GearIcon,
  Pencil2Icon,
  PlusIcon,
} from "@radix-ui/react-icons";
import { CreateNewProjectDialog } from "./new-project-dialog";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import { editorlink } from "@/lib/forms/url";
import { CreateNewDocumentButton } from "./create-new-document-button";
import { OrganizationAvatar } from "@/components/organization-avatar";
import { createBrowserClient } from "@/lib/supabase/client";
import { usePathname, useRouter } from "next/navigation";
import { sitemap } from "@/www/data/sitemap";
import { DarwinSidebarHeaderDragArea } from "../desktop";
import { Badge } from "@/components/ui/badge";
import { Labels } from "@/k/labels";
import { Button } from "@/components/ui/button";
import { ShineBorder } from "@/www/ui/shine-border";
import type {
  GDocument,
  OrganizationWithAvatar,
  OrganizationWithMembers,
  PlatformPricingTier,
} from "@/types";
import Link from "next/link";
import "core-js/features/object/group-by";
import {
  DeleteConfirmationAlertDialog,
  DeleteConfirmationSnippet,
} from "@/components/dialogs/delete-confirmation-dialog";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { RenameDialog } from "@/components/dialogs/rename-dialog";

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
      selected: pathName === path || pathName?.startsWith(path + "/"),
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
  const workspace = useWorkspace();
  const { loading, organization, organizations, projects, documents } =
    workspace;

  const pathName = usePathname();

  const tree = useMemo(() => {
    return projectstree(workspace, { pathName });
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
        <SidebarGroup className="mt-auto">
          <PricingTierCard organization={organization} />
        </SidebarGroup>
        <NavSecondary items={navSecondary} />
      </SidebarContent>
      {/* <SidebarRail /> */}
    </Sidebar>
  );
}

function PricingTierCard({
  organization,
}: {
  organization: OrganizationWithAvatar & OrganizationWithMembers;
}) {
  const { display_plan: tier, members } = organization;
  const ENTERPRISE_DEFAULT_SEATS = 5;
  const label = Labels.priceTier(tier);
  const isFree = tier === "free";
  const isEnterprise = tier === "v0_enterprise";
  const isTeam = tier === "v0_team";
  const canUpgrade = !isEnterprise && !isTeam;

  const tierMessages: Record<PlatformPricingTier, string> = {
    free: "You're currently on the Free Plan. Upgrade to unlock premium features!",
    v0_pro:
      "Thanks for being a Pro user! You're accessing advanced capabilities.",
    v0_team: "You're on our Team plan, optimized for collaboration.",
    v0_enterprise:
      "You're on Enterprise Plan—thank you for your continued partnership",
  };

  const message = tierMessages[tier] ?? `Thanks for subscribing to ${label}!`;

  return (
    <div className="relative rounded-lg border p-3">
      {!canUpgrade && (
        <ShineBorder shineColor={["#A07CFE", "#FE8FB5", "#FFBE7B"]} />
      )}
      <div className="flex items-center justify-between mb-2">
        {canUpgrade && <h3 className="text-sm font-semibold">Current Plan</h3>}
        <Badge variant="outline">{label}</Badge>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{message}</p>
      {canUpgrade && (
        <Link href={sitemap.links.pricing} target="_blank">
          <Button size="xs" variant="outline">
            Upgrade Plan
          </Button>
        </Link>
      )}
      {isEnterprise && (
        <Link href={sitemap.links.contact} target="_blank">
          <Button size="xs" variant="outline">
            Arrange Dedicated Support
          </Button>
        </Link>
      )}
      {isEnterprise && (
        <div className="mt-3 grid gap-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <label>Seats</label>
            <label
              data-state={
                members.length >= ENTERPRISE_DEFAULT_SEATS ? "over" : "under"
              }
              className="data-[state=over]:text-workbench-accent-orange"
            >
              ({members.length}/{ENTERPRISE_DEFAULT_SEATS})
            </label>
          </div>
          <div className="w-full">
            <Progress
              value={Math.min(
                (members.length / ENTERPRISE_DEFAULT_SEATS) * 100,
                100
              )}
            />
          </div>
        </div>
      )}
    </div>
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
  const router = useRouter();
  const client = useMemo(() => createBrowserClient(), []);

  const deleteProjectDialog = useDialogState<{
    id: number;
    match: string;
  }>("delete-project", {
    refreshkey: true,
  });
  const renameProjectDialog = useDialogState<{
    id: number;
    name: string;
  }>("rename-project", {
    refreshkey: true,
  });

  return (
    <SidebarGroup>
      <RenameDialog
        key={renameProjectDialog.refreshkey}
        open={renameProjectDialog.open}
        onOpenChange={renameProjectDialog.setOpen}
        id={renameProjectDialog.data?.id?.toString() ?? ""}
        title="Rename Project"
        description="Enter a new name for this project."
        currentName={renameProjectDialog.data?.name}
        onRename={async (id: string, newName: string): Promise<boolean> => {
          const { count } = await client
            .from("project")
            .update({ name: newName }, { count: "exact" })
            .eq("id", parseInt(id));
          return count === 1;
          // TODO: needs to revalidate
        }}
      />
      <DeleteConfirmationAlertDialog
        key={deleteProjectDialog.refreshkey}
        {...deleteProjectDialog.props}
        title="Delete Project"
        description={
          <>
            This action cannot be undone. All resources including files,
            customers, and tables under this project will be permanently
            deleted. Type{" "}
            <DeleteConfirmationSnippet>
              {deleteProjectDialog.data?.match}
            </DeleteConfirmationSnippet>{" "}
            to delete this project.
          </>
        }
        placeholder={deleteProjectDialog.data?.match}
        match={deleteProjectDialog.data?.match}
        onDelete={async ({ id }) => {
          const { count, error } = await client
            .from("project")
            .delete({ count: "exact" })
            .eq("id", id);
          if (error) return false;
          if (count === 1) {
            // TODO: needs to revalidate
            router.replace(`/${orgname}`);
            return true;
          }
          return false;
        }}
      />
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuAction showOnHover>
                      <DotsHorizontalIcon />
                    </SidebarMenuAction>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="start">
                    <CreateNewDocumentButton
                      project_name={project.name}
                      project_id={project.id}
                    >
                      <DropdownMenuItem>
                        <PlusIcon className="mr-2" />
                        <span>New Document</span>
                      </DropdownMenuItem>
                    </CreateNewDocumentButton>
                    <DropdownMenuItem
                      onSelect={() => {
                        renameProjectDialog.openDialog({
                          id: project.id,
                          name: project.name,
                        });
                      }}
                    >
                      <Pencil2Icon className="mr-2" />
                      <span>Rename</span>
                    </DropdownMenuItem>
                    <Link href={`/${orgname}/${project.name}/dash`}>
                      <DropdownMenuItem>
                        <GearIcon className="mr-2" />
                        <span>Console</span>
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => {
                        deleteProjectDialog.openDialog({
                          id: project.id,
                          match: `DELETE ${project.name}`,
                        });
                      }}
                      className="text-destructive"
                    >
                      <Trash2Icon className="size-3.5 me-2" />
                      <span>Delete Project</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <CollapsibleContent>
                  <SidebarMenuSub>
                    {project.children.length === 0 && (
                      <SidebarMenuSubItem>
                        <span className="text-xs text-muted-foreground">
                          No documents inside
                        </span>
                      </SidebarMenuSubItem>
                    )}
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
  const supabase = useMemo(() => createBrowserClient(), []);
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
                  <Badge
                    variant="outline"
                    className="ms-auto text-xs px-1.5 py-0.5 font-normal text-muted-foreground"
                  >
                    {Labels.priceTier(org.display_plan)}
                  </Badge>
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
