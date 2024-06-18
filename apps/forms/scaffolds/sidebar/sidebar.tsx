"use client";

import { SideNavBadge, SideNavItem } from "@/components/sidenav";
import {
  ArchiveIcon,
  AvatarIcon,
  BoxIcon,
  BoxModelIcon,
  CodeIcon,
  Link2Icon,
} from "@radix-ui/react-icons";
import Link from "next/link";
import { useEditorState } from "../editor";

export function Siebar() {
  const [state] = useEditorState();

  const { form_id } = state;
  return (
    <nav className="py-4 col-span-1 max-w-xs min-w-60 w-min border-r dark:border-r-neutral-800 h-full">
      <ul className="flex flex-col">
        <label className="text-xs text-muted-foreground py-4 px-4">Data</label>
        <li>
          <Link href={`/d/${form_id}/data/responses`}>
            <SideNavItem>
              <BoxModelIcon />
              Responses
            </SideNavItem>
          </Link>
        </li>
        <li>
          <Link href={`/d/${form_id}/data/responses`}>
            <SideNavItem>
              <BoxModelIcon />
              Sessions
            </SideNavItem>
          </Link>
        </li>
        <li>
          <Link href={`/d/${form_id}/data/responses`}>
            <SideNavItem>
              <BoxModelIcon />
              Customers
            </SideNavItem>
          </Link>
        </li>
        <label className="text-xs text-muted-foreground py-4 px-4">
          Applications
        </label>
        <li>
          <Link href={`/d/${form_id}/data/responses`}>
            <SideNavItem>
              <BoxModelIcon />
              Main
            </SideNavItem>
          </Link>
        </li>
        <label className="text-xs text-muted-foreground py-4 px-4">
          Commerce
        </label>
        <li>
          <Link href={`/d/${form_id}/data/orders`}>
            <SideNavItem>
              <ArchiveIcon />
              Orders
            </SideNavItem>
          </Link>
        </li>
        <li>
          <Link href={`/d/${form_id}/data/orders`}>
            <SideNavItem>
              <ArchiveIcon />
              Inventory
            </SideNavItem>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
