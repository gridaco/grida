"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { EditTagDialog } from "./edit-tag-dialog";
import { DeleteTagDialog } from "./delete-tag-dialog";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useTags } from "./context";
import { Platform } from "@/lib/platform";
// import { getTags } from "@/lib/actions/tag-actions";

function getContrastColor(hexColor: string) {
  const hex = hexColor.replace("#", "");

  // Convert hex to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // Calculate luminance
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

  // Return black for bright colors, white for dark colors
  return luminance > 186 ? "#000000" : "#FFFFFF";
}

function TagsTableSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tag</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Usage</TableHead>
            <TableHead className="w-[80px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">
                <div className="h-4 w-24 bg-muted animate-pulse rounded-md" />
              </TableCell>
              <TableCell className="max-w-md truncate">
                <div className="h-4 w-48 bg-muted animate-pulse rounded-md" />
              </TableCell>
              <TableCell>
                <div className="h-6 w-16 bg-muted animate-pulse rounded-md" />
              </TableCell>
              <TableCell>
                <div className="h-8 w-8 bg-muted animate-pulse rounded-md" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function TagsTable() {
  const { tags, isLoading } = useTags();

  const [editingTag, setEditingTag] =
    useState<Platform.Tag.TagWithUsageCount | null>(null);
  const [deletingTag, setDeletingTag] =
    useState<Platform.Tag.TagWithUsageCount | null>(null);

  if (isLoading) {
    return <TagsTableSkeleton />;
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tag</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tags.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  No tags found. Create your first tag to get started.
                </TableCell>
              </TableRow>
            ) : (
              tags.map((tag) => (
                <TableRow key={tag.id}>
                  <TableCell>
                    <Badge
                      variant="outline"
                      style={{
                        backgroundColor: tag.color,
                        color: getContrastColor(tag.color),
                      }}
                    >
                      {tag.name}
                    </Badge>
                    {/* <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="font-medium">{tag.name}</span>
                    </div> */}
                  </TableCell>
                  <TableCell className="max-w-md truncate">
                    {tag.description || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {tag.usage_count}{" "}
                      {tag.usage_count === 1 ? "customer" : "customers"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingTag(tag)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeletingTag(tag)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {editingTag && (
        <EditTagDialog
          tag={editingTag}
          open={!!editingTag}
          onOpenChange={() => setEditingTag(null)}
        />
      )}

      {deletingTag && (
        <DeleteTagDialog
          tag={deletingTag}
          open={!!deletingTag}
          onOpenChange={() => setDeletingTag(null)}
        />
      )}
    </>
  );
}
