"use client";

import { OrganizationAvatar } from "@/components/organization-avatar";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createClientWorkspaceClient } from "@/lib/supabase/client";
import { CheckIcon, PlusIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import React, { useMemo } from "react";
import { useWorkspace } from "./workspace";

export function WorkspaceMenu({
  current,
  children,
}: React.PropsWithChildren<{
  current?: number;
}>) {
  const { state } = useWorkspace();
  const supabase = useMemo(() => createClientWorkspaceClient(), []);

  const { organizations } = state;

  const onLogoutClick = () => {
    supabase.auth.signOut().then(() => {
      window.location.href = "/";
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild className="cursor-pointer">
        <div>{children}</div>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        side="bottom"
        alignOffset={4}
        className="w-80 max-w-sm overflow-hidden max-h-[80vh]"
      >
        <ScrollArea>
          {organizations.map((org) => {
            const iscurrent = current === org.id;
            return (
              <Link key={org.id} href={`/${org.name}`}>
                <DropdownMenuItem>
                  <OrganizationAvatar
                    className="inline w-7 h-7 me-2 border shadow-sm rounded"
                    avatar_url={org.avatar_url}
                    alt={org.display_name}
                  />
                  {org.display_name}
                  {iscurrent && (
                    <CheckIcon className="inline w-4 h-4 ms-auto" />
                  )}
                </DropdownMenuItem>
              </Link>
            );
          })}
        </ScrollArea>
        <DropdownMenuSeparator />
        <Link href="/organizations/new">
          <DropdownMenuItem>
            <PlusIcon className="inline w-4 h-4 me-2" />
            New organization
          </DropdownMenuItem>
        </Link>
        <DropdownMenuItem onSelect={onLogoutClick}>Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
