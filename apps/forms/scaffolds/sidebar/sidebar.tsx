"use client";

import React from "react";
import {
  AvatarIcon,
  GlobeIcon,
  PieChartIcon,
  ArchiveIcon,
  CodeIcon,
  EnvelopeClosedIcon,
  Link2Icon,
  GearIcon,
  LockClosedIcon,
} from "@radix-ui/react-icons";
import Link from "next/link";
import { useEditorState } from "../editor";
import {
  DatabaseIcon,
  LayersIcon,
  PlugIcon,
  TabletSmartphoneIcon,
} from "lucide-react";
import { StripeLogo1, SupabaseLogo, TossLogo } from "@/components/logos";
import { Badge } from "@/components/ui/badge";
import {
  SidebarMenuItem,
  SidebarMenuItemLabel,
  SidebarMenuLink,
  SidebarMenuList,
  SidebarRoot,
  SidebarSection,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { ModeBlocks, ModeDesign } from "./sidebar-mode-blocks";
import { FormEditorState } from "../editor/state";
import { TableTypeIcon } from "@/components/table-type-icon";
import { editorlink } from "@/lib/forms/url";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "../workspace";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import * as Dialog from "@radix-ui/react-dialog";
import { usePathname } from "next/navigation";

export function Sidebar() {
  const [state, dispatch] = useEditorState();
  const { is_insert_menu_open: is_add_block_panel_open } = state;

  const openInsertMenu = (open: boolean) => {
    dispatch({
      type: "editor/panels/insert-menu",
      open: open,
    });
  };

  if (is_add_block_panel_open) {
    return (
      <Dialog.Root open={is_add_block_panel_open} onOpenChange={openInsertMenu}>
        <Dialog.Content>
          <SidebarRoot>
            <ModeBlocks />
          </SidebarRoot>
        </Dialog.Content>
      </Dialog.Root>
    );
  }

  return (
    <SidebarRoot>
      <Tabs defaultValue="design">
        <header className="sticky h-12 px-2 flex justify-center items-center top-0 bg-background border-b z-10">
          <TabsList className="w-full max-w-full">
            <TabsTrigger value="documents">
              <ResourceTypeIcon type="project" className="w-4 h-4" />
            </TabsTrigger>
            <TabsTrigger value="design">
              <LayersIcon className="w-4 h-4" />
            </TabsTrigger>
            <TabsTrigger value="data">
              <DatabaseIcon className="w-4 h-4" />
            </TabsTrigger>
            <TabsTrigger value="connect">
              <PlugIcon className="w-4 h-4" />
            </TabsTrigger>
          </TabsList>
        </header>
        <TabsContent value="documents">
          <ModeDocuments />
        </TabsContent>
        <TabsContent value="data">
          <ModeData />
        </TabsContent>
        <TabsContent value="design">
          <ModeDesign />
        </TabsContent>
        <TabsContent value="connect">
          <ModeConnect />
        </TabsContent>
      </Tabs>
    </SidebarRoot>
  );
}

function ModeDocuments() {
  const { state: workspace } = useWorkspace();
  const { documents } = workspace;
  const [state] = useEditorState();
  const { form_id, basepath, form_title, project } = state;
  const current_project_documents = documents.filter(
    (d) => d.project_id === project.id
  );
  return (
    <>
      <ModeDesign />
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>{project.name}</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          {current_project_documents.map((d) => (
            <Link
              key={d.id}
              href={editorlink("form/edit", { form_id: d.form_id!, basepath })}
            >
              <SidebarMenuItem muted>
                <ResourceTypeIcon
                  type={d.doctype}
                  className="inline align-middle min-w-4 w-4 h-4 me-2"
                />
                <SidebarMenuItemLabel>{d.title}</SidebarMenuItemLabel>
              </SidebarMenuItem>
            </Link>
          ))}
        </SidebarMenuList>
      </SidebarSection>
    </>
  );
}

function ModeData() {
  const [state] = useEditorState();

  const { form_id, basepath, tables } = state;

  return (
    <>
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Tables</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          {tables.map((table, i) => {
            return (
              <SidebarMenuLink
                key={i}
                href={tablehref(basepath, form_id, table.group)}
              >
                <SidebarMenuItem muted>
                  <TableTypeIcon
                    type={table.group}
                    className="inline align-middle w-4 h-4 me-2"
                  />
                  {table.name}
                </SidebarMenuItem>
              </SidebarMenuLink>
            );
          })}
          {/* <li>
          <Link href={`/${basepath}/${form_id}/data/files`}>
            <SideNavItem>
              <FileIcon className="w-4 h-4" />
              Files
            </SideNavItem>
          </Link>
        </li> */}
        </SidebarMenuList>
      </SidebarSection>

      {/* <label className="text-xs text-muted-foreground py-4 px-4">
        Commerce
      </label>
      <li>
        <Link
          href={editorlink("connect/store/orders", {
            org: organization.name,
            proj: project.name,
            form_id,
          })}
        >
          <SideNavItem>
            <ArchiveIcon />
            Orders
          </SideNavItem>
        </Link>
      </li>
      <li>
        <Link
          href={editorlink("connect/store/products", {
            org: organization.name,
            proj: project.name,
            form_id,
          })}
        >
          <SideNavItem>
            <ArchiveIcon />
            Inventory
          </SideNavItem>
        </Link>
      </li> */}
    </>
  );
}

function tablehref(
  basepath: string,
  form_id: string,
  type: FormEditorState["tables"][number]["group"]
) {
  switch (type) {
    case "response":
      return `/${basepath}/${form_id}/data/responses`;
    case "customer":
      return `/${basepath}/${form_id}/data/customers`;
    case "x-supabase-main-table":
      return `/${basepath}/${form_id}/data/responses`;
    case "x-supabase-auth.users":
      return `/${basepath}/${form_id}/data/x/auth.users`;
  }
}

function ModeConnect() {
  const [state] = useEditorState();
  const { form_id, basepath } = state;
  const pathname = usePathname();
  return (
    <>
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Share</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          <Link href={`/${basepath}/${form_id}/connect/share`}>
            <SidebarMenuItem
              muted
              selected={`/${basepath}/${form_id}/connect/share` === pathname}
            >
              <Link2Icon className="inline align-middle w-4 h-4 me-2" />
              Share
            </SidebarMenuItem>
          </Link>
          {/* <Link href={`/${basepath}/${form_id}/connect/domain`}> */}
          <SidebarMenuItem disabled>
            <GlobeIcon className="inline align-middle w-4 h-4 me-2" />
            Domain
            <Badge variant="outline" className="ms-auto">
              enterprise
            </Badge>
          </SidebarMenuItem>
          {/* </Link> */}
        </SidebarMenuList>
      </SidebarSection>
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Customer</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          <Link href={`/${basepath}/${form_id}/connect/channels`}>
            <SidebarMenuItem muted>
              <EnvelopeClosedIcon className="inline align-middle w-4 h-4 me-2" />
              Channels
            </SidebarMenuItem>
          </Link>
          <Link href={`/${basepath}/${form_id}/connect/customer`}>
            <SidebarMenuItem muted>
              <AvatarIcon className="inline align-middle w-4 h-4 me-2" />
              Customer Identity
            </SidebarMenuItem>
          </Link>
        </SidebarMenuList>
      </SidebarSection>
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Commerce</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          <Link href={`/${basepath}/${form_id}/connect/store`}>
            <SidebarMenuItem muted>
              <ArchiveIcon className="inline align-middle w-4 h-4 me-2" />
              Store
            </SidebarMenuItem>
          </Link>

          {/* <Link href={`/${basepath}/${id}/connect/pg/stripe`}> */}
          <SidebarMenuItem disabled>
            <StripeLogo1 className="inline align-middle w-4 h-4 me-2" />
            Stripe
            <Badge variant="outline" className="ms-auto">
              soon
            </Badge>
          </SidebarMenuItem>
          {/* </Link> */}
          {/* <Link href={`/${basepath}/${id}/connect/pg/tosspayments`}> */}
          <SidebarMenuItem disabled>
            <TossLogo className="inline align-middle w-4 h-4 me-2" />
            Toss
            <Badge variant="outline" className="ms-auto">
              enterprise
            </Badge>
          </SidebarMenuItem>
          {/* </Link> */}
        </SidebarMenuList>
      </SidebarSection>
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Database</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          <Link href={`/${basepath}/${form_id}/connect/database/supabase`}>
            <SidebarMenuItem muted>
              <SupabaseLogo className="inline align-middle w-4 h-4 me-2" />
              Supabase
              <Badge variant="outline" className="ms-auto">
                beta
              </Badge>
            </SidebarMenuItem>
          </Link>
        </SidebarMenuList>
      </SidebarSection>
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Developer</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          {/* <Link href={`/${basepath}/${id}/connect/parameters`}> */}
          <SidebarMenuItem disabled>
            <CodeIcon className="inline align-middle w-4 h-4 me-2" />
            URL parameters
            <Badge variant="outline" className="ms-auto">
              soon
            </Badge>
          </SidebarMenuItem>
          {/* </Link> */}
          {/* <Link href={`/${basepath}/${id}/connect/webhooks`}> */}
          <SidebarMenuItem disabled>
            <CodeIcon className="inline align-middle w-4 h-4 me-2" />
            Webhooks
            <Badge variant="outline" className="ms-auto">
              soon
            </Badge>{" "}
          </SidebarMenuItem>
          {/* </Link> */}
          {/* <Link href={`/${basepath}/${id}/connect/integrations`}> */}
          <SidebarMenuItem disabled>
            <CodeIcon className="inline align-middle w-4 h-4 me-2" />
            Integrations
            <Badge variant="outline" className="ms-auto">
              soon
            </Badge>{" "}
          </SidebarMenuItem>
          {/* </Link> */}
          {/* <Link href={`/${basepath}/${form_id}/connect/import`}> */}
          <SidebarMenuItem disabled>
            <CodeIcon className="inline align-middle w-4 h-4 me-2" />
            Import Data
            <Badge variant="outline" className="ms-auto">
              soon
            </Badge>{" "}
          </SidebarMenuItem>
          {/* </Link> */}
        </SidebarMenuList>
      </SidebarSection>
    </>
  );
}

function ModeSettings() {
  const [state] = useEditorState();
  const { form_id, organization, project } = state;
  return (
    <>
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Settings</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          {/* <Link
            href={editorlink("settings/general", {
              proj: project.name,
              org: organization.name,
              form_id,
            })}
          >
            <SidebarMenuItem>
              <GearIcon className="inline align-middle w-4 h-4 me-2" />
              General
            </SidebarMenuItem>
          </Link> */}
        </SidebarMenuList>
      </SidebarSection>
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Developers</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          {/* <Link href={`/${basepath}/${id}/settings/api`}> */}
          <SidebarMenuItem disabled>
            <CodeIcon className="inline align-middle w-4 h-4 me-2" />
            API Keys
            <Badge variant="outline" className="ms-auto">
              enterprise
            </Badge>
          </SidebarMenuItem>
          {/* </Link> */}
        </SidebarMenuList>
      </SidebarSection>
    </>
  );
}
