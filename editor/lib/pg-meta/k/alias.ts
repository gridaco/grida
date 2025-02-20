import { PGSupportedColumnType } from "../@types/pg";

/**
 * this is used for ui display with limited space
 *
 * below mapping is treated as exact same type
 */
const shorter_alias: Partial<
  Record<PGSupportedColumnType, PGSupportedColumnType>
> = {
  timestamp: "timestamp",
  "timestamp without time zone": "timestamp",
  "timestamp with time zone": "timestamptz",
  time: "time",
  "time without time zone": "time",
  "time with time zone": "timetz",
  boolean: "bool",
  smallint: "int2",
  integer: "int4",
  bigint: "int8",
  "double precision": "float8",
  character: "char",
  "character varying": "varchar",
};

export function toShorter(
  type: PGSupportedColumnType | (string & {})
): PGSupportedColumnType | string {
  return shorter_alias[type as PGSupportedColumnType] || type;
}
