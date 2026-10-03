import type { Database } from "./index";

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
  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- intentional type erasure for JSON column types from Supabase
  [P in K]: any;
};
