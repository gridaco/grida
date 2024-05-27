import { z } from "zod";

export namespace TemplateVariables {
  export interface GlobalContext {}

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

  export const schema = z.object({
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
}
