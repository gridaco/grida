import { GridaSupabase } from "@/types";
import Axios from "axios";

export namespace PrivateEditorApi {
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
        data: GridaSupabase.SupabaseProject & {
          tables: GridaSupabase.SupabaseTable[];
          main_supabase_table_id: number;
        };
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
  }
}
