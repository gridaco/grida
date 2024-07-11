"use client";

import React, { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { KeyIcon, LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GridaSupabase } from "@/types";
import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import { CodeIcon } from "@radix-ui/react-icons";

export function SupabaseTableInfo({
  table,
}: {
  table: GridaSupabase.JSONSChema;
}) {
  const { properties } = useMemo(
    () =>
      SupabasePostgRESTOpenApi.parse_supabase_postgrest_schema_definition(
        table
      ),
    [table]
  );

  return (
    <>
      <hr className="my-4" />
      <Table className="font-mono">
        <TableHeader>
          <TableRow>
            <TableHead></TableHead>
            <TableHead>Column</TableHead>
            <TableHead>Data Type</TableHead>
            <TableHead>PostgreSQL Type</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Object.entries(properties).map(
            ([prop, { pk, fk, type, format, required, name }]) => {
              return (
                <TableRow key={prop}>
                  <TableCell>
                    {pk && (
                      <KeyIcon className="me-1 inline align-middle w-4 h-4" />
                    )}
                    {fk && (
                      <LinkIcon className="me-1 inline align-middle w-4 h-4" />
                    )}
                  </TableCell>
                  <TableCell>
                    {name}{" "}
                    {required && (
                      <span className="text-xs text-foreground-muted text-red-500">
                        *
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{type}</TableCell>
                  <TableCell>{format}</TableCell>
                </TableRow>
              );
            }
          )}
        </TableBody>
      </Table>
      <Collapsible className="mt-4">
        <CollapsibleTrigger>
          <Button variant="link" size="sm">
            <CodeIcon className="me-2 align-middle" /> Raw JSON
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <article className="prose dark:prose-invert">
            <pre>{JSON.stringify(table, null, 2)}</pre>
          </article>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
