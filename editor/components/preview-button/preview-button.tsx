"use client";

import React from "react";
import { ChevronDownIcon, GearIcon, Share2Icon } from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ButtonGroup } from "@/components/ui/button-group";
import { Button } from "@/components/ui/button";
import { editorlink, formlink } from "@/host/url";
import { useEditorState } from "@/scaffolds/editor";
import Link from "next/link";

export function PreviewButton() {
  const [state] = useEditorState();

  const { form, document_id, organization, project } = state;

  const built_in_agent_url = formlink("", form.form_id);

  return (
    <ButtonGroup>
      <Button
        asChild
        size="sm"
        className="h-7"
        title="Preview"
        variant="outline"
      >
        <Link href={built_in_agent_url} target="_blank">
          {/* <EyeOpenIcon className="mx-auto" width={20} height={20} /> */}
          Preview
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Preview options"
            className="h-7"
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <Link
            href={editorlink("connect/share", {
              org: organization.name,
              proj: project.name,
              document_id: document_id,
            })}
          >
            <DropdownMenuItem>
              <Share2Icon className="size-3.5" />
              Share
            </DropdownMenuItem>
          </Link>
          <Link
            href={editorlink("connect", {
              org: organization.name,
              proj: project.name,
              document_id: document_id,
            })}
          >
            <DropdownMenuItem>
              <GearIcon className="size-3.5" />
              Configure Agent
            </DropdownMenuItem>
          </Link>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
