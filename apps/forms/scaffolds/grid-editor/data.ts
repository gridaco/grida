import {
  FormFieldDefinition,
  FormResponse,
  FormResponseField,
  FormResponseSession,
} from "@/types";
import { fmt_local_index } from "@/utils/fmt";
import type { GFRow } from "../grid/types";
import type { DataGridFilterSettings } from "../editor/state";
import { createClientFormsClient } from "@/lib/supabase/client";
import { SupabaseClient } from "@supabase/supabase-js";
import { GRIDA_FORMS_RESPONSE_BUCKET } from "@/k/env";

export namespace GridData {
  type DataGridInput = {
    fields: FormFieldDefinition[];
    filter: DataGridFilterSettings;
  } & (
    | {
        table: "session";
        sessions: FormResponseSession[];
      }
    | {
        table: "response";
        responses: FormResponse[];
      }
  );

  export function rows(data: DataGridInput) {
    const supabase = createClientFormsClient();

    switch (data.table) {
      case "response":
        return data.responses
          ? rows_from_responses(
              applyFilter(data.responses, data.filter),
              supabase.storage
            )
          : [];
      case "session":
        return data.sessions
          ? rows_from_sessions(
              applyFilter(data.sessions, data.filter),
              data.fields
            )
          : [];
    }
  }

  function rows_from_responses(
    responses: FormResponse[],
    storage: SupabaseClient<any, any>["storage"]
  ) {
    return (
      responses.map((response, index) => {
        const row: GFRow = {
          __gf_id: response.id,
          __gf_display_id: fmt_local_index(response.local_index),
          __gf_created_at: response.created_at,
          __gf_customer_id: response.customer_id,
          fields: {},
        }; // react-data-grid expects each row to have a unique 'id' property
        response?.fields?.forEach((field: FormResponseField) => {
          row.fields[field.form_field_id] = {
            type: field.type,
            value: field.value,
            files: field.storage_object_paths?.map((path) => {
              const src = `/private/editor/${response.form_id}/responses/${response.id}/fields/${field.id}/src?path=${path}`;
              const name = path.split("/").pop() ?? "";
              return {
                src,
                name,
              };
            }),
          };
        });
        return row;
      }) ?? []
    );
  }

  function rows_from_sessions(
    sessions: FormResponseSession[],
    fields: FormFieldDefinition[]
  ) {
    return (
      sessions?.map((session, index) => {
        const row: GFRow = {
          __gf_id: session.id,
          __gf_display_id: session.id,
          __gf_created_at: session.created_at,
          __gf_customer_id: session.customer_id,
          fields: {},
        }; // react-data-grid expects each row to have a unique 'id' property
        Object.entries(session.raw || {}).forEach(([key, value]) => {
          const field = fields.find((f) => f.id === key);
          row.fields[key] = {
            value: value,
            type: field?.type,
          };
        });
        return row;
      }) ?? []
    );
  }

  function applyFilter<
    T extends FormResponse | FormResponseSession =
      | FormResponse
      | FormResponseSession,
  >(
    rows: Array<T>,
    filter: DataGridFilterSettings,
    datakey: keyof T = "raw"
  ): Array<T> {
    const { empty_data_hidden } = filter;
    return rows.filter((row) => {
      if (empty_data_hidden) {
        if (row === null) return false;
        if (row === undefined) return false;

        const v = row[datakey];
        return (
          v !== null &&
          v !== undefined &&
          v !== "" &&
          JSON.stringify(v) !== "{}" &&
          JSON.stringify(v) !== "[]"
        );
      }
      return true;
    });
  }
}
