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
import {
  Field,
  FieldError,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// Update the interface to allow for Promise<boolean> return type
interface RenameDialogProps {
  id: string;
  onRename: (id: string, newName: string) => void | Promise<boolean>;
  currentName?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  itemType?: string;
  /**
   * Optional short hint shown under the input (e.g. naming guideline).
   */
  nameHint?: string | React.ReactNode;
  /**
   * Optional validation function. Return a user-facing message when invalid.
   */
  validateName?: (name: string) => string | null;
}

// Add loading state to the component
export function RenameDialog({
  id,
  onRename,
  currentName = "",
  title = "Rename item",
  description = "Enter a new name for this item.",
  itemType = "item",
  nameHint,
  validateName,
  ...props
}: React.ComponentProps<typeof Dialog> & RenameDialogProps) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  const trimmedName = name.trim();
  // Avoid "flicker" while typing: only show validation errors after blur or submit.
  const validationError =
    showValidation && trimmedName ? validateName?.(trimmedName) : null;
  const effectiveError = error ?? validationError ?? null;
  const isUnchanged = trimmedName === currentName.trim();
  const canSubmit = !isLoading && !!trimmedName && !isUnchanged;

  // Update the submit handler to handle async operations
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowValidation(true);

    // Validate input
    if (!trimmedName) {
      setError(`${itemType} name cannot be empty`);
      return;
    }

    const validationMessage = validateName?.(trimmedName);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    // If name hasn't changed
    if (isUnchanged) {
      props.onOpenChange?.(false);
      return;
    }

    try {
      setIsLoading(true);
      const result = await Promise.resolve(onRename(id, trimmedName));

      // Only close if the operation was successful or returned nothing (void)
      if (result !== false) {
        props.onOpenChange?.(false);
      } else {
        // If false was returned, it indicates the operation failed
        setError(`Failed to rename ${itemType}. Please try again.`);
      }
    } catch (err) {
      console.error("Error renaming:", err);
      if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError(`An error occurred while renaming the ${itemType}.`);
      }
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
          <FieldGroup className="py-4 gap-4">
            <Field data-invalid={!!effectiveError}>
              <FieldLabel htmlFor="name" className="text-left">
                Name
              </FieldLabel>
              <Input
                id="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                onBlur={() => setShowValidation(true)}
                placeholder={`Enter ${itemType} name`}
                aria-invalid={!!effectiveError}
                autoFocus
                disabled={isLoading}
              />
              {nameHint && <FieldDescription>{nameHint}</FieldDescription>}
              <div className="min-h-5">
                <FieldError>{effectiveError}</FieldError>
              </div>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isLoading}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              {isLoading ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
