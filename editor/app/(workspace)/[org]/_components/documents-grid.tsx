"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { GDocument } from "@/types";
import {
  GridCard,
  RowCard,
} from "@/app/(workspace)/[org]/_components/form-card";
import { BoxSelectIcon } from "lucide-react";
import { editorlink } from "@/host/url";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { RenameDialog } from "@/components/dialogs/rename-dialog";
import {
  DeleteConfirmationAlertDialog,
  DeleteConfirmationSnippet,
} from "@/components/dialogs/delete-confirmation-dialog";
import { TrashIcon } from "@radix-ui/react-icons";
import { createBrowserClient } from "@/lib/supabase/client";

const variants = {
  list: RowCard,
  grid: GridCard,
};

export function DocumentsGrid({
  documents,
  layout,
  organization_name,
  project_name,
  onChange,
}: {
  organization_name: string;
  project_name: string;
  documents: GDocument[];
  layout: "grid" | "list";
  onChange?: () => void;
}) {
  const renameDialog = useDialogState<{ id: string; name: string }>(
    "rename-document-dialog",
    {
      refreshkey: true,
    }
  );

  const deleteDialog = useDialogState<{ id: string; match: string }>(
    "delete-document-dialog"
  );

  const Item = variants[layout];

  const client = useMemo(() => createBrowserClient(), []);

  const renameDocument = async (docid: string, newname: string) => {
    const { error } = await client
      .from("document")
      .update({ title: newname })
      .eq("id", docid);
    if (error) return false;
    onChange?.();
    return true;
  };

  const deleteDocument = async (docid: string) => {
    const { count } = await client
      .from("document")
      .delete({ count: "exact" })
      .eq("id", docid);
    onChange?.();
    return count === 1;
  };

  return (
    <div
      className={
        layout === "grid"
          ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4"
          : "grid grid-cols-1 md:grid-cols-1 lg:grid-cols-1 gap-4"
      }
    >
      <RenameDialog
        key={renameDialog.refreshkey}
        itemType="document"
        title="Rename Document"
        description="Enter a new name for the document."
        {...renameDialog.props}
        id={renameDialog.data?.id ?? ""}
        currentName={renameDialog.data?.name}
        onRename={renameDocument}
      />

      <DeleteConfirmationAlertDialog
        key={deleteDialog.refreshkey}
        {...deleteDialog.props}
        title="Delete Document"
        description={(match) => (
          <>
            This action cannot be undone. Type{" "}
            <DeleteConfirmationSnippet>{match}</DeleteConfirmationSnippet> to
            delete this project.
          </>
        )}
        match={deleteDialog.data?.match}
        onDelete={async ({ id }) => {
          return deleteDocument(id);
        }}
      />

      {layout === "list" && (
        <header className="flex text-sm opacity-80">
          <span className="flex-1">
            Documents
            <span className="ml-2 text-xs opacity-50">{documents.length}</span>
          </span>
          <span className="w-32">Entries</span>
          <span className="w-44">Updated At</span>
        </header>
      )}

      {documents.length === 0 && (
        <div className="w-full h-96 flex items-center justify-center">
          <div className="flex flex-col items-center justify-center gap-8">
            <div className="flex flex-col gap-2 items-center">
              <BoxSelectIcon className="size-6 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                No documents yet
              </span>
            </div>
          </div>
        </div>
      )}
      {documents.map((doc, i) => {
        const link = editorlink(".", {
          org: organization_name,
          proj: project_name,
          document_id: doc.id,
        });
        return (
          <ContextMenu key={i}>
            <ContextMenuTrigger>
              <Link href={link} prefetch={false}>
                <Item {...doc} />
              </Link>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => open(link)}>
                Open
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() =>
                  renameDialog.openDialog({ id: doc.id, name: doc.title })
                }
              >
                Rename
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                onSelect={() => {
                  deleteDialog.openDialog({
                    id: doc.id,
                    match: `DELETE ${doc.title}`,
                  });
                }}
              >
                <TrashIcon />
                Delete
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </div>
  );
}
