"use client";

import { createClientFormsClient } from "@/lib/supabase/client";
import { useEditorState } from "@/scaffolds/editor";
import { useCallback } from "react";
import toast from "react-hot-toast";
import clsx from "clsx";

export function useDeleteBlock() {
  const [state, dispatch] = useEditorState();
  const supabase = createClientFormsClient();

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

export function useBlockFocus(id: string) {
  const [state, dispatch] = useEditorState();

  const setter = useCallback(() => {
    dispatch({
      type: "blocks/focus",
      block_id: id,
    });
  }, [dispatch, id]);

  return [state.focus_block_id === id, setter] as const;
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
  focused,
  children,
  onPointerDown,
}: React.PropsWithChildren<{
  invalid?: boolean;
  focused?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}>) {
  return (
    <div
      data-invalid={invalid}
      data-focused={focused}
      className={clsx(
        "rounded-md flex flex-col gap-4 border dark:border-neutral-700 w-full p-4 bg-white dark:bg-neutral-900 shadow-md",
        'data-[invalid="true"]:border-red-500/50 data-[invalid="true"]:bg-red-500/10 dark:data-[invalid="true"]:border-red-500/50 dark:data-[invalid="true"]:bg-red-500/10',
        'data-[focused="true"]:border-blue-500/50 data-[focused="true"]:bg-blue-500/10 data-[focused="true"]:dark:border-blue-400/50 data-[focused="true"]:dark:bg-blue-400/10'
      )}
      onPointerDown={onPointerDown}
    >
      {children}
    </div>
  );
}
