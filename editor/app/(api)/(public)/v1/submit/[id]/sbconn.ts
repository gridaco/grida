import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import { FlatPostgREST } from "@/lib/supabase-postgrest/flat";
import { service_role } from "@/lib/supabase/server";
import { createXSupabaseClient } from "@/services/x-supabase";
import type {
  SchemaTableConnectionXSupabaseMainTableJoint,
  GridaXSupabase,
} from "@/types";

// TODO: make it as a class to optimize performance (duplicated network requests)

export async function sbconn_insert({
  data,
  connection,
}: {
  data: Record<string, any>;
  connection: SchemaTableConnectionXSupabaseMainTableJoint;
}) {
  // fetch connection table
  const { data: supabase_project, error: supabase_project_err } =
    await service_role.xsb
      .from("supabase_project")
      .select("*, tables:supabase_table(*)")
      .eq("id", connection.supabase_project_id)
      .single();

  if (supabase_project_err || !supabase_project) {
    throw new Error("supabase_project not found");
  }

  const connection_table: GridaXSupabase.SupabaseTable | undefined =
    supabase_project!.tables.find(
      (t) => t.id === connection.main_supabase_table_id
    ) as any;

  if (!connection_table) {
    throw new Error("connection_table not found");
  }
  const { sb_table_name, sb_schema_name, sb_table_schema } = connection_table;

  const schema = sb_table_schema as GridaXSupabase.JSONSChema;

  const { pk_cols } = SupabasePostgRESTOpenApi.parse_pks(schema);

  const row = asTableRowData(data, { schema });

  const sbclient = await createXSupabaseClient(connection.supabase_project_id, {
    db: {
      schema: sb_schema_name,
    },
    // TODO: use service key only if configured to do so
    service_role: true,
  });

  // console.log("insert into", `"${sb_table_name}"`, "values", row);

  return {
    insertion: sbclient.from(sb_table_name).insert(row).select().single(),
    pks: pk_cols,
  };
}

export async function sbconn_update(
  {
    OLD,
    NEW,
    pks,
  }: {
    OLD: Record<string, any>;
    NEW: Record<string, any>;
    pks: string[];
  },
  connection: SchemaTableConnectionXSupabaseMainTableJoint
) {
  // fetch connection table
  const { data: supabase_project, error: supabase_project_err } =
    await service_role.xsb
      .from("supabase_project")
      .select("*, tables:supabase_table(*)")
      .eq("id", connection.supabase_project_id)
      .single();

  if (supabase_project_err || !supabase_project) {
    throw new Error("supabase_project not found");
  }

  const connection_table: GridaXSupabase.SupabaseTable | undefined =
    supabase_project!.tables.find(
      (t) => t.id === connection.main_supabase_table_id
    ) as any;

  if (!connection_table) {
    throw new Error("connection_table not found");
  }
  const { sb_table_name, sb_schema_name } = connection_table;

  const sbclient = await createXSupabaseClient(connection.supabase_project_id, {
    db: {
      schema: sb_schema_name,
    },
    // TODO: use service key only if configured to do so
    service_role: true,
  });

  const pk1 = pks[0];

  return sbclient.from(sb_table_name).update(NEW).eq(pk1, OLD[pk1]);
}

function asTableRowData(
  data: Record<string, any>,
  {
    schema,
  }: {
    schema: GridaXSupabase.JSONSChema;
  }
) {
  //

  // data contains only recognized keys
  const row: { [key: string]: any } = {};

  Object.keys(schema.properties).forEach((key) => {
    let parsedvalue: any;

    const { scalar_format: format, array } =
      SupabasePostgRESTOpenApi.parse_postgrest_property_meta(
        key,
        schema.properties[key],
        schema.required
      );

    switch (format) {
      case "int":
      case "int2":
      case "int4":
      case "int8":
      case "bigint":
      case "integer": {
        if (data[key] === undefined) parsedvalue = undefined;
        else parsedvalue = parseInt(data[key]) || undefined;
        break;
      }
      case "float":
      case "float4":
      case "float8":
      case "double precision":
      case "numeric":
      case "real": {
        if (data[key] === undefined) parsedvalue = undefined;
        else parsedvalue = parseFloat(data[key]) || undefined;
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

          // console.log("constructedjson", constructedjson);

          if (
            typeof value === "undefined" &&
            Object.keys(constructedjson).length === 0
          ) {
            // if the value is undefined and the constructed json is empty, we use undefined
            parsedvalue = undefined;
            break;
          }

          parsedvalue = constructedjson as any;
          break;
        }
        parsedvalue = value || undefined;
        break;
      }
    }

    // prettier-ignore
    // console.log("constructrow", key, parsedvalue, { type, format, is_array });

    if (array) {
      // we wrap the value as array if the schema expects an array. this is because our form does not support array inputs
      // do not wrap if the value is undefined (undefined means no data input through the postgrest api)
      if (parsedvalue !== undefined) {
        parsedvalue = toArray(parsedvalue);
      }
    }
    row[key] = parsedvalue;
  });

  return row;
}

function toArray(value: any) {
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}
