"use client";

import React, { useMemo } from "react";
import DataGrid, {
  Column,
  RenderCellProps,
  RenderHeaderCellProps,
} from "react-data-grid";
import { XSBUserRow } from "../types";
import { EmptyRowsRenderer } from "../grid-empty-state";
import {
  AvatarIcon,
  CalendarIcon,
  CodeIcon,
  EnvelopeClosedIcon,
  GitHubLogoIcon,
  NotionLogoIcon,
} from "@radix-ui/react-icons";
import { KeyIcon, PhoneIcon } from "lucide-react";
import Highlight from "@/components/highlight";
import { CellRoot } from "../cells";
import "../grid.css";
import { GridaXSupabase } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Apple, Google, KakaoTalkLogo } from "@/components/logos";
import { cn } from "@/utils";

type ColumnData = {
  key: keyof XSBUserRow;
  name: string | null;
  format: "uuid" | "text" | "timestamp" | "avatar";
  width?: number;
};

function columnFromData(col: ColumnData) {
  return {
    key: col.key,
    name: col.name,
    resizable: true,
    draggable: true,
    editable: false,
    frozen: false,
    width: col.width,
    renderHeaderCell: HeaderCell,
    renderCell: ({ row, column }: RenderCellProps<any>) => {
      const val = row[col.key as keyof XSBUserRow];

      const txt =
        col.format === "timestamp" ? new Date(val).toLocaleString() : val;
      return <CellRoot>{txt}</CellRoot>;
    },
  } as Column<XSBUserRow>;
}

const _column_avatar = {
  key: "avatar_url",
  name: "",
  resizable: true,
  draggable: true,
  editable: false,
  frozen: true,
  width: 48,
  renderHeaderCell: HeaderCell,
  renderCell: ({ row, column }: RenderCellProps<XSBUserRow>) => {
    const val = row["avatar_url"];

    return (
      <CellRoot className="flex items-center justify-center">
        <Avatar className="h-8 w-8 aspect-square">
          <AvatarImage src={val} alt="Avatar" />
          <AvatarFallback>
            <AvatarIcon className="w-8 h-8 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>
      </CellRoot>
    );
  },
} satisfies Column<XSBUserRow>;

const _column_provider = {
  key: "providers",
  name: "Providers",
  resizable: true,
  draggable: true,
  editable: false,
  frozen: false,
  width: 160,
  renderHeaderCell: HeaderCell,
  renderCell: ({ row, column }: RenderCellProps<XSBUserRow>) => {
    const val = row["providers"];

    return (
      <CellRoot className="flex items-center">
        <div className="flex items-center gap-2">
          {val.map((p) => (
            <div key={p} className="flex items-center gap-1 rounded-sm p-1">
              <AuthProviderIcon type={p} className="w-4 h-4 text-foreground" />
              <span className="capitalize">{p}</span>
            </div>
          ))}
        </div>
      </CellRoot>
    );
  },
} satisfies Column<XSBUserRow>;

const columns = [
  _column_avatar,
  columnFromData({
    key: "id",
    name: "UID",
    format: "uuid",
    width: 320,
  }),
  columnFromData({
    key: "display_name",
    name: "Display Name",
    format: "text",
    width: 200,
  }),
  columnFromData({
    key: "email",
    name: "Email",
    format: "text",
    width: 200,
  }),
  columnFromData({
    key: "phone",
    name: "Phone",
    format: "text",
    width: 200,
  }),
  _column_provider,
  columnFromData({
    key: "created_at",
    name: "Created at",
    format: "timestamp",
    width: 160,
  }),
  columnFromData({
    key: "last_sign_in_at",
    name: "Last sign in at",
    format: "timestamp",
    width: 160,
  }),
];

export function XSBAuthUsersGrid({
  users,
  loading,
}: {
  users: GridaXSupabase.SupabaseUser[];
  loading?: boolean;
}) {
  const rows: XSBUserRow[] = useMemo(() => {
    return users.map((user) => {
      return {
        id: user.id,
        avatar_url: user.user_metadata.avatar_url,
        created_at: user.created_at,
        display_name: user.user_metadata.full_name,
        email: user.email,
        phone: user.phone,
        last_sign_in_at: user.last_sign_in_at,
        providers:
          (user.app_metadata
            .providers as GridaXSupabase.SupabaseAuthProvider[]) ??
          user.app_metadata.provider
            ? [
                user.app_metadata
                  .provider! as GridaXSupabase.SupabaseAuthProvider,
              ]
            : [],
      } satisfies XSBUserRow;
    });
  }, [users]);

  return (
    <DataGrid
      className="flex-grow select-none text-xs text-foreground/80"
      columns={columns}
      rows={rows}
      renderers={{ noRowsFallback: <EmptyRowsRenderer loading={loading} /> }}
      rowKeyGetter={(row) => row.id}
      rowHeight={44}
      headerRowHeight={36}
    />
  );
}

function HeaderCell({ column }: RenderHeaderCellProps<any>) {
  const { name, key } = column;

  return (
    <CellRoot className="flex items-center gap-1.5">
      <UserPropertyIcon
        property={key as keyof XSBUserRow}
        className="min-w-4 w-4 h-4"
      />
      {name && <span className="font-normal">{name}</span>}
    </CellRoot>
  );
}

function UserPropertyIcon({
  property,
  className,
}: {
  property: keyof XSBUserRow;
  className?: string;
}) {
  const props = {
    className: className,
  };
  switch (property) {
    case "id":
      return <KeyIcon className={cn("text-workbench-accent-sky", className)} />;
    case "display_name":
      return <AvatarIcon {...props} />;
    case "email":
      return <EnvelopeClosedIcon {...props} />;
    case "phone":
      return <PhoneIcon {...props} />;
    case "created_at":
    case "last_sign_in_at":
      return <CalendarIcon {...props} />;
    case "providers":
      return <CodeIcon {...props} />;
    default:
      return <></>;
  }
}

function AuthProviderIcon({
  type,
  className,
}: {
  type: GridaXSupabase.SupabaseAuthProvider;
  className?: string;
}) {
  switch (type) {
    case "email":
      return <EnvelopeClosedIcon className={className} />;
    case "apple":
      return <Apple className={className} />;
    case "google":
      return <Google className={className} />;
    case "github":
      return <GitHubLogoIcon className={className} />;
    case "kakao":
      return <KakaoTalkLogo className={className} />;
    case "notion":
      return <NotionLogoIcon className={className} />;
  }
  return <></>;
}
