"use client";
import React from "react";
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
import { Spinner } from "@/components/spinner";
import { useEditorState } from "@/scaffolds/editor";
import { ModelCard } from "@/scaffolds/data-card/modelcard";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CodeIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
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
  const schemaname = useSchemaName()!;

  return (
    <Popover>
      <PopoverTrigger>{children}</PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className="flex flex-col p-0 overflow-hidden min-h-40 h-full"
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <XSBReferencedRowLookupProvider
          reference={{
            supabase_project_id: supabase_project!.id,
            supabase_schema_name: schemaname,
            relation: relation,
            fk_value: value,
          }}
        >
          <Content />
        </XSBReferencedRowLookupProvider>
      </PopoverContent>
    </Popover>
  );
}

function Content() {
  const { result, isLoading } = useReferenced()!;

  if (isLoading) {
    return (
      <div className="flex-1 flex w-full h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <section className="p-2">
        <ModelCard />
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
