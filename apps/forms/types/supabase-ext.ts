import type { Database } from "@/database.types";

const schema = "grida_forms" as const;

export type Row<T extends keyof Database[typeof schema]["Tables"]> =
  Database[typeof schema]["Tables"][T]["Row"];
export type InsertDto<T extends keyof Database[typeof schema]["Tables"]> =
  Database[typeof schema]["Tables"][T]["Insert"];
export type UpdateDto<T extends keyof Database[typeof schema]["Tables"]> =
  Database[typeof schema]["Tables"][T]["Update"];
