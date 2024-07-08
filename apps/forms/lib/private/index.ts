import type { GridaSupabase } from "@/types";
import {
  CreateSignedUploadUrlRequest,
  EditorApiResponse,
  EditorApiResponseOk,
  SignedUploadUrlData,
  StoragePublicUrlData,
  UpdateFormAccessForceClosedRequest,
  UpdateFormAccessMaxResponseByCustomerRequest,
  UpdateFormAccessMaxResponseInTotalRequest,
  UpdateFormScheduleRequest,
} from "@/types/private/api";
import Axios from "axios";

export namespace PrivateEditorApi {
  export namespace Files {
    export function createSignedUploadUrl({
      form_id,
      field_id,
      row_id,
      file,
    }: {
      form_id: string;
      field_id: string;
      row_id: string;
      file: CreateSignedUploadUrlRequest["file"];
    }) {
      return Axios.post<EditorApiResponse<SignedUploadUrlData>>(
        `/private/editor/${form_id}/rows/${row_id}/fields/${field_id}/files/signed-upload-url`,
        { file }
      );
    }
  }

  export namespace FormFieldFile {
    export function getPublicUrl({
      form_id,
      field_id,
      filepath,
    }: {
      form_id: string;
      field_id: string;
      filepath: string;
    }) {
      return Axios.get<EditorApiResponse<StoragePublicUrlData>>(
        `/private/editor/${form_id}/fields/${field_id}/file/preview/public-url?path=${filepath}`
      );
    }

    export function file_request_upsert_url({
      form_id,
      field_id,
      filepath,
    }: {
      form_id: string;
      field_id: string;
      filepath: string;
    }) {
      return `/private/editor/${form_id}/fields/${field_id}/file/upsert/signed-url?path=${filepath}`;
    }

    export function file_preview_url({
      params,
      options,
    }: {
      params: {
        form_id: string;
        field_id: string;
        filepath: string;
      };
      options?: {
        width?: number;
        download?: boolean;
      };
    }) {
      const { form_id, field_id, filepath } = params;

      const base = `/private/editor/${form_id}/fields/${field_id}/file/preview/src?path=${filepath}`;

      if (options) {
        const { width, download } = options;
        const params = new URLSearchParams();
        if (width) params.set("width", width.toString());
        if (download) params.set("download", "true");

        return base + "&" + params.toString();
      }

      return base;
    }
  }

  export namespace Settings {
    export function updateFormAccessForceClose(
      data: UpdateFormAccessForceClosedRequest
    ) {
      return Axios.post<EditorApiResponseOk>(
        `/private/editor/settings/force-close-form`,
        data
      );
    }

    export function updateFormAccessMaxResponsesByCustomer(
      data: UpdateFormAccessMaxResponseByCustomerRequest
    ) {
      return Axios.post<EditorApiResponseOk>(
        `/private/editor/settings/max-responses-by-customer`,
        data
      );
    }
    export function updateFormAccessMaxResponsesInTotal(
      data: UpdateFormAccessMaxResponseInTotalRequest
    ) {
      return Axios.post<EditorApiResponseOk>(
        `/private/editor/settings/max-responses-in-total`,
        data
      );
    }

    export function updateFormAccessScheduling(
      data: UpdateFormScheduleRequest
    ) {
      return Axios.post<EditorApiResponseOk>(
        `/private/editor/settings/form-schedule`,
        data
      );
    }

    export function updateFormMethod() {}
    export function updateUnknownFieldsHandlingStrategy() {}
  }

  export namespace SupabaseConnection {
    export async function createConnection(
      form_id: string,
      data: {
        sb_anon_key: string;
        sb_project_url: string;
      }
    ) {
      return Axios.post(`/private/editor/connect/${form_id}/supabase`, data);
    }

    export async function refreshConnection(form_id: string) {
      return Axios.patch(`/private/editor/connect/${form_id}/supabase`);
    }

    export async function getConnection(form_id: string) {
      return Axios.get<{
        data: GridaSupabase.SupabaseConnectionState;
      }>(`/private/editor/connect/${form_id}/supabase`);
    }

    export async function removeConnection(form_id: string) {
      return Axios.delete(`/private/editor/connect/${form_id}/supabase`);
    }

    export async function createSecret(
      form_id: string,
      data: { secret: string }
    ) {
      return Axios.post(
        `/private/editor/connect/${form_id}/supabase/secure-service-key`,
        data
      );
    }

    export async function revealSecret(form_id: string) {
      return Axios.get(
        `/private/editor/connect/${form_id}/supabase/secure-service-key`
      );
    }

    export async function createConnectionTable(
      form_id: string,
      data: { table: string }
    ) {
      return Axios.put(
        `/private/editor/connect/${form_id}/supabase/table`,
        data
      );
    }

    export async function getConnectionTable(form_id: string) {
      return Axios.get<{ data: GridaSupabase.SupabaseTable; error: any }>(
        `/private/editor/connect/${form_id}/supabase/table`
      );
    }

    export async function listBucket(form_id: string) {
      return Axios.get<{
        data: GridaSupabase.SupabaseBucket[];
        error: any;
      }>(`/private/editor/connect/${form_id}/supabase/storage/buckets`);
    }
  }
}
