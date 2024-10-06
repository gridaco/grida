import type { DGColumn } from "../grid";
import { FormInputType } from "@/types";
import type { Data } from "@/lib/data";
import { GridDataXSBUnknown } from "../grid-editor/grid-data-xsb-unknow";
import { PGSupportedColumnType } from "@/lib/pg-meta/@types/pg";

const media_types: FormInputType[] = ["image", "video", "audio"] as const;

const media_col_sort_priority = (col: DGColumn) => {
  switch (col.type) {
    case "video":
      return 2;
    case "audio":
      return 1;
    case "image":
      return 0;
    default:
      return -1;
  }
};

const media_col_sort_fn = (a: DGColumn, b: DGColumn) => {
  return media_col_sort_priority(a) - media_col_sort_priority(b);
};

const devonly_types: PGSupportedColumnType[] = [
  "uuid",
  "json",
  "jsonb",
  "bytea",
  "cidr",
  "hstore",
  "inet",
  // ts vectors
  "tsmultirange",
  "tsquery",
  "tsrange",
  "tstzmultirange",
  "tstzrange",
  "tsvector",
  "xml",
];

export function analyze({
  definition,
  columns,
}: {
  definition: Data.Relation.TableDefinition;
  columns: DGColumn[];
}) {
  const keys = Object.keys(definition.properties);

  const devpropertykeys = keys.filter(
    (key) =>
      devonly_types.includes(definition.properties[key].scalar_format) ||
      !!definition.properties[key].fk ||
      definition.properties[key].pk
  );

  const normalpropertykeys = keys
    .filter((key) => devpropertykeys.indexOf(key) === -1)
    .sort(GridDataXSBUnknown.sort_unknow_table_properties_by_priorities);

  const virtual_columns = columns.filter((col) => {
    return !keys.includes(col.key);
  });

  const virtual_media_columns = virtual_columns.filter((col) => {
    return col.type && media_types.includes(col.type);
  });

  const prioritiezed_virtual_media_columns =
    virtual_media_columns.sort(media_col_sort_fn);

  const primary_virtual_media_column =
    prioritiezed_virtual_media_columns.length > 0
      ? prioritiezed_virtual_media_columns[0]
      : null;

  return {
    devpropertykeys,
    normalpropertykeys,
    primary_virtual_media_column,
    prioritiezed_virtual_media_columns,
  };
}
