import { FlatPostgREST } from "@/lib/supabase-postgrest/flat";
import { grida_xsupabase_client } from "@/lib/supabase/server";
import { FormValue } from "@/services/form";
import { createXSupabaseClient } from "@/services/x-supabase";
import { ConnectionSupabaseJoint, GridaSupabase, Option } from "@/types";
import type { JSONSchemaType } from "ajv";
import { unflatten } from "flat";

export async function sbconn_insert({
  connection,
  formdata,
  enums,
}: {
  connection: ConnectionSupabaseJoint;
  formdata: FormData | URLSearchParams | Map<string, string>;
  enums: Option[];
}) {
  // fetch connection table
  const { data: supabase_project, error: supabase_project_err } =
    await grida_xsupabase_client
      .from("supabase_project")
      .select("*, tables:supabase_table(*)")
      .eq("id", connection.supabase_project_id)
      .single();

  if (supabase_project_err || !supabase_project) {
    throw new Error("supabase_project not found");
  }

  const connection_table: GridaSupabase.SupabaseTable | undefined =
    supabase_project!.tables.find(
      (t) => t.id === connection.main_supabase_table_id
    ) as any;

  if (!connection_table) {
    throw new Error("connection_table not found");
  }
  const { sb_table_name, sb_schema_name, sb_table_schema } = connection_table;

  const schema = sb_table_schema as JSONSchemaType<Record<string, any>>;

  const data = parseFormData(formdata, { schema, enums });

  const sbclient = await createXSupabaseClient(connection.supabase_project_id, {
    // TODO: use service key only if configured to do so
    service_role: true,
  });

  return sbclient.from(sb_table_name).insert(data).select().single();
}

function parseFormData(
  formdata: FormData | URLSearchParams | Map<string, string>,
  {
    schema,
    enums,
  }: {
    schema: JSONSchemaType<Record<string, any>>;
    enums: Option[];
  }
) {
  //

  // data contains only recognized keys
  const data: { [key: string]: any } = {};

  Object.keys(schema.properties).forEach((key) => {
    const { type, format } = schema.properties[key];
    switch (type) {
      case "number": {
        data[key] = Number(formdata.get(key));
        break;
      }
      case "boolean": {
        // TODO: this needs to be cross cheked with the form field type (e.g. checkbox)
        const sval = formdata.get(key);
        const bval = sval === "on" || sval === "true" || sval === "1";
        data[key] = bval;

        break;
      }
      default: {
        const { value } = FormValue.parse(formdata.get(key), { enums });
        if (format === "json" || format === "jsonb") {
          //
          const constructedjson = FlatPostgREST.unflatten(
            Array.from(formdata.keys()).reduce((acc, k) => {
              acc[k] = formdata.get(k);
              return acc;
            }, {} as any),
            undefined,
            {
              key: (k) => k.startsWith(key + "."),
              value: (k, v) => {
                //     // TODO: need scalar type support
                const { value } = FormValue.parse(v, { enums });
                return value;
              },
            }
          );

          data[key] = constructedjson as any;
          break;
        }
        data[key] = value || undefined;
        break;
      }
    }
  });

  return data;
}
