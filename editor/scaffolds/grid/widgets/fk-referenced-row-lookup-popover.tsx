"use client";
import React, { useMemo } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import XSBReferencedRowLookupProvider, {
  useReferenced,
} from "@/scaffolds/data-xsb-referenced-row-lookup";
import { Data } from "@/lib/data";
import { useSchemaName } from "@/scaffolds/data-query";
import { Spinner } from "@/components/ui/spinner";
import { useEditorState } from "@/scaffolds/editor";
import { DataCard } from "@/scaffolds/data-card/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CodeIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { analyze } from "@/scaffolds/data-card/analyze";
import assert from "assert";
import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import { GridFileStorageQueueProvider } from "../providers";
import { GridData } from "@/scaffolds/grid-editor/grid-data";
import type { GDocSchemaTable } from "@/scaffolds/editor/state";
import type { DGResponseRow } from "../types";
export function ReferencedRowLookupPopover({
  children,
  relation,
  value,
}: React.PropsWithChildren<{
  relation: Data.Relation.NonCompositeRelationship;
  value: string | number | undefined;
}>) {
  const [state] = useEditorState();
  const { supabase_project } = state;
  const schemaname = useSchemaName();

  assert(schemaname);
  assert(supabase_project);

  const table = useMemo(
    () =>
      state.tables.find(
        (tb) =>
          tb.provider === "x-supabase" &&
          tb.x_sb_main_table_connection.sb_schema_name === schemaname &&
          tb.x_sb_main_table_connection.sb_table_name ===
            relation.referenced_table
      ) as GDocSchemaTable | undefined,
    [schemaname, relation.referenced_table]
  );

  const definition = useMemo(() => {
    return SupabasePostgRESTOpenApi.parse_supabase_postgrest_schema_definition(
      supabase_project.sb_schema_definitions[schemaname][
        relation.referenced_table
      ]
    );
  }, [schemaname, relation.referenced_table]);

  return (
    <Popover>
      <PopoverTrigger>{children}</PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        avoidCollisions
        className="flex flex-col p-0 overflow-hidden min-h-40 h-full"
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <XSBReferencedRowLookupProvider
          reference={{
            supabase_project_id: supabase_project.id,
            supabase_schema_name: schemaname,
            relation: relation,
            fk_value: value,
          }}
        >
          <Content table={table} definition={definition} />
        </XSBReferencedRowLookupProvider>
      </PopoverContent>
    </Popover>
  );
}

function Content({
  table,
  definition,
}: {
  table?: GDocSchemaTable;
  definition: Omit<Data.Relation.TableDefinition, "name">;
}) {
  const { result, isLoading } = useReferenced()!;

  const {
    normalpropertykeys,
    prioritiezed_virtual_media_columns,
    primary_virtual_media_column,
  } = useMemo(() => {
    return analyze({ definition, fields: table?.attributes ?? [] });
  }, [definition]);

  // convert to grid row for file storage (if table is configured)
  const row = useMemo(() => {
    const rowdata = result?.data?.[0];
    if (!rowdata) return;

    return table
      ? (GridData.rows({
          provider: "x-supabase",
          table: "v0_schema_table",
          table_id: table.id,
          fields: table.attributes,
          rows: [rowdata],
          pks: definition.pks,
        }).filtered[0] as DGResponseRow)
      : {
          __gf_id: "",
          fields: {},
          raw: rowdata,
        };
  }, [result]);

  if (isLoading || !row) {
    return (
      <div className="flex-1 flex w-full h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if ((result?.data?.length || 0) !== 1) {
    return (
      <>
        This relation is not unique and cannot be displayed (
        {result?.data?.length} rows found)
      </>
    );
  }

  return (
    <div className="w-full h-full">
      <section className="p-2">
        <GridFileStorageQueueProvider
          table_id={table?.id ?? null}
          supabase_table_id={
            table
              ? "x_sb_main_table_connection" in table
                ? table.x_sb_main_table_connection.sb_table_id
                : null
              : null
          }
        >
          <DataCard
            media_fields={prioritiezed_virtual_media_columns}
            primary_media_name={primary_virtual_media_column?.name || null}
            properties={normalpropertykeys.map((key) => ({
              ...definition.properties[key],
              name: key,
              label: key,
            }))}
            data={row!}
          />
        </GridFileStorageQueueProvider>
      </section>
      <hr />
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex gap-1 font-mono items-center text-muted-foreground text-xs rounded-none"
          >
            <CodeIcon />
            RAW DATA
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <section className="max-h-96 overflow-scroll">
            <article className="prose dark:prose-invert prose-sm">
              <pre className="rounded-none">
                {JSON.stringify(result?.data, null, 2)}
              </pre>
            </article>
          </section>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
