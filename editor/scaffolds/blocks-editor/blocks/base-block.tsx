"use client";

import { createBrowserFormsClient } from "@/lib/supabase/client";
import { useEditorState } from "@/scaffolds/editor";
import React, { useCallback } from "react";
import { toast } from "sonner";
import { cn } from "@/components/lib/utils";
import {
  ChevronDownIcon,
  ChevronUpIcon,
} from "@radix-ui/react-icons";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function useDeleteBlock() {
  const [state, dispatch] = useEditorState();
  const supabase = createBrowserFormsClient();

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

export function BlockHeader({
  border,
  children,
}: React.PropsWithChildren<{ border?: boolean }>) {
  return (
    <div
      className={cn(
        "flex w-full justify-between items-center gap-4",
        border && "pb-4 border-b"
      )}
    >
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
      className={cn(
        "group/block relative flex flex-col gap-4 w-full p-4 bg-background"
      )}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDown?.(e);
      }}
    >
      <div
        role="border"
        className={cn(
          "pointer-events-none absolute inset-0 z-0 rounded-md transition-all",
          "opacity-25 shadow-[0_0_0_1px_var(--color-primary)]",
          "group-hover/block:opacity-50 group-hover/block:shadow-[0_0_0_2px_var(--color-primary)]",
          'group-data-[focused="true"]/block:opacity-100 group-data-[focused="true"]/block:shadow-[0_0_0_2px_var(--color-primary)]'
        )}
      />
      {children}
    </div>
  );
}

export function BlockAction({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "opacity-0 group-hover/block:opacity-100 group-data-[focused='true']/block:opacity-100",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function useMoveBlock() {
  const [, dispatch] = useEditorState();
  return useCallback(
    (block_id: string, direction: "up" | "down") => {
      dispatch({
        type: direction === "up" ? "blocks/move/up" : "blocks/move/down",
        block_id,
      });
    },
    [dispatch]
  );
}

export function MoveBlockMenuItems({ id }: { id: string }) {
  const [state] = useEditorState();
  const move = useMoveBlock();

  const index = state.blocks.findIndex((b) => b.id === id);
  const disabledUp = index <= 0;
  const disabledDown = index === state.blocks.length - 1;

  return (
    <>
      <DropdownMenuItem disabled={disabledUp} onClick={() => move(id, "up")}>
        <ChevronUpIcon className="size-3.5" />
        Move Up
      </DropdownMenuItem>
      <DropdownMenuItem disabled={disabledDown} onClick={() => move(id, "down")}>
        <ChevronDownIcon className="size-3.5" />
        Move Down
      </DropdownMenuItem>
    </>
  );
}
