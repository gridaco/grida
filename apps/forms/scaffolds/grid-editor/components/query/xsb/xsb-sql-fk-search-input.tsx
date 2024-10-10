"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2Icon } from "@radix-ui/react-icons";
import { Data } from "@/lib/data";
import { XSBSearchTableSheet } from "@/scaffolds/x-supabase/xsb-search-table-sheet";
import { cn } from "@/utils";

type SQLForeignKeyValue = string | number | undefined;

export function XSBSQLForeignKeySearchInput({
  value,
  onValueChange,
  relation,
  supabase_project_id,
  supabase_schema_name,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "onChange"> & {
  relation: Data.Relation.NonCompositeRelationship;
  supabase_project_id: number;
  supabase_schema_name: string;
  value: SQLForeignKeyValue;
  onValueChange?: (value: SQLForeignKeyValue) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <XSBSearchTableSheet
        onValueChange={onValueChange}
        open={open}
        onOpenChange={setOpen}
        relation={relation}
        supabase_project_id={supabase_project_id}
        supabase_schema_name={supabase_schema_name}
      />
      <div className="relative group">
        <Input
          type="search"
          placeholder="Search for reference..."
          {...props}
          value={value}
          onChange={(e) => onValueChange?.(e.target.value)}
          className={cn("group-hover:pr-8", className)}
        />
        <div className="absolute hidden group-hover:flex items-center justify-end right-2 top-2 bottom-2">
          <Button
            variant="outline"
            size="icon"
            className="w-6 h-6"
            onClick={() => setOpen(true)}
          >
            <Link2Icon />
          </Button>
        </div>
      </div>
    </>
  );
}
