export namespace EditorSymbols {
  export namespace Table {
    export const SYM_GRIDA_FORMS_WHATEVER_MAIN_TABLE_INDICATOR = Symbol(
      "grida_forms.response.x-supabase-main-table"
    );
    export const SYM_GRIDA_FORMS_RESPONSE_TABLE_ID = Symbol(
      "grida_forms.response"
    );
    export const SYM_GRIDA_FORMS_SESSION_TABLE_ID = Symbol(
      "grida_forms.session"
    );
    export const SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID = Symbol(
      "grida_forms.response.x-supabase-main-table"
    );
    export const SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID = Symbol(
      "x-supabase-auth.users"
    );
    export const SYM_GRIDA_CUSTOMER_TABLE_ID = Symbol(
      "grida_customers.customer"
    );
  }

  export namespace SystemKey {
    // client system keys

    /**
     * Indicates the text search is to be done locally.
     */
    export const QUERY_TS_SEARCH_LOCALLY = Symbol(
      "__grida_client_sys_key__ts_search_locally"
    );
  }
}
