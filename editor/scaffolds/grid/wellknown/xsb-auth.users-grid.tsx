"use client";

import React from "react";
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
import { GridaXSupabase } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Apple, Google, KakaoTalkLogo } from "@/components/logos";
import { cn } from "@/components/lib/utils";
import {
  StandaloneDataGridStateProvider,
  useDataGridState,
  useMasking,
} from "../providers";
import { toast } from "sonner";
import "../grid.css";

type ColumnData = {
  key: keyof XSBUserRow;
  name: string | null;
  format: "uuid" | "text" | "timestamp" | "email";
  width?: number;
  sensitive?: boolean;
};

const _column_avatar = {
  key: "avatar_url",
  name: "",
  resizable: true,
  draggable: false,
  editable: false,
  frozen: true,
  width: 48,
  renderHeaderCell: HeaderCell,
  renderCell: ({ row, column }: RenderCellProps<XSBUserRow>) => {
    const val = row["avatar_url"];

    return (
      <CellRoot className="flex items-center justify-center">
        <Avatar className="h-6 w-6 aspect-square">
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
  draggable: false,
  editable: false,
  frozen: false,
  width: 160,
  renderHeaderCell: HeaderCell,
  renderCell: ({ row, column }: RenderCellProps<XSBUserRow>) => {
    const val = row["providers"];

    const { highlightTokens } = useDataGridState();

    return (
      <CellRoot className="flex items-center">
        <div className="flex items-center gap-2">
          {val.map((p) => (
            <div key={p} className="flex items-center gap-1 rounded-xs p-1">
              <AuthProviderIcon type={p} className="w-4 h-4 text-foreground" />
              <Highlight
                text={p}
                tokens={highlightTokens}
                highlightClassName="bg-foreground text-background"
                className="capitalize"
              />
            </div>
          ))}
        </div>
      </CellRoot>
    );
  },
} satisfies Column<XSBUserRow>;

function columnFromData(col: ColumnData) {
  return {
    key: col.key,
    name: col.name,
    resizable: true,
    draggable: false,
    editable: false,
    frozen: false,
    width: col.width,
    renderHeaderCell: HeaderCell,
    renderCell: ({ row, column }: RenderCellProps<any>) => {
      const masker = useMasking();

      const val = row[col.key as keyof XSBUserRow];

      const formatted =
        col.format === "timestamp" ? new Date(val).toLocaleString() : val;

      const { highlightTokens } = useDataGridState();

      return (
        <CellRoot>
          <Highlight
            text={
              col.sensitive
                ? masker(formatted, { format: col.format })
                : formatted
            }
            tokens={highlightTokens}
            highlightClassName="bg-foreground text-background"
          />
        </CellRoot>
      );
    },
  } as Column<XSBUserRow>;
}

const columns = [
  _column_avatar,
  columnFromData({
    key: "id",
    name: "UID",
    format: "uuid",
    width: 320,
    sensitive: true,
  }),
  columnFromData({
    key: "display_name",
    name: "Display Name",
    format: "text",
    width: 200,
    sensitive: true,
  }),
  columnFromData({
    key: "email",
    name: "Email",
    format: "email",
    width: 200,
    sensitive: true,
  }),
  columnFromData({
    key: "phone",
    name: "Phone",
    format: "text",
    width: 200,
    sensitive: true,
  }),
  _column_provider,
  columnFromData({
    key: "created_at",
    name: "Created at",
    format: "timestamp",
    width: 160,
    sensitive: false,
  }),
  columnFromData({
    key: "last_sign_in_at",
    name: "Last sign in at",
    format: "timestamp",
    width: 160,
    sensitive: false,
  }),
];

export function XSBAuthUsersGrid({
  rows,
  loading,
  highlightTokens,
  onRowDoubleClick,
  mask,
}: {
  rows: XSBUserRow[];
  loading?: boolean;
  highlightTokens?: string[];
  mask?: boolean;
  onRowDoubleClick?: (row: XSBUserRow) => void;
}) {
  return (
    <StandaloneDataGridStateProvider
      masking_enabled={mask}
      highlightTokens={highlightTokens}
    >
      <DataGrid
        className="flex-grow select-none text-xs text-foreground/80"
        columns={columns}
        rows={rows}
        renderers={{ noRowsFallback: <EmptyRowsRenderer loading={loading} /> }}
        rowKeyGetter={(row) => row.id}
        onCopy={(e) => {
          const val = e.sourceRow[e.sourceColumnKey as keyof XSBUserRow];
          const cp = navigator.clipboard.writeText(String(val));
          toast.promise(cp, {
            loading: "Copying to clipboard...",
            success: "Copied to clipboard",
            error: "Failed to copy to clipboard",
          });
        }}
        rowHeight={32}
        headerRowHeight={36}
        onCellDoubleClick={({ row }) => {
          onRowDoubleClick?.(row);
        }}
      />
    </StandaloneDataGridStateProvider>
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
