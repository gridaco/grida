import { z } from "zod";

export namespace TemplateVariables {
  export type Context =
    | GlobalContext
    | FormContext
    | FormAgentContext
    | FormSessionContext
    | FormResponseContext
    | FormConnectedDatasourcePostgresTransactionCompleteContext
    | XSupabase.PostgresQuerySelectContext;

  type ContextMap = {
    global: GlobalContext;
    current_file: CurrentFileContext;
    form: FormContext;
    form_agent: FormAgentContext;
    form_session: FormSessionContext;
    form_response: FormResponseContext;
    connected_datasource_postgres_transaction_complete: FormConnectedDatasourcePostgresTransactionCompleteContext;
    "x-supabase.postgrest_query_select": XSupabase.PostgresQuerySelectContext;
    "x-supabase.postgrest_query_insert_select": XSupabase.PostgresQueryInsertSelectContext;
  };

  export type ContextName = keyof ContextMap;

  export interface GlobalContext {
    /**
     * getter - system generated uuidv4 - unique on each render
     */
    uuid?: string;
  }

  export interface CurrentFileContext {
    file: {
      name: File["name"];
      size: File["size"];
      type: File["type"];
      lastModified: File["lastModified"];
      index?: number;
    };
  }

  /**
   * form context - contains basic information about the form
   *
   * @readonly
   */
  export interface FormContext extends GlobalContext {
    form_title: string;
  }

  /**
   * form agent context - contains information about the form
   */
  export interface FormAgentContext extends FormContext {
    /**
     * @readonly
     */
    title: string;
    /**
     * @readonly
     */
    language: string;
  }

  export interface FormSessionContext extends FormAgentContext {
    fields: { [key: string]: string };
    /**
     * @readonly
     */
    session: {};
  }

  export interface FormResponseContext extends FormSessionContext {
    /**
     * Updated customer data
     *
     * @readonly
     */
    customer: {
      /**
       * short_id of the customer
       */
      short_id: string;
      /**
       * first name of the customer
       */
      first_name?: string;
      last_name?: string;
      display_name?: string;
      phone?: string;
      email?: string;
    };

    /**
     * @readonly
     */
    response: {
      short_id: string | null;
      /**
       * a.k.a local_index
       */
      index: number;
      /**
       * hash representation of the response index
       * @example #123
       */
      idx: string;
    };
  }

  export namespace XSupabase {
    export interface PostgresQuerySelectContext<
      R extends Record<string, any> = Record<string, any>,
    > extends GlobalContext {
      TABLE: {
        pks: string[];
      };
      RECORD: R;
    }

    export interface PostgresQueryInsertSelectContext<
      R extends Record<string, any> = Record<string, any>,
    > extends PostgresQuerySelectContext<R> {
      NEW: R;
    }
  }

  export interface FormConnectedDatasourcePostgresTransactionCompleteContext<
    R extends Record<string, any> = Record<string, any>,
  > extends FormResponseContext,
      XSupabase.PostgresQueryInsertSelectContext<R> {
    NEW: R;
  }

  export interface ContextVariableInfo {
    type: string;
    context: keyof ContextMap;
    available: "always" | "conditional";
    evaluation: "runtime" | "compiletime";
  }

  type AllKeys = keyof (GlobalContext &
    FormContext &
    FormAgentContext &
    FormSessionContext &
    FormResponseContext &
    FormConnectedDatasourcePostgresTransactionCompleteContext);

  export const variables: Record<AllKeys, ContextVariableInfo> = {
    uuid: {
      type: "string",
      context: "global",
      available: "always",
      evaluation: "runtime",
    },
    form_title: {
      type: "string",
      context: "form",
      available: "always",
      evaluation: "compiletime",
    },
    title: {
      type: "string",
      context: "form_agent",
      available: "always",
      evaluation: "compiletime",
    },
    language: {
      type: "string",
      context: "form_agent",
      available: "always",
      evaluation: "compiletime",
    },
    fields: {
      type: "object",
      context: "form_session",
      available: "always",
      evaluation: "compiletime",
    },
    session: {
      type: "object",
      context: "form_session",
      available: "always",
      evaluation: "compiletime",
    },
    customer: {
      type: "object",
      context: "form_response",
      available: "always",
      evaluation: "compiletime",
    },
    response: {
      type: "object",
      context: "form_response",
      available: "always",
      evaluation: "compiletime",
    },
    TABLE: {
      type: "object",
      context: "x-supabase.postgrest_query_select",
      available: "always",
      evaluation: "compiletime",
    },
    NEW: {
      type: "object",
      context: "connected_datasource_postgres_transaction_complete",
      available: "always",
      evaluation: "compiletime",
    },
    RECORD: {
      type: "object",
      context: "x-supabase.postgrest_query_select",
      available: "always",
      evaluation: "compiletime",
    },
  } as const;

  export type ContextSchema =
    | typeof GlobalContextSchema
    | typeof FormResonseContextSchema;

  const GlobalContextSchema = z.object({
    uuid: z
      .string()
      .describe("system generated uuidv4 - unique on each render"),
  });

  const FormResonseContextSchema = z.object({
    form_title: z.string().describe("Form title"),
    title: z.string().describe("Page / Campaign title"),
    language: z.string().describe("Language of the form"),
    // fields: z.record(z.string()).describe("Form fields (dynamic)"),
    // session: z.object({}),
    // customer: z.object({
    //   short_id: z
    //     .string()
    //     .describe("short_id of the customer, a.k.a support id"),
    //   first_name: z
    //     .string()
    //     .optional()
    //     .describe("first name of the customer if linked"),
    //   last_name: z
    //     .string()
    //     .optional()
    //     .describe("last name of the customer if linked"),
    //   display_name: z
    //     .string()
    //     .optional()
    //     .describe(
    //       "display name / full name / nickname of the customer if linked"
    //     ),
    //   phone: z.string().optional().describe("phone number of the customer"),
    //   email: z.string().optional().describe("email of the customer"),
    // }),
    response: z.object({
      short_id: z
        .string()
        .nullable()
        .describe("short_id of the response, a.k.a support id"),
      index: z
        .number()
        .describe("a.k.a local index of the response 1, 2, 3..."),
      idx: z
        .string()
        .describe("#123 hash representation of the response index"),
    }),
  });

  const XSupabasePostgresQuerySelectContextSchema = GlobalContextSchema.merge(
    z.object({
      TABLE: z.object({
        pks: z.array(z.string()).describe("Primary keys of the table"),
      }),
      RECORD: z.record(z.unknown()).describe("Record from the select query"),
    })
  );

  const XSupabasePostgresQueryInsertSelectContextSchema =
    GlobalContextSchema.merge(
      XSupabasePostgresQuerySelectContextSchema.merge(
        z.object({
          NEW: z
            .record(z.unknown())
            .describe("New record from the select query"),
        })
      )
    );

  export const schemas: Record<ContextName, ZodSchema> = {
    global: GlobalContextSchema,
    form_response: FormResonseContextSchema,
    "x-supabase.postgrest_query_select":
      XSupabasePostgresQuerySelectContextSchema,
    "x-supabase.postgrest_query_insert_select":
      XSupabasePostgresQueryInsertSelectContextSchema,
    // TODO:
    current_file: z.object({
      file: z.object({
        name: z.string().describe("File name"),
        size: z.number().describe("File size"),
        type: z.string().describe("File type"),
        lastModified: z.number().describe("File last modified"),
        index: z.number().optional().describe("File index (if multiple files)"),
      }),
    }),
    form: z.object({}),
    form_agent: z.object({}),
    form_session: z.object({}),
    connected_datasource_postgres_transaction_complete: z.object({}),
  };

  type ZodSchema = z.ZodObject<any>;

  export function createContext<K extends keyof ContextMap = keyof ContextMap>(
    context: K,
    data: Omit<ContextMap[K], "uuid">
  ) {
    return data;
  }

  export namespace Validation {
    export type ContextPropertyAvailability<T> = {
      [K in keyof T]: boolean;
    };

    export function availability<T extends ContextSchema>(
      context: T,
      policyfn: (property: ContextVariableInfo) => boolean
    ): ContextPropertyAvailability<T> {
      return Object.keys(context).reduce((acc, key) => {
        acc[key as keyof T] = policyfn(variables[key as keyof Context]);
        return acc;
      }, {} as ContextPropertyAvailability<T>);
    }
  }
}
