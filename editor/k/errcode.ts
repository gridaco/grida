///
/// custom db error codes
/// XX - (sqlsate prefix)
///

export namespace PGXXError {
  // ==================================================
  // region 2 - grida_forms
  // ==================================================

  /**
   * The form is force closed.
   *
   *
   * - 2(grida_forms)
   * - 1(access/general)
   * - 1(error code - force closed)
   */
  export const XX211 = "XX211";

  /**
   * The number of responses has reached the allowed maximum.
   *
   * @param is_max_form_responses_in_total_enabled - form.is_max_form_responses_in_total_enabled
   * @param max_form_responses_in_total - form.max_form_responses_in_total
   *
   *
   * - 2(grida_forms)
   * - 2(access/counter)
   * - 1(error code - max responses per form)
   */
  export const XX221 = "XX221";

  /**
   * The number of responses for customer has reached the allowed maximum.
   *
   * - 2(grida_forms)
   * - 2(access/counter)
   * - 2(error code - max responses for customer per form)
   */
  export const XX222 = "XX222";

  /**
   * The form is closed by scheduler.
   *
   * - 2(grida_forms)
   * - 3(access/scheduler)
   * - 0(error code - date out of range)
   */
  export const XX230 = "XX230";

  /**
   * The form is closed by scheduler.
   *
   * - 2(grida_forms)
   * - 3(access/scheduler)
   * - 1(error code - form closed by scheduler)
   */
  export const XX231 = "XX231";

  /**
   * The form is closed by scheduler.
   *
   * - 2(grida_forms)
   * - 3(access/scheduler)
   * - 2(error code - form is not open yet by scheduler)
   */
  export const XX232 = "XX232";

  // ==================================================
  // region 3 - grida_commerce
  // ==================================================
  /**
   * The Inventory Level is at 0 and configured to not allow negative inventory.
   * An error is thrown when trying to reduce the inventory level, and the level is already at 0.
   *
   * - 3(grida_commerce)
   * - 2(inventory)
   * - 0(error code - 0 inventory)
   */
  export const XX320 = "XX320";
}
