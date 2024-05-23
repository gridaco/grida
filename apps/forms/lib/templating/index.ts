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
}

// @ts-ignore
let a: TemplateVariables.FormResponseContext = {};
