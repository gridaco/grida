"use client";

import {
  ChevronDownIcon,
  EyeOpenIcon,
  OpenInNewWindowIcon,
  GearIcon,
  CommitIcon,
} from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function PreviewButton({ form_id }: { form_id: string }) {
  const built_in_agent_url = `/d/${form_id}/preview`;

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
          {/* <EyeOpenIcon className="mx-auto" width={20} height={20} /> */}
          Preview
        </button>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-neutral-900 bg-white border-t border-b border-r border-neutral-200 rounded-e-lg hover:bg-neutral-100 hover:text-blue-700 focus:z-10 focus:ring-2 focus:ring-blue-700 focus:text-blue-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:hover:text-white dark:hover:bg-neutral-700 dark:focus:ring-blue-500 dark:focus:text-white"
          >
            <ChevronDownIcon />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <Link href={built_in_agent_url} target="_blank">
            <DropdownMenuItem>
              <OpenInNewWindowIcon className="me-2 align-middle" />
              Built in Agent
            </DropdownMenuItem>
          </Link>
          <Link href={`/d/${form_id}/connect`}>
            <DropdownMenuItem>
              <GearIcon className="me-2 align-middle" />
              Configure Agent
            </DropdownMenuItem>
          </Link>
          <Link href={`/d/${form_id}/data/simulator`}>
            <DropdownMenuItem>
              <CommitIcon className="me-2 align-middle" />
              Simulator
            </DropdownMenuItem>
          </Link>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
