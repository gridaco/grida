"use client";

import {
  ChevronDownIcon,
  EyeOpenIcon,
  OpenInNewWindowIcon,
  GearIcon,
} from "@radix-ui/react-icons";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function PreviewButton({ form_id }: { form_id: string }) {
  const router = useRouter();
  const built_in_agent_url = `/d/${form_id}/preview`;
  const custom_agent_setting_url = `/d/${form_id}/connect`;

  return (
    <div role="group" className="inline-flex rounded-md shadow-sm">
      <Link href={built_in_agent_url} target="_blank">
        <button
          type="button"
          className={clsx(
            "inline-flex items-center px-4 py-2 text-sm font-medium text-neutral-900 bg-white border border-neutral-200 rounded-s-lg hover:bg-neutral-100 hover:text-blue-700 focus:z-10 focus:ring-2 focus:ring-blue-700 focus:text-blue-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:hover:text-white dark:hover:bg-neutral-700 dark:focus:ring-blue-500 dark:focus:text-white",
            "gap-2"
          )}
          title="Preview"
        >
          <EyeOpenIcon className="mx-auto" width={20} height={20} />
          Preview
        </button>
      </Link>
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
            className="z-10 rounded border border-neutral-200 bg-white shadow-lg p-4"
          >
            <Link href={built_in_agent_url} target="_blank">
              <DropdownMenu.Item className="flex gap-2 items-center p-1 cursor-pointer">
                <OpenInNewWindowIcon />
                Built in Agent
              </DropdownMenu.Item>
            </Link>
            <DropdownMenu.Item
              className="flex gap-2 items-center p-1 cursor-pointer"
              onClick={() => router.push(custom_agent_setting_url)}
            >
              <GearIcon />
              Configure Agent
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
