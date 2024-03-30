"use client";

import { ChevronDownIcon, CodeIcon, PlusIcon } from "@radix-ui/react-icons";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import clsx from "clsx";
import { useRouter } from "next/navigation";

export function CreateNewFormButton({ project_id }: { project_id: number }) {
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

    router.push(`/d/${form_id}/settings`);
  };

  return (
    <div role="group" className="inline-flex rounded-md shadow-sm">
      <form action={new_default_form_url} method="POST">
        <button
          type="submit"
          className={clsx(
            "inline-flex items-center px-4 py-2 text-sm font-medium text-neutral-900 bg-white border border-neutral-200 rounded-s-lg hover:bg-neutral-100 hover:text-blue-700 focus:z-10 focus:ring-2 focus:ring-blue-700 focus:text-blue-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:hover:text-white dark:hover:bg-neutral-700 dark:focus:ring-blue-500 dark:focus:text-white",
            "gap-2"
          )}
          title="Create new form"
        >
          <PlusIcon />
          Create new Form
        </button>
      </form>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-neutral-900 bg-white border border-neutral-200 rounded-e-lg hover:bg-neutral-100 hover:text-blue-700 focus:z-10 focus:ring-2 focus:ring-blue-700 focus:text-blue-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:hover:text-white dark:hover:bg-neutral-700 dark:focus:ring-blue-500 dark:focus:text-white"
          >
            <ChevronDownIcon />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            className="z-10 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-lg p-4"
          >
            <DropdownMenu.Item
              className="flex gap-2 items-center p-1 cursor-pointer"
              onClick={() => {
                new_formn_with_template("headless");
              }}
            >
              <CodeIcon />
              Blank Headless Form
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
