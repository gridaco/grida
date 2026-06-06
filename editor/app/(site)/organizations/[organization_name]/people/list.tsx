"use client";
import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@app/ui/components/table";
import { Avatar, AvatarFallback, AvatarImage } from "@app/ui/components/avatar";
import { Button } from "@app/ui/components/button";
import { DotsHorizontalIcon } from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@app/ui/components/dropdown-menu";
import { createBrowserClient } from "@/lib/supabase/client";
import type { Organization } from "@/types";
import { toast } from "sonner";

export interface MemberItem {
  id: number;
  display_name: string;
  avatar_url?: string;
  role: "member" | "owner";
}

const MemberList = ({
  org,
  members,
  canEdit,
}: {
  org: Organization;
  members: MemberItem[];
  canEdit: boolean;
}) => {
  const client = createBrowserClient();

  const removeMember = async (memberId: number) => {
    await client
      .from("organization_member")
      .delete()
      .eq("id", memberId)
      .eq("organization_id", org.id);
    toast("refresh page to see changes");
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.id}>
            <TableCell className="flex items-center gap-2">
              <Avatar className="size-8 border">
                <AvatarImage src={member.avatar_url} />
                <AvatarFallback>
                  {member.display_name[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {member.display_name}
            </TableCell>
            <TableCell>{member.role}</TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button disabled={!canEdit} variant="ghost" size="icon">
                    <DotsHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    variant="destructive"
                    // owner cannot be removed
                    disabled={member.role === "owner"}
                    onClick={() => removeMember(member.id)}
                  >
                    Remove from organization
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default MemberList;
