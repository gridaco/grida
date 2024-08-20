"use client";

import React from "react";
import {
  AvatarIcon,
  GlobeIcon,
  ArchiveIcon,
  CodeIcon,
  EnvelopeClosedIcon,
  Link2Icon,
} from "@radix-ui/react-icons";
import { useEditorState } from "../editor";
import {
  PostgreSQL,
  StripeLogo1,
  SupabaseLogo,
  TossLogo,
} from "@/components/logos";
import { Badge } from "@/components/ui/badge";
import {
  SidebarMenuItem,
  SidebarMenuLink,
  SidebarMenuList,
  SidebarSection,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { editorlink } from "@/lib/forms/url";

export function ModeConnect() {
  const [state] = useEditorState();
  const { doctype } = state;

  switch (doctype) {
    case "v0_form":
      return <DoctypeForms />;
    case "v0_schema":
      return <DoctypeDatabase />;
    default:
      return <></>;
  }
}

function DoctypeForms() {
  const [state] = useEditorState();
  const { document_id: form_document_id, basepath } = state;

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
              <Badge variant="outline" className="ms-auto">
                alpha
              </Badge>
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
      <SectionXDatabase />
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Developer</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          <SidebarMenuLink
            href={editorlink("connect/parameters", {
              document_id: form_document_id,
              basepath: basepath,
            })}
          >
            <SidebarMenuItem>
              <CodeIcon className="inline align-middle w-4 h-4 me-2" />
              URL parameters
            </SidebarMenuItem>
          </SidebarMenuLink>
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

function DoctypeDatabase() {
  return (
    <>
      <SectionXDatabase />
    </>
  );
}

function SectionXDatabase() {
  const [state] = useEditorState();
  const { document_id, basepath } = state;

  return (
    <SidebarSection>
      <SidebarSectionHeaderItem>
        <SidebarSectionHeaderLabel>
          <span>External Database</span>
        </SidebarSectionHeaderLabel>
      </SidebarSectionHeaderItem>
      <SidebarMenuList>
        <SidebarMenuLink
          href={editorlink("connect/database/supabase", {
            basepath,
            document_id,
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
        <SidebarMenuItem muted disabled>
          <PostgreSQL className="inline align-middle w-4 h-4 me-2" />
          PostgreSQL
          <Badge variant="outline" className="ms-auto">
            soon
          </Badge>
        </SidebarMenuItem>
      </SidebarMenuList>
    </SidebarSection>
  );
}
