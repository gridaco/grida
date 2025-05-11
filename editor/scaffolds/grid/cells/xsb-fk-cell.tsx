"use client";

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import React, { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Data } from "@/lib/data";
import { LinkIcon } from "lucide-react";
import { XSBSearchTableSheet } from "@/scaffolds/x-supabase/xsb-search-table-sheet";
import { BlockKeys } from "./block-keys";

type SQLForeignKeyValue = string | number | undefined;

export function XSBForeignKeyPopupEditCell({
  relation,
  supabase_project_id,
  supabase_schema_name,
  value: initialValue,
  onCommitValue,
  onClose,
}: {
  relation: Data.Relation.NonCompositeRelationship;
  supabase_project_id: number;
  supabase_schema_name: string;
  value: SQLForeignKeyValue;
  onCommitValue?: (value: SQLForeignKeyValue) => void;
  onClose?: () => void;
}) {
  const [value, setValue] = useState<SQLForeignKeyValue>(initialValue);
  const [open, setOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const isDirty = value !== initialValue;

  const cancelChanges = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, []);

  const onCommit = useCallback(() => {
    onCommitValue?.(value);
    setOpen(false);
  }, [onCommitValue, value]);

  return (
    <>
      <XSBSearchTableSheet
        onValueChange={setValue}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        relation={relation}
        supabase_project_id={supabase_project_id}
        supabase_schema_name={supabase_schema_name}
      />
      <Popover open={open}>
        <PopoverTrigger asChild>
          <button className="w-full h-full" />
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={-44}
          asChild
          className="min-w-48 w-[--radix-popover-trigger-width] max-h-[--radix-popover-content-available-height] p-0"
        >
          <BlockKeys
            onEnter={onCommit}
            onEscape={cancelChanges}
            className="bg-background border rounded-sm shadow-lg overflow-hidden"
          >
            <header className="p-2 border-b">
              <Badge
                variant="outline"
                className="text-xs text-muted-foreground font-mono"
              >
                <LinkIcon className="size-3 mr-1" />
                {supabase_schema_name}.{relation.referenced_table}.
                {relation.referenced_column}
              </Badge>
            </header>
            <div className="p-2 flex gap-2">
              <Input
                type="search"
                autoFocus
                placeholder="Search for reference..."
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="aspect-square"
                onClick={() => {
                  setSheetOpen(true);
                }}
              >
                <LinkIcon className="size-3" />
              </Button>
            </div>
            <footer className="flex justify-between p-2 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={cancelChanges}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={isDirty ? "default" : "outline"}
                size="sm"
                onClick={onCommit}
              >
                Save
              </Button>
            </footer>
          </BlockKeys>
        </PopoverContent>
      </Popover>
    </>
  );
}
