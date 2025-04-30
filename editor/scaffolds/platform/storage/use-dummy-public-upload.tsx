"use client";

import { Env } from "@/env";
import { v4 } from "uuid";
import { useUpload } from "./use-upload";

/**
 * public, temporary file uploader to playground bucket
 * for internal dev or public tmp playgrounds
 */
export function useDummyPublicUpload() {
  return useUpload(Env.storage.BUCKET_DUMMY, () => {
    return `public/${v4()}`;
  });
}
