import { grida_xsupabase_client } from "@/lib/supabase/server";
import { FormServiceUtils } from "@/services/form";
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

  const formdata_keys = Array.from(formdata.keys());

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
        const v = formdata.get(key);
        const { value } = FormServiceUtils.parseValue(v, enums);
        if (format === "json") {
          const flat = formdata_keys.reduce((acc: any, k) => {
            if (k.startsWith(`${key}.`)) {
              // TODO: need scalar type support
              acc[k] = value;
            }
            return acc;
          }, {});

          const constructedjson = unflatten(flat);
          console.log("constructedjson", constructedjson);

          data[key] = (constructedjson as any)[key];
          break;
        }
        data[key] = value || undefined;
        break;
      }
    }
  });

  return data;
}
