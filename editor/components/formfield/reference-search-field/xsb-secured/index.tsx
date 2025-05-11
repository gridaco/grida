"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2Icon } from "@radix-ui/react-icons";
import { Data } from "@/lib/data";
import { XSBSearchTableSheet, XSBListUsersSheet } from "@/scaffolds/x-supabase";
import { cn } from "@/components/lib/utils";
import { SearchIcon } from "lucide-react";

type SQLForeignKeyValue = string | number | undefined;

export function FormsSecureXSBSQLForeignKeySearchInput({
  value,
  onValueChange,
  relation,
  supabase_project_id,
  supabase_schema_name,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "onChange"> & {
  relation: Omit<Data.Relation.NonCompositeRelationship, "referencing_column">;
  supabase_project_id: number;
  supabase_schema_name: string;
  value?: SQLForeignKeyValue;
  onValueChange?: (value: SQLForeignKeyValue) => void;
}) {
  const [open, setOpen] = React.useState(false);

  const is_xsb_auth_users_table =
    supabase_schema_name === "auth" && relation.referenced_table === "users";

  return (
    <>
      {is_xsb_auth_users_table ? (
        <XSBListUsersSheet
          onValueChange={onValueChange}
          open={open}
          onOpenChange={setOpen}
          relation={relation}
          supabase_project_id={supabase_project_id}
        />
      ) : (
        <XSBSearchTableSheet
          onValueChange={onValueChange}
          open={open}
          onOpenChange={setOpen}
          relation={relation}
          supabase_project_id={supabase_project_id}
          supabase_schema_name={supabase_schema_name}
        />
      )}

      <div className="relative group">
        <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Search for reference..."
          {...props}
          value={value}
          onChange={(e) => onValueChange?.(e.target.value)}
          className={cn("pl-8 group-hover:pr-8", className)}
        />
        <div className="absolute hidden group-hover:flex items-center justify-end right-2 top-2 bottom-2">
          <Button
            type="button"
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
