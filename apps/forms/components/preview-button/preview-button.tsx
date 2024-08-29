"use client";

import { ChevronDownIcon, GearIcon, Share2Icon } from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import clsx from "clsx";
import Link from "next/link";
import { editorlink, formlink } from "@/lib/forms/url";
import { useEditorState } from "@/scaffolds/editor";

export function PreviewButton() {
  const [state] = useEditorState();

  const { form, document_id, organization, project } = state;

  const built_in_agent_url = formlink("", form.form_id);

  return (
    <div role="group" className="inline-flex rounded-md shadow-sm">
      <Link href={built_in_agent_url} target="_blank">
        <button
          type="button"
          className={clsx(
            "inline-flex items-center px-4 py-2 text-sm font-medium border rounded-s-lg focus:z-10 focus:ring-2",
            "gap-2"
          )}
          title="Preview"
        >
          {/* <EyeOpenIcon className="mx-auto" width={20} height={20} /> */}
          Preview
        </button>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 text-sm font-medium border-t border-b border-r rounded-e-lg focus:z-10 focus:ring-2"
          >
            <ChevronDownIcon />
          </button>
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
              <Share2Icon className="me-2 align-middle" />
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
              <GearIcon className="me-2 align-middle" />
              Configure Agent
            </DropdownMenuItem>
          </Link>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
