import { FieldSupports } from "@/k/supported_field_types";
import type { FormFieldDefinition, XSupabaseStorageSchema } from "@/types";
import assert from "assert";
import type { XSupabase } from ".";

export type XSupabaseStorageTaskPoolerResult = Record<
  string,
  Record<
    string,
    | {
        /**
         * available if the bucket if public
         */
        publicUrl: string | null;
        signedUrl: string;
        path: string;
      }[]
    | null
  >
>;

/**
 * A task pooler for creating signed urls for x-supabase storage fields.
 * This is used to queue multiple tasks and resolve them in bulk.
 *
 * Since supabase storage api can be called per bucket, this manages multiple dynamic storage tasks and resolves as whole.
 *
 * TODO: Improvements:
 * - When the path is already rendered and can be trusted (non dynamic path) we may skip the existence check.
 * - When this is used only for reading, we may check if the bucket is public and skip the signed url request.
 */
export class XSupabaseStorageCrossBucketTaskPooler {
  private tasks: Record<
    string,
    Promise<Record<string, XSupabase.Storage.CreateSignedUrlsResult["data"]>>
  > = {};

  constructor(private readonly storage: XSupabase.Storage.ConnectedClient) {}

  queue(
    fields: Pick<FormFieldDefinition, "id" | "storage" | "type">[],
    rows: ReadonlyArray<Record<string, any>>,
    pkcol: string
  ) {
    const x_supabase_storage_file_fields = fields.filter(
      (f) =>
        FieldSupports.file_alias(f.type) &&
        (f.storage as XSupabaseStorageSchema)?.type === "x-supabase"
    );

    for (const row of rows) {
      const pk = row[pkcol];
      assert(pk, `pk "${pkcol}" not found in row ${JSON.stringify(row)}`);
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
  async resolve(): Promise<XSupabaseStorageTaskPoolerResult> {
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
