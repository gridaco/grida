"use client";

import { ChevronDownIcon, PlusIcon } from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/scaffolds/workspace";
import Link from "next/link";
import { ResourceTypeIcon } from "../resource-type-icon";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { editorlink } from "@/lib/forms/url";

export function CreateNewDocumentButton({
  project_name,
  project_id,
}: {
  project_name: string;
  project_id: number;
}) {
  const {
    state: {
      organization: { name: organization_name },
    },
  } = useWorkspace();

  const router = useRouter();
  const new_default_form_url = `/private/editor/new?project_id=${project_id}&doctype=v0_form`;

  const new_formn_with_template = async (template: string) => {
    const res = await fetch(
      `/private/editor/new/template?project_id=${project_id}&template=${template}&doctype=v0_form`,
      {
        method: "POST",
      }
    );

    const { form_document_id } = await res.json();

    // TODO: add globl spinner to block ui

    router.push(
      editorlink("connect", {
        document_id: form_document_id,
        org: organization_name,
        proj: project_name,
      })
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="gap-1">
          <PlusIcon />
          Create New
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Sites</DropdownMenuLabel>
          <DropdownMenuItem>
            <ResourceTypeIcon
              type="v0_site"
              className="w-4 h-4 me-2 align-middle"
            />
            Blank Site
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <ResourceTypeIcon
              type="v0_site"
              className="w-4 h-4 me-2 align-middle"
            />
            Admin Console
            <Badge variant="outline" className="ms-auto">
              soon
            </Badge>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Forms</DropdownMenuLabel>
          <form action={new_default_form_url} method="POST">
            <button className="w-full">
              <DropdownMenuItem>
                <ResourceTypeIcon
                  type="v0_form"
                  className="w-4 h-4 me-2 align-middle"
                />
                Blank Form
              </DropdownMenuItem>
            </button>
          </form>
          <DropdownMenuItem
            onClick={() => {
              new_formn_with_template("headless");
            }}
          >
            <ResourceTypeIcon
              type="dev"
              className="w-4 h-4 me-2 align-middle"
            />
            Blank Headless Form
          </DropdownMenuItem>
          <Link href="/ai">
            <DropdownMenuItem>
              <ResourceTypeIcon
                type="ai"
                className="w-4 h-4 me-2 align-middle"
              />
              Create with AI
            </DropdownMenuItem>
          </Link>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            CMS / Commerce
            <div className="inline-flex ms-auto pl-4">
              <Badge variant="outline">soon</Badge>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuItem disabled>
          <ResourceTypeIcon
            type="database"
            className="w-4 h-4 me-2 align-middle"
          />
          Database
          <Badge variant="outline" className="ms-auto">
            soon
          </Badge>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <ResourceTypeIcon
            type="commerce"
            className="w-4 h-4 me-2 align-middle"
          />
          Store
          <Badge variant="outline" className="ms-auto">
            soon
          </Badge>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
