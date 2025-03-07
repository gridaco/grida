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
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { editorlink } from "@/lib/forms/url";
import { SidebarMenuLinkButton } from "./sidebar-menu-link-button";
import { SalesforceLogo } from "@/components/logos/salesforce";

export function ModeConnect() {
  const [state] = useEditorState();
  const { doctype } = state;

  switch (doctype) {
    case "v0_form":
      return <DoctypeForms />;
    case "v0_schema":
      return <DoctypeDatabase />;
    case "v0_site":
      return <DoctypeSite />;
    default:
      return <></>;
  }
}

function DoctypeForms() {
  const [state] = useEditorState();
  const { document_id: form_document_id, basepath } = state;

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>
          <span>Share</span>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuLinkButton
              size="sm"
              link={{
                href: editorlink("connect/share", {
                  document_id: form_document_id,
                  basepath,
                }),
              }}
            >
              <Link2Icon className="size-4" />
              Share
            </SidebarMenuLinkButton>
            <SidebarMenuItem>
              {/* <Link href={`connect/domain`}> */}
              <SidebarMenuButton disabled size="sm">
                <GlobeIcon className="size-4" />
                Domain
                <Badge variant="outline" className="ms-auto">
                  enterprise
                </Badge>
              </SidebarMenuButton>
              {/* </Link> */}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>
          <span>Customer</span>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuLinkButton
              size="sm"
              link={{
                href: editorlink("connect/channels", {
                  basepath,
                  document_id: form_document_id,
                }),
              }}
            >
              <EnvelopeClosedIcon className="size-4" />
              Channels
            </SidebarMenuLinkButton>
            <SidebarMenuLinkButton
              size="sm"
              link={{
                href: editorlink("connect/customer", {
                  basepath,
                  document_id: form_document_id,
                }),
              }}
            >
              <AvatarIcon className="size-4" />
              Customer Identity
            </SidebarMenuLinkButton>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>
          <span>Commerce</span>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuLinkButton
              size="sm"
              link={{
                href: editorlink("connect/store", {
                  basepath,
                  document_id: form_document_id,
                }),
              }}
            >
              <ArchiveIcon className="size-4" />
              Store
              <Badge variant="outline" className="ms-auto">
                alpha
              </Badge>
            </SidebarMenuLinkButton>

            <SidebarMenuItem>
              {/* <Link href={`connect/pg/stripe`}> */}
              <SidebarMenuButton disabled size="sm">
                <StripeLogo1 className="size-4" />
                Stripe
                <Badge variant="outline" className="ms-auto">
                  soon
                </Badge>
              </SidebarMenuButton>
              {/* </Link> */}
            </SidebarMenuItem>
            <SidebarMenuItem>
              {/* <Link href={`connect/pg/tosspayments`}> */}
              <SidebarMenuButton disabled size="sm">
                <TossLogo className="size-4" />
                Toss
                <Badge variant="outline" className="ms-auto">
                  enterprise
                </Badge>
              </SidebarMenuButton>
              {/* </Link> */}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SectionXDatabase />
      <SidebarGroup>
        <SidebarGroupLabel>
          <span>Developer</span>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuLinkButton
              size="sm"
              link={{
                href: editorlink("connect/parameters", {
                  document_id: form_document_id,
                  basepath: basepath,
                }),
              }}
            >
              <CodeIcon className="size-4" />
              URL parameters
            </SidebarMenuLinkButton>
            <SidebarMenuItem>
              {/* <Link href={`connect/webhooks`}> */}
              <SidebarMenuButton disabled size="sm">
                <CodeIcon className="size-4" />
                Webhooks
                <Badge variant="outline" className="ms-auto">
                  soon
                </Badge>{" "}
              </SidebarMenuButton>
              {/* </Link> */}
            </SidebarMenuItem>
            <SidebarMenuItem>
              {/* <Link href={`connect/integrations`}> */}
              <SidebarMenuButton disabled size="sm">
                <CodeIcon className="w-4 h-4" />
                Integrations
                <Badge variant="outline" className="ms-auto">
                  soon
                </Badge>
              </SidebarMenuButton>
              {/* </Link> */}
            </SidebarMenuItem>
            <SidebarMenuItem>
              {/* <Link href={`connect/import`}> */}
              <SidebarMenuButton disabled size="sm">
                <CodeIcon className="size-4" />
                Import Data
                <Badge variant="outline" className="ms-auto">
                  soon
                </Badge>
              </SidebarMenuButton>
              {/* </Link> */}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
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
    <SidebarGroup>
      <SidebarGroupLabel>
        <span>Database</span>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuLinkButton
            size="sm"
            link={{
              href: editorlink("connect/database/supabase", {
                basepath,
                document_id,
              }),
            }}
          >
            <SupabaseLogo className="size-4" />
            Supabase
            <Badge variant="outline" className="ms-auto">
              beta
            </Badge>
          </SidebarMenuLinkButton>
          <SidebarMenuItem>
            <SidebarMenuButton disabled size="sm">
              <PostgreSQL className="size-4" />
              PostgreSQL
              <Badge variant="outline" className="ms-auto">
                soon
              </Badge>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function DoctypeSite() {
  const [state] = useEditorState();
  const { document_id, basepath } = state;
  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>
          <span>Site</span>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {/* <SidebarMenuLinkButton
              disabled // not ready for site
              size="sm"
              link={{
                href: editorlink("connect/share", {
                  document_id: document_id,
                  basepath,
                }),
              }}
            >
              <Link2Icon className="size-4" />
              Share
            </SidebarMenuLinkButton> */}
            <SidebarMenuItem>
              {/* <Link href={`connect/domain`}> */}
              <SidebarMenuButton disabled size="sm">
                <GlobeIcon className="size-4" />
                Domain
                <Badge variant="outline" className="ms-auto">
                  enterprise
                </Badge>
              </SidebarMenuButton>
              {/* </Link> */}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>
          <span>Customer</span>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuLinkButton
              size="sm"
              disabled
              link={{
                href: editorlink("connect/channels", {
                  basepath,
                  document_id: document_id,
                }),
              }}
            >
              <EnvelopeClosedIcon className="size-4" />
              Channels
            </SidebarMenuLinkButton>
            <SidebarMenuLinkButton
              size="sm"
              link={{
                href: editorlink("connect/customer", {
                  basepath,
                  document_id: document_id,
                }),
              }}
            >
              <AvatarIcon className="size-4" />
              Customer Identity
            </SidebarMenuLinkButton>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>
          <span>Commerce</span>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuLinkButton
              disabled // not ready for site
              size="sm"
              link={{
                href: editorlink("connect/store", {
                  basepath,
                  document_id: document_id,
                }),
              }}
            >
              <ArchiveIcon className="size-4" />
              Store
              <Badge variant="outline" className="ms-auto">
                alpha
              </Badge>
            </SidebarMenuLinkButton>

            <SidebarMenuItem>
              {/* <Link href={`connect/pg/stripe`}> */}
              <SidebarMenuButton disabled size="sm">
                <StripeLogo1 className="size-4" />
                Stripe
                <Badge variant="outline" className="ms-auto">
                  soon
                </Badge>
              </SidebarMenuButton>
              {/* </Link> */}
            </SidebarMenuItem>
            <SidebarMenuItem>
              {/* <Link href={`connect/pg/tosspayments`}> */}
              <SidebarMenuButton disabled size="sm">
                <TossLogo className="size-4" />
                Toss
                <Badge variant="outline" className="ms-auto">
                  enterprise
                </Badge>
              </SidebarMenuButton>
              {/* </Link> */}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SectionXDatabase />
      <SidebarGroup>
        <SidebarGroupLabel>
          <span>Developer</span>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuLinkButton
              size="sm"
              link={{
                href: editorlink("connect/parameters", {
                  document_id: document_id,
                  basepath: basepath,
                }),
              }}
            >
              <CodeIcon className="size-4" />
              URL parameters
            </SidebarMenuLinkButton>
            <SidebarMenuItem>
              {/* <Link href={`connect/webhooks`}> */}
              <SidebarMenuButton disabled size="sm">
                <CodeIcon className="size-4" />
                Webhooks
                <Badge variant="outline" className="ms-auto">
                  soon
                </Badge>{" "}
              </SidebarMenuButton>
              {/* </Link> */}
            </SidebarMenuItem>
            <SidebarMenuItem>
              {/* <Link href={`connect/integrations`}> */}
              <SidebarMenuButton disabled size="sm">
                <CodeIcon className="w-4 h-4" />
                Integrations
                <Badge variant="outline" className="ms-auto">
                  soon
                </Badge>
              </SidebarMenuButton>
              {/* </Link> */}
            </SidebarMenuItem>
            <SidebarMenuItem>
              {/* <Link href={`connect/import`}> */}
              <SidebarMenuButton disabled size="sm">
                <CodeIcon className="size-4" />
                Import Data
                <Badge variant="outline" className="ms-auto">
                  soon
                </Badge>
              </SidebarMenuButton>
              {/* </Link> */}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>
          <span>Enterprise</span>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              {/* <Link href={`connect/integrations`}> */}
              <SidebarMenuButton disabled size="sm">
                <SalesforceLogo className="w-4 h-4" />
                Salesforce
                <Badge variant="outline" className="ms-auto">
                  soon
                </Badge>
              </SidebarMenuButton>
              {/* </Link> */}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}
