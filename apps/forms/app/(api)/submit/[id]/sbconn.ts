import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import { FlatPostgREST } from "@/lib/supabase-postgrest/flat";
import { grida_xsupabase_client } from "@/lib/supabase/server";
import { FormValue } from "@/services/form";
import { createXSupabaseClient } from "@/services/x-supabase";
import { ConnectionSupabaseJoint, GridaSupabase, Option } from "@/types";
import type { JSONSchemaType } from "ajv";

export async function sbconn_insert({
  data,
  connection,
}: {
  data: Record<string, any>;
  connection: ConnectionSupabaseJoint;
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

  const row = asTableRowData(data, { schema });

  const sbclient = await createXSupabaseClient(connection.supabase_project_id, {
    // TODO: use service key only if configured to do so
    service_role: true,
  });

  return sbclient.from(sb_table_name).insert(row).select().single();
}

function asTableRowData(
  data: Record<string, any>,
  {
    schema,
  }: {
    schema: JSONSchemaType<Record<string, any>>;
  }
) {
  //

  // data contains only recognized keys
  const row: { [key: string]: any } = {};

  Object.keys(schema.properties).forEach((key) => {
    let parsedvalue: any;

    const { type, format, is_array } = SupabasePostgRESTOpenApi.analyze_format(
      schema.properties[key]
    );

    switch (type) {
      case "number": {
        parsedvalue = Number(data[key]);
        break;
      }
      case "boolean": {
        parsedvalue = data[key] === true;
        break;
      }
      default: {
        const value = data[key];
        if (format === "json" || format === "jsonb") {
          // if value is already an object, we use it as is
          // TODO: this needs to be fixed in the future. even a object field can be used as a jsonpath field value.
          // this is not possible just yet, but we need to be prepared for that. - have a analyzer and overriding
          // currentlu this is used for 'richtext' field value
          if (typeof value === "object") {
            parsedvalue = value;
            break;
          }

          const constructedjson = FlatPostgREST.unflatten(data, undefined, {
            key: (k) => k.startsWith(key + "."),
            value: (k, v) => {
              return v;
            },
          });

          parsedvalue = constructedjson as any;
          break;
        }
        parsedvalue = value || undefined;
        break;
      }
    }

    if (is_array) {
      // we wrap the value as array if the schema expects an array. this is because our form does not support array inputs
      // do not wrap if the value is undefined (undefined means no data input through the postgrest api)
      if (parsedvalue !== undefined) {
        parsedvalue = [parsedvalue];
      }
    }
    row[key] = parsedvalue;
  });

  return row;
}
