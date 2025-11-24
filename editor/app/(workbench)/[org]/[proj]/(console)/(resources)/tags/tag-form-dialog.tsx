"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v3";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTags } from "@/scaffolds/workspace";
import type { Platform } from "@/lib/platform";
import { toast } from "sonner";

const tagFormSchema = z.object({
  name: z
    .string()
    .min(1, "Tag name is required")
    .max(100, "Tag name must be 100 characters or less")
    .refine((value) => !value.includes(","), "Tag name cannot contain commas"),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/, "Color must be a valid hex color (e.g., #ff0000)"),
  description: z
    .string()
    .max(500, "Description must be 500 characters or less")
    .nullable()
    .optional(),
});

type TagFormValues = z.infer<typeof tagFormSchema>;

interface TagFormDialogProps {
  tag?: Platform.Tag.Tag;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  onSuccess?: () => void;
}

export function TagFormDialog({
  tag,
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  onSuccess,
}: TagFormDialogProps) {
  const { updateTag, createTag } = useTags();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultValues: Partial<TagFormValues> = {
    name: tag?.name || "",
    color: tag?.color || "#6366f1",
    description: tag?.description || "",
  };

  const form = useForm<TagFormValues>({
    resolver: zodResolver(tagFormSchema) as any,
    defaultValues,
  });

  const onSubmit = async (values: TagFormValues) => {
    try {
      setIsSubmitting(true);

      // Clean up empty description to be null
      const formData = {
        ...values,
        description: values.description?.trim() || null,
      };

      let ok: boolean;

      if (tag) {
        // Update existing tag
        ok = await updateTag(tag.id, formData);
        toast("Tag updated");
      } else {
        // Create new tag
        ok = await createTag(formData);
        toast("Tag created");
      }

      if (ok) {
        onSuccess?.();
      }

      onOpenChange(false);
      form.reset(defaultValues);
    } catch (error) {
      console.error("Failed to save tag:", error);
      toast.error("Failed to save tag");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter tag name" {...field} />
                  </FormControl>
                  <FormDescription>
                    A unique name for this tag (max 100 characters).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <div className="flex items-center gap-3">
                    <div
                      className="size-10 rounded-md border"
                      style={{ backgroundColor: field.value }}
                    />
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </div>
                  <FormDescription>
                    A hex color code (e.g., #ff0000 for red).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter a description for this tag"
                      className="resize-none"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormDescription>
                    A brief description of what this tag represents (max 500
                    characters).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
