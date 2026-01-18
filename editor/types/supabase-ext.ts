import type { Database } from "@app/database";

const schema = "grida_forms" as const;

type SchemaKey = keyof Database;

export type Row<S extends SchemaKey, T extends keyof Database[S]["Tables"]> =
  // @ts-expect-error - Complex generic type inference
  Database[S]["Tables"][T]["Row"];

export type InsertDto<
  S extends SchemaKey,
  T extends keyof Database[S]["Tables"],
> =
  // @ts-expect-error - Complex generic type inference
  Database[S]["Tables"][T]["Insert"];

export type UpdateDto<
  S extends SchemaKey,
  T extends keyof Database[S]["Tables"],
> =
  // @ts-expect-error - Complex generic type inference
  Database[S]["Tables"][T]["Update"];

export type UpsertDto<
  S extends SchemaKey,
  T extends keyof Database[S]["Tables"],
> = InsertDto<S, T>;

export type DontCastJsonProperties<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: any;
};
