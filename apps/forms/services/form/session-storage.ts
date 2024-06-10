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

export const requesturl = ({ session_id, field_id }: SessionStoragePath) =>
  `/v1/session/${session_id}/field/${field_id}/upload/signed-url`;

const tmp_storage_object_path = ({
  session_id,
  field_id,
  unique,
  name,
}: SessionStoragePath & {
  unique?: string;
  name?: string;
}) => {
  const _ = `${GRIDA_FORMS_RESPONSE_BUCKET_TMP_STARTS_WITH}${session_id}/${field_id}`;

  const paths = [_, unique, name].filter(Boolean);

  return paths.join("/");
};

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
  unique?: boolean
) {
  const namer = new UniqueFileNameGenerator(undefined, {
    // the comma in file name (which is allowed by the storage) needs to be rejected with our file uploader since it uses the uploaded file paths as <input type='text'/> value, which on serverside, needs to be parsed with .split(',') for multiple file uploads.
    rejectComma: true,
  });

  return sign(
    tmp_storage_object_path({
      ...path,
      unique: unique ? Date.now().toString() : undefined,
      name: namer.name(name),
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

/**
 * @deprecated forms agent by default, now uses 'requesturl' strategy instead of 'presignedurl' strategy.
 * @param session_id
 * @param fields
 * @returns {Promise<Record<string, { path: string; token: string; }[]>>}
 *
 * @example
 * ```
 * const field_upload_urls = await prepare_presigned_upload_url_for_fields(
 *   session.id,
 *   fields
 * );
 * const resolver = (field_id: string) => ({
 *   type: "signedurl",
 *   signed_urls: field_upload_urls[field_id],
 * });
 * ```
 *
 */
export async function prepare_presigned_upload_url_for_fields(
  session_id: string,
  fields: {
    id: string;
    type: "file" | "image";
    multiple: boolean;
  }[]
) {
  // region file upload presigned urls
  const field_upload_urls: Record<
    string,
    Array<{
      path: string;
      token: string;
    }>
  > = {};

  for (const field of fields) {
    const urls = await prepare_response_file_upload_storage_presigned_url(
      {
        session_id: session_id,
        field_id: field.id,
      },
      field.multiple ? GRIDA_FORMS_RESPONSE_FILES_MAX_COUNT_PER_FIELD : 1
    );
    field_upload_urls[field.id] = urls;
  }

  return field_upload_urls;
}
