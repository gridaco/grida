import { createClientFormsClient } from "@/lib/supabase/client";
import { GRIDA_FORMS_RESPONSE_BUCKET } from "@/k/env";
import type { FieldUploadStrategy } from "@/lib/forms";
import type {
  CreateSessionSignedUploadUrlRequest,
  FormsApiResponse,
  SessionSignedUploadUrlData,
} from "@/types/private/api";

export type FileUploaderFn = (file: File) => Promise<{ path?: string }>;

export function makeUploader(strategy?: FieldUploadStrategy) {
  switch (strategy?.type) {
    case "signedurl":
      // return makeSignedUrlUploader(strategy);
      throw new Error("Not implemented");
    case "requesturl":
      return makeRequestUrlUploader(strategy);
    case "multipart":
    default:
      return undefined;
  }
}

export async function makeSignedUrlUploader({
  signed_urls,
}: {
  signed_urls: { path: string; token: string }[];
}) {
  const supabase = createClientFormsClient();

  return async (file: File, i: number) => {
    const { path, token } = signed_urls[i];

    const { data: uploaded } = await supabase.storage
      .from(GRIDA_FORMS_RESPONSE_BUCKET)
      .uploadToSignedUrl(path, token, file);

    return { path: uploaded?.path };
  };
}

export function makeRequestUrlUploader({
  request_url,
}: {
  request_url: string;
}) {
  const supabase = createClientFormsClient();

  return async (file: File) => {
    const res = await fetch(request_url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(<CreateSessionSignedUploadUrlRequest>{
        file: {
          name: file.name,
          size: file.size,
        },
      }),
    });

    const { data } =
      (await res.json()) as FormsApiResponse<SessionSignedUploadUrlData>;

    if (data) {
      const { path, token } = data;

      const { data: uploaded } = await supabase.storage
        .from(GRIDA_FORMS_RESPONSE_BUCKET)
        .uploadToSignedUrl(path, token, file);

      return { path: uploaded?.path };
    } else {
      return { path: undefined };
    }
  };
}
