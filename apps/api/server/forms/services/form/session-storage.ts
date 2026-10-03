import assert from "assert";
import { GRIDA_FORMS_RESPONSE_BUCKET_TMP_FOLDER } from "../../k/env";
import { FormsApiPaths, UniqueFileNameGenerator } from "@grida/forms";
import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "../../config";

interface SessionStoragePath {
  session_id: string;
  field_id: string;
}

export const requesterurl = ({ session_id, field_id }: SessionStoragePath) =>
  `${config.apiOrigin()}${FormsApiPaths.fieldUploadSignedUrl(session_id, field_id)}`;

export const resolverurl = ({ session_id, field_id }: SessionStoragePath) =>
  `${config.apiOrigin()}${FormsApiPaths.fieldPreviewPublicUrl(session_id, field_id)}`;

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
 *  2. `tmp/[session_id]/[field_id]/[unique]/[name]`
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
 *  2. `tmp/[session_id]/[field_id]/[unique]/[name]`
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

export class SessionStagedFileStorage {
  constructor(
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- Caller-owned dynamic Supabase client.
    readonly client: SupabaseClient<any, any>,
    readonly bucket: string
  ) {}

  async createStagedSignedUploadUrl(
    path: SessionStoragePath,
    name: string,
    unique?: boolean
  ) {
    const namer = new UniqueFileNameGenerator(undefined, {
      // the comma in file name (which is allowed by the storage) needs to be rejected with our file uploader since it uses the uploaded file paths as <input type='text'/> value, which on serverside, needs to be parsed with .split(',') for multiple file uploads.
      rejectComma: true,
    });

    return this.client.storage.from(this.bucket).createSignedUploadUrl(
      tmp_storage_object_path({
        ...path,
        unique: unique ? Date.now().toString() : undefined,
        name: namer.name(name),
      })
    );
    //
  }

  async commitStagedFile(tmp: string, target: string) {
    return this.client.storage.from(this.bucket).move(tmp, target);
  }
}
