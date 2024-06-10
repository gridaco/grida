import { client } from "@/lib/supabase/server";
import assert from "assert";
import {
  GRIDA_FORMS_RESPONSE_BUCKET,
  GRIDA_FORMS_RESPONSE_BUCKET_TMP_STARTS_WITH,
  GRIDA_FORMS_RESPONSE_FILES_MAX_COUNT_PER_FIELD,
} from "@/k/env";
import { UniqueFileNameGenerator } from "@/lib/forms/storage";

interface SessionStoragePath {
  session_id: string;
  field_id: string;
}

const tmp_storage_object_path = ({
  session_id,
  field_id,
  name,
}: SessionStoragePath & {
  name?: string;
}) =>
  !!name
    ? `${GRIDA_FORMS_RESPONSE_BUCKET_TMP_STARTS_WITH}${session_id}/${field_id}/${name}`
    : `${GRIDA_FORMS_RESPONSE_BUCKET_TMP_STARTS_WITH}${session_id}/${field_id}`;

function sign(path: string) {
  return (
    client.storage
      .from(GRIDA_FORMS_RESPONSE_BUCKET)
      // valid for 2 hours - https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl
      .createSignedUploadUrl(path)
  );
}

export async function response_file_upload_storage_presigned_url(
  path: SessionStoragePath,
  name: string,
  replace: boolean = false
) {
  const namer = new UniqueFileNameGenerator();

  if (!replace) {
    const { data } = await client.storage
      .from(GRIDA_FORMS_RESPONSE_BUCKET)
      .list(tmp_storage_object_path(path));

    const existing = data?.map((d) => d.name) ?? [];

    namer.seed(new Set(existing));
  }

  const newuniquename = namer.name(name);

  return sign(
    tmp_storage_object_path({
      ...path,
      name: newuniquename,
    })
  );
  //
}

/**
 * pre-generate signed upload urls for response file uploads - used when session is created
 * @param session_id
 * @param field_id
 * @param n
 * @returns
 */
export async function prepare_response_file_upload_storage_presigned_url(
  path: SessionStoragePath,
  n: number
): Promise<
  Array<{
    path: string;
    token: string;
  }>
> {
  const { session_id, field_id } = path;
  assert(n > 0, "n should be greater than 0");
  assert(
    n <= GRIDA_FORMS_RESPONSE_FILES_MAX_COUNT_PER_FIELD,
    "n should be less than " + GRIDA_FORMS_RESPONSE_FILES_MAX_COUNT_PER_FIELD
  );

  const tasks = [];

  for (let i = 0; i < n; i++) {
    const task = sign(
      tmp_storage_object_path({
        name: i.toString(),
        field_id: field_id,
        session_id: session_id,
      })
    );
    tasks.push(task);
  }

  const results = await Promise.all(tasks);

  const failures = results.filter((r) => r.error);

  if (failures.length > 0) {
    console.error("session/sign-upload-urls/failures", failures);
  }

  return results.map((r) => r.data).filter(Boolean) as Array<{
    path: string;
    token: string;
  }>;
}
