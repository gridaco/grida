"use client";

import { createClientClient } from "@/lib/supabase/client";
import { useEditorState } from "@/scaffolds/editor";
import { useCallback } from "react";
import toast from "react-hot-toast";
import clsx from "clsx";

export function useDeleteBlock() {
  const [state, dispatch] = useEditorState();
  const supabase = createClientClient();

  const deleteBlock = useCallback(
    async (id: string) => {
      return await supabase.from("form_block").delete().eq("id", id);
    },
    [supabase]
  );

  return useCallback(
    (id: string) => {
      console.log("delete block", id);
      const deletion = deleteBlock(id).then(({ error }) => {
        if (error) {
          throw new Error("Failed to delete block");
        }
        dispatch({
          type: "blocks/delete",
          block_id: id,
        });
      });

      toast.promise(deletion, {
        loading: "Deleting block...",
        success: "Block deleted",
        error: "Failed to delete block",
      });
    },
    [deleteBlock, dispatch]
  );
}

export function BlockHeader({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="flex w-full justify-between items-center gap-4">
      {children}
    </div>
  );
}

export function FlatBlockBase({
  invalid,
  children,
}: React.PropsWithChildren<{
  invalid?: boolean;
}>) {
  return (
    <div
      data-invalid={invalid}
      className={clsx(
        "rounded-md flex flex-col gap-4 border w-full p-4 bg-white shadow-md",
        'data-[invalid="true"]:border-red-500/50 data-[invalid="true"]:bg-red-500/10'
      )}
    >
      {children}
    </div>
  );
}
