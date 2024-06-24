"use client";

import { SideNavBadge, SideNavItem } from "@/components/sidenav";
import {
  ArchiveIcon,
  AvatarIcon,
  BoxIcon,
  BoxModelIcon,
  CodeIcon,
  FileIcon,
  Link2Icon,
  PieChartIcon,
} from "@radix-ui/react-icons";
import Link from "next/link";
import { useEditorState } from "../editor";
import { Table2Icon, TabletSmartphoneIcon } from "lucide-react";

export function Siebar() {
  const [state] = useEditorState();

  const { form_id } = state;
  return (
    <nav className="py-4 col-span-1 max-w-xs min-w-60 w-min border-r dark:border-r-neutral-800 h-full">
      <ul className="flex flex-col">
        <label className="text-xs text-muted-foreground py-4 px-4">Table</label>
        <li>
          <Link href={`/d/${form_id}/data/responses`}>
            <SideNavItem>
              <Table2Icon className="w-4 h-4" />
              Form
            </SideNavItem>
          </Link>
        </li>
        <li>
          <Link href={`/d/${form_id}/data/customers`}>
            <SideNavItem>
              <AvatarIcon className="w-4 h-4" />
              Customers
            </SideNavItem>
          </Link>
        </li>
        <li>
          <Link href={`/d/${form_id}/data/files`}>
            <SideNavItem>
              <FileIcon className="w-4 h-4" />
              Files
            </SideNavItem>
          </Link>
        </li>
        <li>
          <Link href={`/d/${form_id}/data/analytics`}>
            <SideNavItem>
              <PieChartIcon className="w-4 h-4" />
              Realtime
            </SideNavItem>
          </Link>
        </li>
        <label className="text-xs text-muted-foreground py-4 px-4">
          App / Campaign
        </label>
        <li>
          <Link href={`/`}>
            <SideNavItem>
              <TabletSmartphoneIcon className="w-4 h-4" />
              Main
            </SideNavItem>
          </Link>
        </li>
        <label className="text-xs text-muted-foreground py-4 px-4">
          Commerce
        </label>
        <li>
          <Link href={`/d/${form_id}/connect/store/orders`}>
            <SideNavItem>
              <ArchiveIcon />
              Orders
            </SideNavItem>
          </Link>
        </li>
        <li>
          <Link href={`/d/${form_id}/connect/store/products`}>
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
