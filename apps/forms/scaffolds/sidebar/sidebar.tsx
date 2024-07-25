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
  MagicWandIcon,
  LockClosedIcon,
} from "@radix-ui/react-icons";
import Link from "next/link";
import { useEditorState } from "../editor";
import { TabletSmartphoneIcon } from "lucide-react";
import { StripeLogo1, SupabaseLogo, TossLogo } from "@/components/logos";
import { Badge } from "@/components/ui/badge";
import {
  SidebarMenuItem,
  SidebarMenuList,
  SidebarRoot,
  SidebarSection,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { ModeDesign } from "./sidebar-mode-blocks";
import { FormEditorState } from "../editor/state";
import { TableTypeIcon } from "@/components/table-type-icon";
import { editorlink } from "@/lib/forms/url";

export function Siebar({
  mode,
}: {
  mode: "data" | "design" | "connect" | "settings";
}) {
  const [state] = useEditorState();

  const { form_id } = state;
  return (
    <SidebarRoot>
      {mode === "data" && <ModeData />}
      {mode === "design" && <ModeDesign />}
      {mode === "connect" && <ModeConnect />}
      {mode === "settings" && <ModeSettings />}
    </SidebarRoot>
  );
}

function ModeData() {
  const [state] = useEditorState();

  const { form_id, basepath, tables } = state;

  return (
    <>
      <div className="h-5" />
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Table</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          {tables.map((table, i) => {
            return (
              <Link key={i} href={tablehref(basepath, form_id, table.group)}>
                <SidebarMenuItem muted>
                  <TableTypeIcon
                    type={table.group}
                    className="inline align-middle w-4 h-4 me-2"
                  />
                  {table.name}
                </SidebarMenuItem>
              </Link>
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
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>App / Campaign</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          <Link
            href={editorlink("design", {
              basepath,
              form_id,
            })}
          >
            <SidebarMenuItem muted>
              <TabletSmartphoneIcon className="inline align-middle w-4 h-4 me-2" />
              Main
            </SidebarMenuItem>
          </Link>
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
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Analytics</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          <Link
            href={editorlink("data/analytics", {
              basepath,
              form_id,
            })}
          >
            <SidebarMenuItem muted>
              <PieChartIcon className="inline align-middle w-4 h-4 me-2" />
              Realtime
            </SidebarMenuItem>
          </Link>
        </SidebarMenuList>
      </SidebarSection>
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
  return (
    <>
      <div className="h-5" />
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Share</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          <Link href={`/${basepath}/${form_id}/connect/share`}>
            <SidebarMenuItem>
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
            <SidebarMenuItem>
              <EnvelopeClosedIcon className="inline align-middle w-4 h-4 me-2" />
              Channels
            </SidebarMenuItem>
          </Link>
          <Link href={`/${basepath}/${form_id}/connect/customer`}>
            <SidebarMenuItem>
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
            <SidebarMenuItem>
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
            <SidebarMenuItem>
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
      <div className="h-5" />
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Settings</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          <Link
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
          </Link>
        </SidebarMenuList>
      </SidebarSection>
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Developers</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          <Link
            href={editorlink("settings/security", {
              proj: project.name,
              org: organization.name,
              form_id,
            })}
          >
            <SidebarMenuItem>
              <LockClosedIcon className="inline align-middle w-4 h-4 me-2" />
              Data & Security
            </SidebarMenuItem>
          </Link>
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
