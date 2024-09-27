import { FieldSupports } from "@/k/supported_field_types";
import type { FormFieldDefinition, XSupabaseStorageSchema } from "@/types";
import assert from "assert";
import type { XSupabase } from ".";

export type GridaXSupabaseStorageTaskPoolerResult = Record<
  string,
  Record<
    string,
    | {
        signedUrl: string;
        path: string;
      }[]
    | null
  >
>;

export class GridaXSupabaseStorageTaskPooler {
  private tasks: Record<
    string,
    Promise<Record<string, XSupabase.Storage.CreateSignedUrlsResult["data"]>>
  > = {};

  constructor(private readonly storage: XSupabase.Storage.ConnectedClient) {}

  queue(
    fields: Pick<FormFieldDefinition, "id" | "storage" | "type">[],
    rows: ReadonlyArray<Record<string, any>>
  ) {
    const x_supabase_storage_file_fields = fields.filter(
      (f) =>
        FieldSupports.file_alias(f.type) &&
        (f.storage as XSupabaseStorageSchema)?.type === "x-supabase"
    );

    for (const row of rows) {
      // FIXME: get pk based on table schema (alternatively, we can use index as well - doesnt have to be a data from a fetched row)
      const pk = row.id;
      const task = this.storage.createSignedUrls(
        row,
        x_supabase_storage_file_fields.map((ff) => ({
          ...(ff.storage as XSupabaseStorageSchema),
          id: ff.id,
        }))
      );

      this.tasks[pk] = task;
    }

    return this.tasks;
  }
  async resolve(): Promise<GridaXSupabaseStorageTaskPoolerResult> {
    const resolvedEntries = await Promise.all(
      Object.entries(this.tasks).map(async ([rowId, task]) => {
        const result = await task;

        const success = Object.entries(result).reduce((acc, [fieldId, r]) => {
          if (r) {
            return {
              ...acc,
              [fieldId]: r.filter((r) => r.signedUrl),
            };
          }

          return acc;
        }, {});

        return [rowId, success];
      })
    );

    return Object.fromEntries(resolvedEntries);
  }
}
