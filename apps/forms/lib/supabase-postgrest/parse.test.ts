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
});
