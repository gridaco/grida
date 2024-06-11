import { build_supabase_rest_url } from "@/lib/supabase-postgrest";
import * as postgrest from "@/lib/supabase-postgrest/postgrest";
import { secureformsclient } from "@/lib/supabase/vault";
import { SupabaseConnection, SupabaseConnectionTable } from "@/types";
import { createClient } from "@supabase/supabase-js";
import { JSONSchemaType } from "ajv";
import { unflatten } from "flat";

export async function sbconn_insert(
  connection: SupabaseConnection & {
    connection_table: SupabaseConnectionTable;
  },
  formdata: FormData | URLSearchParams | Map<string, string>
) {
  // const
  const { id, connection_table, sb_project_url, sb_anon_key } = connection;
  const { sb_table_name, schema_name, sb_table_schema } = connection_table;

  const schema = sb_table_schema as JSONSchemaType<Record<string, any>>;

  const data = parseFormData(formdata, schema);

  // TODO: use service key only if configured to do so
  const apiKey = (await secureFetchServiceKey(id)) || sb_anon_key;

  const insertion = {
    url: build_supabase_rest_url(sb_project_url),
    apiKey: apiKey,
    schema: schema_name,
    table: sb_table_name,
    data: data,
  };

  const sbclient = createClient(sb_project_url, apiKey);
  return sbclient.from(sb_table_name).insert(data).select().single();

  // console.log("sbconn_insert", insertion);

  //
  return postgrest.insert(insertion);
}

async function secureFetchServiceKey(connection_id: number) {
  const { data } = await secureformsclient.rpc(
    "reveal_secret_connection_supabase_service_key",
    {
      p_connection_id: connection_id,
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
