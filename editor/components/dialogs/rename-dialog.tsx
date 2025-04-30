"use client";

import type React from "react";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Update the interface to allow for Promise<boolean> return type
interface RenameDialogProps {
  id: string;
  onRename: (id: string, newName: string) => void | Promise<boolean>;
  currentName?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  itemType?: string;
}

// Add loading state to the component
export function RenameDialog({
  id,
  onRename,
  currentName = "",
  title = "Rename item",
  description = "Enter a new name for this item.",
  itemType = "item",
  ...props
}: React.ComponentProps<typeof Dialog> & RenameDialogProps) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Update the submit handler to handle async operations
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate input
    if (!name.trim()) {
      setError(`${itemType} name cannot be empty`);
      return;
    }

    // If name hasn't changed
    if (name.trim() === currentName.trim()) {
      props.onOpenChange?.(false);
      return;
    }

    try {
      setIsLoading(true);
      const result = await Promise.resolve(onRename(id, name.trim()));

      // Only close if the operation was successful or returned nothing (void)
      if (result !== false) {
        props.onOpenChange?.(false);
      } else {
        // If false was returned, it indicates the operation failed
        setError(`Failed to rename ${itemType}. Please try again.`);
      }
    } catch (err) {
      console.error("Error renaming:", err);
      setError(`An error occurred while renaming the ${itemType}.`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog {...props}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name" className="text-left">
                Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder={`Enter ${itemType} name`}
                className={error ? "border-red-500" : ""}
                autoFocus
                disabled={isLoading}
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isLoading}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
