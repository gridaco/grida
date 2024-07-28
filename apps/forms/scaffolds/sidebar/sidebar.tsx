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
  HammerIcon,
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
              <HammerIcon className="w-4 h-4" />
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
  const { basepath, project } = state;
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
              href={editorlink("form/edit", { document_id: d.id, basepath })}
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

  const { document_id, basepath, tables } = state;

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
                href={tablehref(basepath, document_id, table.group)}
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
          <Link href="#">
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
  document_id: string,
  type: FormEditorState["tables"][number]["group"]
) {
  switch (type) {
    case "response":
      return `/${basepath}/${document_id}/data/responses`;
    case "customer":
      return `/${basepath}/${document_id}/data/customers`;
    case "x-supabase-main-table":
      return `/${basepath}/${document_id}/data/responses`;
    case "x-supabase-auth.users":
      return `/${basepath}/${document_id}/data/x/auth.users`;
  }
}

function ModeConnect() {
  const [state] = useEditorState();
  const { form_id, document_id: form_document_id, basepath } = state;
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
          <SidebarMenuLink
            href={editorlink("connect/share", {
              document_id: form_document_id,
              basepath,
            })}
          >
            <SidebarMenuItem muted>
              <Link2Icon className="inline align-middle w-4 h-4 me-2" />
              Share
            </SidebarMenuItem>
          </SidebarMenuLink>
          {/* <Link href={`connect/domain`}> */}
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
          <SidebarMenuLink
            href={editorlink("connect/channels", {
              basepath,
              document_id: form_document_id,
            })}
          >
            <SidebarMenuItem muted>
              <EnvelopeClosedIcon className="inline align-middle w-4 h-4 me-2" />
              Channels
            </SidebarMenuItem>
          </SidebarMenuLink>
          <SidebarMenuLink
            href={editorlink("connect/customer", {
              basepath,
              document_id: form_document_id,
            })}
          >
            <SidebarMenuItem muted>
              <AvatarIcon className="inline align-middle w-4 h-4 me-2" />
              Customer Identity
            </SidebarMenuItem>
          </SidebarMenuLink>
        </SidebarMenuList>
      </SidebarSection>
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Commerce</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          <SidebarMenuLink
            href={editorlink("connect/store", {
              basepath,
              document_id: form_document_id,
            })}
          >
            <SidebarMenuItem muted>
              <ArchiveIcon className="inline align-middle w-4 h-4 me-2" />
              Store
            </SidebarMenuItem>
          </SidebarMenuLink>

          {/* <Link href={`connect/pg/stripe`}> */}
          <SidebarMenuItem disabled>
            <StripeLogo1 className="inline align-middle w-4 h-4 me-2" />
            Stripe
            <Badge variant="outline" className="ms-auto">
              soon
            </Badge>
          </SidebarMenuItem>
          {/* </Link> */}
          {/* <Link href={`connect/pg/tosspayments`}> */}
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
          <SidebarMenuLink
            href={editorlink("connect/database/supabase", {
              basepath,
              document_id: form_document_id,
            })}
          >
            <SidebarMenuItem muted>
              <SupabaseLogo className="inline align-middle w-4 h-4 me-2" />
              Supabase
              <Badge variant="outline" className="ms-auto">
                beta
              </Badge>
            </SidebarMenuItem>
          </SidebarMenuLink>
        </SidebarMenuList>
      </SidebarSection>
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Developer</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          {/* <Link href={`connect/parameters`}> */}
          <SidebarMenuItem disabled>
            <CodeIcon className="inline align-middle w-4 h-4 me-2" />
            URL parameters
            <Badge variant="outline" className="ms-auto">
              soon
            </Badge>
          </SidebarMenuItem>
          {/* </Link> */}
          {/* <Link href={`connect/webhooks`}> */}
          <SidebarMenuItem disabled>
            <CodeIcon className="inline align-middle w-4 h-4 me-2" />
            Webhooks
            <Badge variant="outline" className="ms-auto">
              soon
            </Badge>{" "}
          </SidebarMenuItem>
          {/* </Link> */}
          {/* <Link href={`connect/integrations`}> */}
          <SidebarMenuItem disabled>
            <CodeIcon className="inline align-middle w-4 h-4 me-2" />
            Integrations
            <Badge variant="outline" className="ms-auto">
              soon
            </Badge>{" "}
          </SidebarMenuItem>
          {/* </Link> */}
          {/* <Link href={`connect/import`}> */}
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
          {/* <Link href={`settings/api`}> */}
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
