"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Platform } from "@/lib/platform";
import { useTags } from "@/scaffolds/workspace";
import { toast } from "sonner";

interface DeleteTagDialogProps {
  tag: Platform.Tag.TagWithUsageCount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTagDeleted?: () => void;
}

export function DeleteTagDialog({
  tag,
  open,
  onOpenChange,
  onTagDeleted,
}: DeleteTagDialogProps) {
  const { deleteTag } = useTags();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await deleteTag(tag.id);
      toast("Tag deleted");
      onTagDeleted?.();
    } catch (error) {
      console.error("Failed to delete tag:", error);
      toast.error("Failed to delete tag");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Tag</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the tag &ldquo;{tag.name}&rdquo;?
            {tag.usage_count > 0 && (
              <span className="block mt-2 font-medium">
                This tag is currently used by {tag.usage_count}{" "}
                {tag.usage_count === 1 ? "customer" : "customers"}. Deleting it
                will remove the tag from all customers.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
