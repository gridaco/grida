import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { PrivateEditorApi } from "@/lib/private";
import { Link2Icon } from "@radix-ui/react-icons";
import React from "react";
import useSWR from "swr";

interface ISQLForeignKeyRelation {
  referenced_column: string;
  referenced_table: string;
}

export function XSBSQLForeignKeySearchInput({
  relation,
  supabase_project_id,
  supabase_schema_name,
  onValueChange,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "onChange"> & {
  relation: ISQLForeignKeyRelation;
  supabase_project_id: number;
  supabase_schema_name: string;
  onValueChange?: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <XSBSearchTableSheet
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
          onChange={(e) => onValueChange?.(e.target.value)}
          className="group-hover:pr-8"
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

function XSBSearchTableSheet({
  relation,
  supabase_project_id,
  supabase_schema_name,
  children,
  ...props
}: React.ComponentProps<typeof Sheet> & {
  relation: ISQLForeignKeyRelation;
  supabase_project_id: number;
  supabase_schema_name: string;
}) {
  return (
    <Sheet {...props}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent>
        Hi
        {relation.referenced_table}
        {relation.referenced_column}
        <XSBSearchTableDataGrid
          supabase_project_id={supabase_project_id}
          supabase_schema_name={supabase_schema_name}
          supabase_table_name={relation.referenced_table}
        />
      </SheetContent>
    </Sheet>
  );
}

/**
 * swr fetcher for x-sb search integration, which passes schema name to Accept-Profile header
 * @returns
 */
const x_table_search_swr_fetcher = (arg: [string, string]) => {
  const [url, schema_name] = arg;
  return fetch(url, {
    headers: {
      "Accept-Profile": schema_name,
    },
  }).then((r) => r.json());
};

function useXSupabaseTableSearch({
  supabase_project_id,
  supabase_schema_name,
  supabase_table_name,
  search,
}: {
  supabase_project_id: number;
  supabase_table_name: string;
  supabase_schema_name: string;
  search?: URLSearchParams | string;
}) {
  return useSWR(
    [
      PrivateEditorApi.XSupabase.url_x_table_search(
        supabase_project_id,
        supabase_table_name,
        {
          serachParams: search,
        }
      ),
      supabase_schema_name,
    ],
    x_table_search_swr_fetcher
  );
}

function XSBSearchTableDataGrid({
  supabase_project_id,
  supabase_table_name,
  supabase_schema_name,
}: {
  supabase_project_id: number;
  supabase_table_name: string;
  supabase_schema_name: string;
}) {
  const { data, error } = useXSupabaseTableSearch({
    supabase_project_id,
    supabase_table_name,
    supabase_schema_name,
  });
  return (
    <>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </>
  );
}
