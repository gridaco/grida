import { createClientFormsClient } from "@/supabase/client";
import {
  GRIDA_FORMS_RESPONSE_BUCKET,
  GRIDA_FORMS_RESPONSE_BUCKET_UPLOAD_LIMIT,
  GRIDA_FORMS_RESPONSE_MULTIPART_FILE_UOLOAD_LIMIT,
} from "@/k/env";
import type {
  FileResolveStrategy,
  FileResolveStrategyRequestUrl,
  FileUploadStrategy,
} from "@/lib/forms";
import type {
  CreateSessionSignedUploadUrlRequest,
  FormsApiResponse,
  StoragePublicUrlData,
  SessionSignedUploadUrlData,
} from "@/types/private/api";
import { SupabaseStorageExtensions } from "@/supabase/storage-ext";

export type FileUploaderFn = (
  file: File
) => Promise<{ path?: string; fullPath?: string }>;

export type FileResolverFn = (file: {
  path: string;
}) => Promise<{ publicUrl: string } | null>;

export function getMaxUploadSize(strategy?: FileUploadStrategy["type"]) {
  switch (strategy) {
    case "requesturl":
    case "signedurl":
      return GRIDA_FORMS_RESPONSE_BUCKET_UPLOAD_LIMIT;
    case "multipart":
    default:
      return GRIDA_FORMS_RESPONSE_MULTIPART_FILE_UOLOAD_LIMIT;
  }
}

export function makeUploader(strategy?: FileUploadStrategy) {
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

async function makeSignedUrlUploader({
  signed_urls,
}: {
  signed_urls: { path: string; token: string }[];
}) {
  const supabase = createClientFormsClient();

  return async (file: File, i: number) => {
    const { path, token } = signed_urls[i];

    const { data: uploaded } = await supabase.storage
      .from(GRIDA_FORMS_RESPONSE_BUCKET)
      .uploadToSignedUrl(path, token, file, {
        upsert: true,
      });

    return { path: uploaded?.path };
  };
}

function makeRequestUrlUploader({ request_url }: { request_url: string }) {
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
      const { signedUrl, path, token } = data;

      // const { data: uploaded } = await supabase.storage
      //   .from(GRIDA_FORMS_RESPONSE_BUCKET)
      //   .uploadToSignedUrl(path, token, file, {
      //     upsert: true,
      //   });

      // using this for more dynamic control - x-supabase integrations
      const { data: uploaded } =
        await SupabaseStorageExtensions.uploadToSupabaseS3SignedUrl(
          signedUrl,
          file
        );

      return { path: uploaded?.path, fullpath: uploaded?.fullPath };
    } else {
      throw new Error("Failed to get signed url");
    }
  };
}

export function makeResolver(strategy?: FileResolveStrategy) {
  switch (strategy?.type) {
    case "requesturl":
      return makeRequestUrlResolver(strategy);
    case "none":
    default:
      return undefined;
  }
}

function makeRequestUrlResolver({
  resolve_url,
}: FileResolveStrategyRequestUrl): FileResolverFn {
  return async (file: { path: string }) => {
    const params = new URLSearchParams({ path: file.path });
    const url = `${resolve_url}?${params.toString()}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = (await res.json()) as FormsApiResponse<StoragePublicUrlData>;
    return data.data;
  };
}
