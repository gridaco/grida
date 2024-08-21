export const SYM_LOCALTZ = Symbol("localtz");

export function tztostr(
  tz?: typeof SYM_LOCALTZ | string,
  replacelocaltzwith?: string
): string | undefined {
  return tz === SYM_LOCALTZ ? replacelocaltzwith || undefined : tz;
}

export namespace GridaEditorSymbols {
  export namespace Table {
    export const SYM_GRIDA_FORMS_RESPONSE_TABLE_ID: unique symbol = Symbol(
      "grida_forms.response"
    );
    export const SYM_GRIDA_FORMS_SESSION_TABLE_ID: unique symbol = Symbol(
      "grida_forms.session"
    );
    export const SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID: unique symbol =
      Symbol("grida_forms.response.x-supabase-main-table");
    export const SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID: unique symbol =
      Symbol("x-supabase-auth.users");
    export const SYM_GRIDA_CUSTOMER_TABLE_ID: unique symbol = Symbol(
      "grida_customers.customer"
    );
  }
}
