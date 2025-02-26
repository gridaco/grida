"use client";
import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export interface MemberItem {
  id: number;
  display_name: string;
  avatar_url?: string;
  role: "member" | "owner";
}

const MemberList = ({
  members,
  canEdit,
}: {
  members: MemberItem[];
  canEdit: boolean;
}) => {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Role</TableHead>
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default MemberList;
