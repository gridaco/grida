import { client as grida_forms_client } from "@/lib/supabase/server";
import assert from "assert";
import {
  GRIDA_FORMS_RESPONSE_BUCKET,
  GRIDA_FORMS_RESPONSE_BUCKET_TMP_FOLDER,
  GRIDA_FORMS_RESPONSE_FILES_MAX_COUNT_PER_FIELD,
} from "@/k/env";
import { UniqueFileNameGenerator } from "@/lib/forms/storage";
import type { SupabaseClient } from "@supabase/supabase-js";

interface SessionStoragePath {
  session_id: string;
  field_id: string;
}

export const requesterurl = ({ session_id, field_id }: SessionStoragePath) =>
  `/v1/session/${session_id}/field/${field_id}/file/upload/signed-url`;

export const resolverurl = ({ session_id, field_id }: SessionStoragePath) =>
  `/v1/session/${session_id}/field/${field_id}/file/preview/public-url`;

/**
 * build the path for the temporary storage object
 *
 * @param session_id required
 * @param field_id required
 * @param unique optional
 * @param name optional
 *
 * @returns
 *  1. `tmp/[session_id]/[field_id]/[name]`
 *  2. `tmp/[session_id]/[unique]/[field_id]/[name]`
 */
const tmp_storage_object_path = ({
  session_id,
  field_id,
  unique,
  name,
}: SessionStoragePath & {
  unique?: string;
  name?: string;
}) => {
  const _ = `${GRIDA_FORMS_RESPONSE_BUCKET_TMP_FOLDER}/${session_id}/${field_id}`;

  const paths = [_, unique, name].filter(Boolean);

  return paths.join("/");
};

/**
 * parse the temporary storage object path
 *
 * @param path
 *  1. `tmp/[session_id]/[field_id]`
 *  2. `tmp/[session_id]/[unique]/[field_id]`
 *
 * @returns
 * 1. { session_id, field_id, name }
 * 2. { session_id, field_id, unique, name }
 */
export const parse_tmp_storage_object_path = (path: string) => {
  const parts = path.split("/");

  const tmp = parts[0];
  assert(
    tmp === GRIDA_FORMS_RESPONSE_BUCKET_TMP_FOLDER,
    `invalid path. expected '${GRIDA_FORMS_RESPONSE_BUCKET_TMP_FOLDER}', got '${tmp}'`
  );
  const session_id = parts[1];
  const field_id = parts[2];

  if (parts.length === 4) {
    return {
      session_id,
      field_id,
      name: parts[3],
    };
  }

  if (parts.length === 5) {
    return {
      session_id,
      field_id,
      unique: parts[3],
      name: parts[4],
    };
  }

  assert(false, "invalid path");
};

export class FileStorage {
  constructor(
    readonly client: SupabaseClient<any, any>,
    readonly bucket: string
  ) {
    //
  }

  createSignedUploadUrl(path: string, options?: { upsert: boolean }) {
    return (
      this.client.storage
        .from(this.bucket)
        // valid for 2 hours - https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl
        .createSignedUploadUrl(path, options)
    );
  }

  getPublicUrl(path: string) {
    return this.client.storage.from(this.bucket).getPublicUrl(path);
  }
}

export class SessionStagedFileStorage extends FileStorage {
  async createStagedSignedUploadUrl(
    path: SessionStoragePath,
    name: string,
    unique?: boolean
  ) {
    const namer = new UniqueFileNameGenerator(undefined, {
      // the comma in file name (which is allowed by the storage) needs to be rejected with our file uploader since it uses the uploaded file paths as <input type='text'/> value, which on serverside, needs to be parsed with .split(',') for multiple file uploads.
      rejectComma: true,
    });

    return this.createSignedUploadUrl(
      tmp_storage_object_path({
        ...path,
        unique: unique ? Date.now().toString() : undefined,
        name: namer.name(name),
      })
    );
    //
  }

  async resolveStagedFile(tmp: string, target: string) {
    return this.client.storage.from(this.bucket).move(tmp, target);
  }
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

  const storage = new SessionStagedFileStorage(
    grida_forms_client,
    GRIDA_FORMS_RESPONSE_BUCKET
  );

  const tasks = [];

  for (let i = 0; i < n; i++) {
    const task = storage.createSignedUploadUrl(
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
