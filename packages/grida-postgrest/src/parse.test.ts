import { describe, expect, test } from "vitest";
import { SupabasePostgRESTOpenApi as PostgREST } from "./parse";

const schema = {
  type: "object",
  required: ["account_id", "item_id"],
  properties: {
    account_id: {
      format: "uuid",
      type: "string",
      description: "Account. Note: This is a Primary Key.<pk/>",
    },
    item_id: {
      format: "bigint",
      type: "integer",
      description: "Item. Note: This is a Primary Key.<pk/>",
    },
    owner_id: {
      format: "uuid",
      type: "string",
      description:
        "Owner. Note: Foreign Key.<fk table='customer' column='uid'/>",
    },
    labels: {
      format: "catalog.label[]",
      type: "array",
      items: { type: "string" },
      default: "'{}'::catalog.label[]",
      enum: ["new", "done"],
    },
    payload: { format: "jsonb" },
  },
} as unknown as PostgREST.SupabaseOpenAPIDefinitionJSONSchema;

describe("SupabasePostgRESTOpenApi", () => {
  test("retains composite PK order, single-column FK metadata and custom array types", () => {
    const result = PostgREST.parse_supabase_postgrest_schema_definition(schema);
    expect(result.pks).toEqual(["account_id", "item_id"]);
    expect(result.fks).toEqual([
      {
        referencing_column: "owner_id",
        referenced_table: "customer",
        referenced_column: "uid",
      },
    ]);
    expect(result.properties.account_id.null).toBe(false);
    expect(result.properties.owner_id.null).toBe(true);
    expect(result.properties.labels).toMatchObject({
      type: "array",
      format: "catalog.label[]",
      scalar_format: "catalog.label",
      array: true,
      default: "'{}'::catalog.label[]",
      enum: ["new", "done"],
    });
    expect(result.properties.payload.type).toBeUndefined();
    expect(PostgREST.parse_pks(schema)).toEqual({
      pk_col: undefined,
      pk_cols: ["account_id", "item_id"],
      pk_first_col: "account_id",
    });
  });

  test("absent view required metadata does not imply NOT NULL", () => {
    const view = {
      ...schema,
      required: null,
    } as unknown as PostgREST.SupabaseOpenAPIDefinitionJSONSchema;
    const result = PostgREST.parse_supabase_postgrest_schema_definition(view);
    expect(result.properties.account_id.null).toBe(true);
    expect(result.pks).toEqual(["account_id", "item_id"]);
  });

  test("does not invent keys or relationships from ordinary descriptions", () => {
    expect(
      PostgREST.parse_supabase_postgrest_property_description(
        "value",
        "Primary key information unavailable"
      )
    ).toEqual({ pk: false, fk: null });
    expect(
      PostgREST.parse_supabase_postgrest_property_description(
        "owner",
        "<fk table='customer'/>"
      )
    ).toEqual({ pk: false, fk: null });
  });

  test("distinguishes missing, read-only and writable paths; rejects unsupported method metadata", () => {
    const document = {
      basePath: "/",
      consumes: [],
      definitions: {},
      host: "example.test",
      parameters: {},
      produces: [],
      schemes: ["https"],
      swagger: "2.0",
      paths: {
        "/view": { get: {} },
        "/table": { get: {}, post: {}, patch: {}, delete: {} },
        "/unexpected": { head: {} },
      },
    } satisfies PostgREST.SupabaseOpenAPIDocument;
    expect(PostgREST.table_is_get_only(document, "view")).toBe(true);
    expect(PostgREST.table_is_get_only(document, "table")).toBe(false);
    expect(
      PostgREST.parse_supabase_postgrest_table_path(document, "missing")
    ).toEqual({ methods: [] });
    expect(PostgREST.table_methods_is_get_only([])).toBe(false);
    expect(() =>
      PostgREST.parse_supabase_postgrest_table_path(document, "unexpected")
    ).toThrow("Unsupported PostgREST path method: head");
  });
});
