"use client";

import { ChevronDownIcon, CodeIcon, PlusIcon } from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/scaffolds/workspace";

export function CreateNewFormButton({
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
  const new_default_form_url = `/new?project_id=${project_id}`;

  const new_formn_with_template = async (template: string) => {
    const res = await fetch(
      `/new/template?project_id=${project_id}&template=${template}`,
      {
        method: "POST",
      }
    );

    const { form_id } = await res.json();

    // TODO: add globl spinner to block ui

    router.push(`/${organization_name}/${project_name}/${form_id}/connect`);
  };

  return (
    <div role="group" className="inline-flex rounded-md shadow-sm">
      <form action={new_default_form_url} method="POST">
        <button
          type="submit"
          className={clsx(
            "inline-flex items-center px-4 py-2 text-sm font-medium border rounded-s-lg focus:z-10 focus:ring-2",
            "gap-2"
          )}
          title="Create new form"
        >
          <PlusIcon />
          Create new Form
        </button>
      </form>

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
          <DropdownMenuItem
            onClick={() => {
              new_formn_with_template("headless");
            }}
          >
            <CodeIcon className="me-2 align-middle" />
            Blank Headless Form
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
