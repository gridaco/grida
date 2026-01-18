// eslint-disable-next-line @typescript-eslint/no-require-imports
const example = require("./supabase-postgrest-swagger.dummy.example.json");
import { SupabasePostgRESTOpenApi } from "./parse";

describe("parse fk", () => {
  it("should parse fk from description", () => {
    const _ =
      SupabasePostgRESTOpenApi.parse_supabase_postgrest_property_description(
        "col",
        "Note:\nThis is a Foreign Key to `t1.id`.<fk table='t1' column='id'/>"
      );

    expect(_.fk).toEqual({
      referencing_column: "col",
      referenced_column: "id",
      referenced_table: "t1",
    } satisfies SupabasePostgRESTOpenApi.PostgRESTColumnRelationship);
  });

  it("should return empty array fks when no fks", () => {
    const _ =
      SupabasePostgRESTOpenApi.parse_supabase_postgrest_schema_definition(
        example["definitions"]["t1"]
      );
    expect(_.fks).toEqual([]);
  });

  it("should return empty array fks when no fks", () => {
    const _ = SupabasePostgRESTOpenApi.parse_postgrest_property_meta(
      "t1",
      example["definitions"]["t2"]["properties"]["t1"],
      example["definitions"]["t2"]["required"]
    );

    expect(_).toEqual({
      name: "t1",
      type: "integer",
      format: "bigint",
      scalar_format: "bigint",
      array: false,
      enum: undefined,
      description:
        "Note:\nThis is a Foreign Key to `t1.id`.<fk table='t1' column='id'/>",
      pk: false,
      fk: {
        referencing_column: "t1",
        referenced_table: "t1",
        referenced_column: "id",
      },
      default: undefined,
      null: true,
    } satisfies SupabasePostgRESTOpenApi.PostgRESTColumnMeta);
  });
});
