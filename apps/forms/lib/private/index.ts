import type { GridaXSupabase } from "@/types";
import {
  CreateNewSchemaTableRequest,
  CreateNewSchemaTableResponse,
  CreateNewSchemaTableWithXSBTableConnectionRequest,
  CreateNewSchemaTableWithXSBTableConnectionResponse,
  CreateSignedUploadUrlRequest,
  DeleteSchemaTableRequest,
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

  export namespace Schema {
    export function createTable(req: CreateNewSchemaTableRequest) {
      return Axios.post<EditorApiResponse<CreateNewSchemaTableResponse>>(
        `/private/editor/schema/${req.schema_id}/tables/new`,
        req
      );
    }

    export function createTableWithXSBTable(
      req: CreateNewSchemaTableWithXSBTableConnectionRequest
    ) {
      return Axios.post<
        EditorApiResponse<CreateNewSchemaTableWithXSBTableConnectionResponse>
      >(
        `/private/editor/schema/${req.schema_id}/tables/new/with-x-sb-table`,
        req
      );
    }

    export function deleteTable(req: DeleteSchemaTableRequest) {
      return Axios.delete<EditorApiResponse<CreateNewSchemaTableResponse>>(
        `/private/editor/schema/${req.schema_id}/tables/${req.table_id}`,
        {
          data: {
            user_confirmation_txt: req.user_confirmation_txt,
          },
        }
      );
    }
  }

  export namespace XSupabase {
    // #region supabase project

    /**
     * request body for creating a new supabase project connection
     * grida_x_supabase.supabase_project
     */
    export type CreateProjectConnectionRequest = {
      project_id: number;
      sb_anon_key: string;
      sb_project_url: string;
    };

    export async function createXSBProjectConnection(
      data: CreateProjectConnectionRequest
    ) {
      return Axios.post<EditorApiResponse<GridaXSupabase.SupabaseProject>>(
        `/private/editor/x-supabase/projects`,
        data
      );
    }

    export async function getXSBProject(supabase_project_id: number) {
      return Axios.get<{
        data: XSupabasePrivateApiTypes.GetSupabaseProjectData;
      }>(`/private/editor/x-supabase/projects/${supabase_project_id}`);
    }

    export async function getXSBProjectByGridaProjectId(project_id: number) {
      return Axios.get<{
        data: XSupabasePrivateApiTypes.GetSupabaseProjectData;
      }>(`/private/editor/x-supabase/projects?grida_project_id=${project_id}`);
    }

    export async function deleteXSBProjectConnection(
      supabase_project_id: number
    ) {
      return Axios.delete(
        `/private/editor/x-supabase/projects/${supabase_project_id}`
      );
    }

    export async function createXSBProjectServiceRoleKey(
      supabase_project_id: number,
      data: { secret: string }
    ) {
      return Axios.post(
        `/private/editor/x-supabase/projects/${supabase_project_id}/secure-service-key`,
        data
      );
    }

    export async function revealXSBProjectServiceRoleKey(
      supabase_project_id: number
    ) {
      return Axios.get(
        `/private/editor/x-supabase/projects/${supabase_project_id}/secure-service-key`
      );
    }

    export async function refreshXSBProjectSchema(supabase_project_id: number) {
      return Axios.patch<EditorApiResponse<GridaXSupabase.SupabaseProject>>(
        `/private/editor/x-supabase/projects/${supabase_project_id}`
      );
    }

    export async function registerXSBCustomSchema(
      supabase_project_id: number,
      data: XSupabasePrivateApiTypes.AddSchemaNameRequestData
    ) {
      return Axios.post<EditorApiResponse<GridaXSupabase.SupabaseProject>>(
        `/private/editor/x-supabase/projects/${supabase_project_id}/custom-schema`,
        data
      );
    }

    export async function listXSBBucket(supabase_project_id: number) {
      return Axios.get<{
        data: GridaXSupabase.SupabaseBucket[];
        error: any;
      }>(
        `/private/editor/x-supabase/projects/${supabase_project_id}/storage/buckets`
      );
    }

    export const url_x_auth_users_get = (
      supabase_project_id: number,
      serachParams: URLSearchParams | string
    ) =>
      `/private/editor/x-supabase/projects/${supabase_project_id}/x/auth.users/query?${serachParams}`;

    // #endregion supabase project

    // #region table

    export const url_table_x_query = (
      form_id: string,
      supabase_table_id: number,
      serachParams?: URLSearchParams | string
    ) =>
      `/private/editor/connect/${form_id}/supabase/table/${supabase_table_id}/query${serachParams ? `?${serachParams}` : ""}`;

    // #endregion table
  }

  export namespace Forms {
    export async function connectFormsXSBConnectionTable(
      form_id: string,
      data: XSupabasePrivateApiTypes.CreateConnectionTableRequestData
    ) {
      return Axios.put(
        `/private/editor/forms/${form_id}/connect/with-x-sb-table`,
        data
      );
    }

    // TODO: safely remove
    // export async function getFormsXSBConnectionTable(form_id: string) {
    //   return Axios.get<{ data: GridaSupabase.SupabaseTable; error: any }>(
    //     `/private/editor/forms/${form_id}/connect/with-x-sb-table`
    //   );
    // }

    // TODO: add once ready on ui
    // export async function deleteFormsXSBConnectionTable(form_id: string) {
    //   return Axios.delete(`/private/editor/forms/${form_id}/connect/with-x-sb-table`);
    // }
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
