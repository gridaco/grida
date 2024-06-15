import { GridaSupabase } from "@/types";
import Axios from "axios";

export namespace PrivateEditorApi {
  export namespace SupabaseConnection {
    export async function sbconn_create_connection(
      form_id: string,
      data: {
        sb_anon_key: string;
        sb_project_url: string;
      }
    ) {
      return Axios.post(`/private/editor/connect/${form_id}/supabase`, data);
    }

    export async function sbconn_refresh_connection(form_id: string) {
      return Axios.patch(`/private/editor/connect/${form_id}/supabase`);
    }

    export async function sbconn_get_connection(form_id: string) {
      return Axios.get<{
        data: GridaSupabase.SupabaseProject & {
          connection_table: GridaSupabase.SupabaseTable | null;
        };
      }>(`/private/editor/connect/${form_id}/supabase`);
    }

    export async function sbconn_remove_connection(form_id: string) {
      return Axios.delete(`/private/editor/connect/${form_id}/supabase`);
    }

    export async function sbconn_create_secret(
      form_id: string,
      data: { secret: string }
    ) {
      return Axios.post(
        `/private/editor/connect/${form_id}/supabase/secure-service-key`,
        data
      );
    }

    export async function sbconn_reveal_secret(form_id: string) {
      return Axios.get(
        `/private/editor/connect/${form_id}/supabase/secure-service-key`
      );
    }

    export async function sbconn_create_connection_table(
      form_id: string,
      data: { table: string }
    ) {
      return Axios.put(
        `/private/editor/connect/${form_id}/supabase/table`,
        data
      );
    }
  }
}
