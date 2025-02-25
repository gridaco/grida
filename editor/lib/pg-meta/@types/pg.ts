import { ColumnType } from "./column-types";

/**
 * @see https://github.com/typeorm/typeorm/blob/e7649d2746f907ff36b1efb600402dedd5f5a499/src/driver/postgres/PostgresDriver.ts#L121
 */
export type PGSupportedColumnType =
  | "int"
  | "int2"
  | "int4"
  | "int8"
  | "smallint"
  | "integer"
  | "bigint"
  | "decimal"
  | "numeric"
  | "real"
  | "float"
  | "float4"
  | "float8"
  | "double precision"
  | "money"
  | "character varying"
  | "varchar"
  | "character"
  | "char"
  | "text"
  | "citext"
  | "hstore"
  | "bytea"
  | "bit"
  | "varbit"
  | "bit varying"
  | "timetz"
  | "timestamptz"
  | "timestamp"
  | "timestamp without time zone"
  | "timestamp with time zone"
  | "date"
  | "time"
  | "time without time zone"
  | "time with time zone"
  | "interval"
  | "bool"
  | "boolean"
  | "enum"
  | "point"
  | "line"
  | "lseg"
  | "box"
  | "path"
  | "polygon"
  | "circle"
  | "cidr"
  | "inet"
  | "macaddr"
  | "tsvector"
  | "tsquery"
  | "uuid"
  | "xml"
  | "json"
  | "jsonb"
  | "int4range"
  | "int8range"
  | "numrange"
  | "tsrange"
  | "tstzrange"
  | "daterange"
  | "int4multirange"
  | "int8multirange"
  | "nummultirange"
  | "tsmultirange"
  | "tstzmultirange"
  | "datemultirange"
  | "geometry"
  | "geography"
  | "cube"
  | "ltree";

export type PGSupportedColumnTypeWithoutArray = Exclude<
  PGSupportedColumnType,
  "array"
>;

export const supportedDataTypes: ColumnType[] = [
  "int",
  "int2",
  "int4",
  "int8",
  "smallint",
  "integer",
  "bigint",
  "decimal",
  "numeric",
  "real",
  "float",
  "float4",
  "float8",
  "double precision",
  "money",
  "character varying",
  "varchar",
  "character",
  "char",
  "text",
  "citext",
  "hstore",
  "bytea",
  "bit",
  "varbit",
  "bit varying",
  "timetz",
  "timestamptz",
  "timestamp",
  "timestamp without time zone",
  "timestamp with time zone",
  "date",
  "time",
  "time without time zone",
  "time with time zone",
  "interval",
  "bool",
  "boolean",
  "enum",
  "point",
  "line",
  "lseg",
  "box",
  "path",
  "polygon",
  "circle",
  "cidr",
  "inet",
  "macaddr",
  "tsvector",
  "tsquery",
  "uuid",
  "xml",
  "json",
  "jsonb",
  "int4range",
  "int8range",
  "numrange",
  "tsrange",
  "tstzrange",
  "daterange",
  "int4multirange",
  "int8multirange",
  "nummultirange",
  "tsmultirange",
  "tstzmultirange",
  "datemultirange",
  "geometry",
  "geography",
  "cube",
  "ltree",
];
