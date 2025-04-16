"use client";

import { TagFormDialog } from "./tag-form-dialog";
import type { Platform } from "@/lib/platform";

interface EditTagDialogProps {
  tag: Platform.Tag.Tag;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditTagDialog({ tag, open, onOpenChange }: EditTagDialogProps) {
  return (
    <TagFormDialog
      tag={tag}
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Tag"
      description="Update this tag's details."
      submitLabel="Save changes"
    />
  );
}
