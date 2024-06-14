import { build_supabase_rest_url } from "@/lib/supabase-postgrest";
import * as postgrest from "@/lib/supabase-postgrest/postgrest";
import { grida_xsupabase_client } from "@/lib/supabase/server";
import { secureformsclient } from "@/lib/supabase/vault";
import { ConnectionSupabaseJoint, GridaSupabase } from "@/types";
import { createClient } from "@supabase/supabase-js";
import { JSONSchemaType } from "ajv";
import { unflatten } from "flat";

export async function sbconn_insert(
  connection: ConnectionSupabaseJoint,
  formdata: FormData | URLSearchParams | Map<string, string>
) {
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
  const { id, sb_project_url, sb_anon_key } = supabase_project;

  const connection_table: GridaSupabase.SupabaseTable | undefined =
    supabase_project!.tables.find(
      (t) => t.id === connection.main_supabase_table_id
    );

  if (!connection_table) {
    throw new Error("connection_table not found");
  }
  const { sb_table_name, sb_schema_name, sb_table_schema } = connection_table;

  const schema = sb_table_schema as JSONSchemaType<Record<string, any>>;

  const data = parseFormData(formdata, schema);

  // TODO: use service key only if configured to do so
  const apiKey =
    (await secureFetchServiceKey(supabase_project.id)) || sb_anon_key;

  const insertion = {
    url: build_supabase_rest_url(sb_project_url),
    apiKey: apiKey,
    schema: sb_schema_name,
    table: sb_table_name,
    data: data,
  };

  const sbclient = createClient(sb_project_url, apiKey);
  return sbclient.from(sb_table_name).insert(data).select().single();

  // console.log("sbconn_insert", insertion);

  //
  return postgrest.insert(insertion);
}

async function secureFetchServiceKey(supabase_project_id: number) {
  const { data } = await secureformsclient.rpc(
    "reveal_secret_connection_supabase_service_key",
    {
      p_supabase_project_id: supabase_project_id,
    }
  );

  return data;
}

function parseFormData(
  formdata: FormData | URLSearchParams | Map<string, string>,
  schema: JSONSchemaType<Record<string, any>>
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
        if (format === "json") {
          const flat = formdata_keys.reduce((acc: any, k) => {
            if (k.startsWith(`${key}.`)) {
              // TODO: need scalar type support
              acc[k] = formdata.get(k);
            }
            return acc;
          }, {});

          const constructedjson = unflatten(flat);
          console.log("constructedjson", constructedjson);

          data[key] = (constructedjson as any)[key];
          break;
        }
        data[key] = formdata.get(key) || undefined;
        break;
      }
    }
  });

  return data;
}
