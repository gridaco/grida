import type { GridaSupabase } from "@/types";
import {
  CreateNewSchemaTableRequest,
  CreateNewSchemaTableResponse,
  CreateSignedUploadUrlRequest,
  EditorApiResponse,
  EditorApiResponseOk,
  SignedUploadUrlData,
  StoragePublicUrlData,
  UpdateFormAccessForceClosedRequest,
  UpdateFormAccessMaxResponseByCustomerRequest,
  UpdateFormAccessMaxResponseInTotalRequest,
  UpdateFormMethodRequest,
  UpdateFormRedirectAfterSubmissionRequest,
  UpdateFormScheduleRequest,
  UpdateFormUnknownFieldsHandlingStrategyRequest,
  XSupabasePrivateApiTypes,
} from "@/types/private/api";
import Axios from "axios";
import { PostgrestQuery } from "@/lib/supabase-postgrest/postgrest-query";
import { XSupabaseQuery } from "@/lib/supabase-postgrest/builder";
import { PostgrestSingleResponse } from "@supabase/postgrest-js";

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

  export namespace Schema {
    export function createTable(req: CreateNewSchemaTableRequest) {
      return Axios.post<EditorApiResponse<CreateNewSchemaTableResponse>>(
        `/private/editor/schema/${req.schema_id}/tables/new`,
        req
      );
    }
  }

  export namespace Settings {
    export function updateFormRedirectAfterSubmission(
      data: UpdateFormRedirectAfterSubmissionRequest
    ) {
      return Axios.post<EditorApiResponseOk>(
        `/private/editor/settings/redirect-uri`,
        data
      );
    }

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

    export function updateFormMethod(data: UpdateFormMethodRequest) {
      return Axios.post<EditorApiResponseOk>(
        `/private/editor/settings/form-method`,
        data
      );
    }

    export function updateUnknownFieldsHandlingStrategy(
      data: UpdateFormUnknownFieldsHandlingStrategyRequest
    ) {
      return Axios.post<EditorApiResponseOk>(
        `/private/editor/settings/unknown-fields`,
        data
      );
    }
  }

  export namespace SupabaseConnection {
    /**
     * request body for creating a new supabase project connection
     * grida_x_supabase.supabase_project
     */
    export type CreateProjectConnectionRequest = {
      sb_anon_key: string;
      sb_project_url: string;
    };

    export async function createConnection(
      form_id: string,
      data: CreateProjectConnectionRequest
    ) {
      return Axios.post(`/private/editor/connect/${form_id}/supabase`, data);
    }

    export async function refreshConnection(form_id: string) {
      return Axios.patch<EditorApiResponse<GridaSupabase.SupabaseProject>>(
        `/private/editor/connect/${form_id}/supabase`
      );
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

    export async function addCustomSchema(
      form_id: string,
      data: XSupabasePrivateApiTypes.AddSchemaNameRequestData
    ) {
      return Axios.post<EditorApiResponse<GridaSupabase.SupabaseProject>>(
        `/private/editor/connect/${form_id}/supabase/custom-schema`,
        data
      );
    }

    export async function createConnectionTable(
      form_id: string,
      data: XSupabasePrivateApiTypes.CreateConnectionTableRequestData
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

    export const url_table_auth_users_query = (
      form_id: string,
      serachParams: URLSearchParams | string
    ) =>
      `/private/editor/connect/${form_id}/supabase/table/auth.users/query?${serachParams}`;

    export const url_table_x_query = (
      form_id: string,
      supabase_table_id: number,
      serachParams?: URLSearchParams | string
    ) =>
      `/private/editor/connect/${form_id}/supabase/table/${supabase_table_id}/query${serachParams ? `?${serachParams}` : ""}`;
  }

  export namespace SupabaseQuery {
    export function makeQueryParams({
      limit,
      order,
      refreshKey,
    }: {
      limit?: number;
      order?: PostgrestQuery.ParsedOrderBy;
      refreshKey?: number | number;
    }) {
      //
      const params = new URLSearchParams();

      if (limit) params.append("limit", limit.toString());

      if (order)
        params.append("order", PostgrestQuery.createOrderByQueryString(order));

      if (refreshKey) params.append("r", refreshKey.toString());

      return params;
    }

    export async function qdelete({
      form_id,
      main_table_id,
      filters,
    }: {
      form_id: string;
      main_table_id: number;
      filters: ReadonlyArray<XSupabaseQuery.Filter>;
    }) {
      return Axios.request<PostgrestSingleResponse<any>>({
        method: "DELETE",
        url: `/private/editor/connect/${form_id}/supabase/table/${main_table_id}/query`,
        data: { filters } satisfies XSupabaseQuery.Body,
      });
    }
  }
}
