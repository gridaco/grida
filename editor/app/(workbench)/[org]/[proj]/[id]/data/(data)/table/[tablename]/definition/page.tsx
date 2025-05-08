"use client";

import React, { useMemo, use } from "react";
import { useEditorState } from "@/scaffolds/editor";
import { GDocSchemaTable } from "@/scaffolds/editor/state";
import assert from "assert";
import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import { Data } from "@/lib/data";
import { DefinitionFlow } from "@/scaffolds/data-definition/flow";
import { ReactFlowProvider } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import "@xyflow/react/dist/style.css";

export default function TableDefinitionPage(
  props: {
    // TODO: [next15](https://nextjs.org/docs/app/building-your-application/upgrading/version-15#asynchronous-page)
    params: Promise<{
      tablename: string;
    }>;
  }
) {
  const params = use(props.params);
  const [{ tables, supabase_project }] = useEditorState();
  const { tablename } = params;

  const tb = tables.find(
    (table) => table.name === tablename
  ) as GDocSchemaTable;

  // its already handled on layout
  assert(tb);

  // FIXME: DEV ONLY - remove me (force casting as xsb)
  assert("x_sb_main_table_connection" in tb);

  // FIXME: remove me - DEVONLY
  assert(supabase_project);

  const schema_name = tb.x_sb_main_table_connection.sb_schema_name;
  const schema_definitions =
    supabase_project.sb_schema_definitions[schema_name];

  const other_definitions = useMemo(() => {
    const schema_table_names = Object.keys(schema_definitions);
    const schema_other_table_names = schema_table_names.filter(
      (name) => name !== tb.name
    );
    return schema_other_table_names.map((name) => {
      return {
        name,
        ...SupabasePostgRESTOpenApi.parse_supabase_postgrest_schema_definition(
          schema_definitions[name]
        ),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tb]);

  const def = useMemo(() => _tmp_merged_table_definition(tb), [tb]);

  return (
    <main className="relative w-full h-full">
      {/* <article className="prose dark:prose-invert">
        <pre>{JSON.stringify(def, null, 2)}</pre>
      </article> */}
      <header className="absolute top-0 left-0 z-10 w-full h-12 flex items-center pointer-events-none">
        <div className="px-2 pointer-events-auto">
          <Link href="./">
            <Button variant="outline">
              <ArrowLeftIcon className="w-4 h-4 me-2" />
              {def.name}
            </Button>
          </Link>
        </div>
      </header>
      <ReactFlowProvider>
        <DefinitionFlow
          mainTableKey={def.name}
          tables={[def, ...other_definitions]}
        />
      </ReactFlowProvider>
    </main>
  );
}

function _tmp_merged_table_definition(
  tb: GDocSchemaTable
): Data.Relation.TableDefinition {
  // FIXME: DEV ONLY - remove me (force casting as xsb)
  assert("x_sb_main_table_connection" in tb);

  const {
    attributes,
    x_sb_main_table_connection: { definition },
  } = tb;

  //

  const all_attribute_keys = new Set([
    ...attributes.map((a) => a.name),
    ...Object.keys(definition.properties),
  ]);

  const merged: Data.Relation.TableDefinition = Array.from(
    all_attribute_keys
  ).reduce(
    (acc: Data.Relation.TableDefinition, key) => {
      const _def: Data.Relation.Attribute | undefined =
        definition.properties[key];
      const _known: GDocSchemaTable["attributes"][number] | undefined =
        attributes.find((a) => a.name === key);

      return {
        name: tb.name,
        pks: acc.pks,
        fks: acc.fks,
        properties: {
          ...acc.properties,
          [key]: {
            name: key,
            description: _def?.description,
            type: _def?.type || undefined,
            // known does not support format atm.
            format: _def?.format || _known?.type || "",
            // known does not support format atm.
            scalar_format: _def?.scalar_format || _known?.type || "",
            enum: _def?.enum || _known?.options?.map((o) => o.value) || [],
            // known does not support array atm.
            array: _def?.array || false,
            // known does not support pk atm.
            pk: _def?.pk || false,
            // known does not support fk atm.
            fk: _def?.fk || false,
            null: _def?.null || _known?.required || false,
            // known does not support default atm.
            default: _def?.default || undefined,
          } satisfies Data.Relation.Attribute,
        },
      };
    },
    {
      name: tb.name,
      pks: definition.pks,
      fks: definition.fks,
      properties: {},
    } satisfies Data.Relation.TableDefinition
  );

  return merged;
}
