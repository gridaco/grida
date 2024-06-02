import {
  FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED,
  FORM_RESPONSE_LIMIT_REACHED,
} from "@/k/error";
import { client } from "@/lib/supabase/server";

export async function validate_max_access({
  form_id,
  customer_id,
  is_max_form_responses_in_total_enabled,
  max_form_responses_in_total,
  is_max_form_responses_by_customer_enabled,
  max_form_responses_by_customer,
  count_diff = 0,
}: {
  form_id: string;
  customer_id?: string | null;
  is_max_form_responses_in_total_enabled: boolean;
  max_form_responses_in_total: number | null;
  is_max_form_responses_by_customer_enabled: boolean;
  max_form_responses_by_customer: number | null;
  count_diff?: number;
}) {
  // response number
  if (is_max_form_responses_in_total_enabled) {
    return validate_max_access_by_form({
      form_id,
      is_max_form_responses_in_total_enabled,
      max_form_responses_in_total,
      count_diff,
    });
  }
  // response number by customer
  if (is_max_form_responses_by_customer_enabled) {
    return validate_max_access_by_customer({
      form_id,
      customer_id,
      is_max_form_responses_by_customer_enabled,
      max_form_responses_by_customer,
      count_diff,
    });
  }

  return null;
}

export async function validate_max_access_by_form({
  form_id,
  is_max_form_responses_in_total_enabled,
  max_form_responses_in_total,
  count_diff = 0,
}: {
  form_id: string;
  is_max_form_responses_in_total_enabled: boolean;
  max_form_responses_in_total: number | null;
  count_diff?: number;
}) {
  if (!is_max_form_responses_in_total_enabled) {
    return null;
  }
  // TODO: migrate with counter rpc, since it can raise 502 on high load
  //
  const { count, error } = await client
    .from("response")
    .select("*", { count: "exact", head: true })
    .eq("form_id", form_id);

  if (error) throw error;
  if ((count ?? 0) + count_diff >= (max_form_responses_in_total ?? Infinity)) {
    // reject: cause the form has reached the limit
    return {
      ...FORM_RESPONSE_LIMIT_REACHED,
      max: max_form_responses_in_total ?? Infinity,
    };
  }
}

export async function validate_max_access_by_customer({
  form_id,
  customer_id,
  is_max_form_responses_by_customer_enabled,
  max_form_responses_by_customer,
  count_diff = 0,
}: {
  form_id: string;
  customer_id?: string | null;
  is_max_form_responses_by_customer_enabled: boolean;
  max_form_responses_by_customer: number | null;
  count_diff?: number;
}) {
  if (!is_max_form_responses_by_customer_enabled) {
    return null;
  }

  // response number by customer
  if (customer_id) {
    //
    // TODO: migrate with counter rpc, since it can raise 502 on high load
    const { count, data, error } = await client
      .from("response")
      .select("id", { count: "exact" })
      .eq("form_id", form_id)
      .eq("customer_id", customer_id);

    if (error) throw error;

    // console.log("count", count);

    if (
      (count ?? 0) + count_diff >=
      (max_form_responses_by_customer ?? Infinity)
    ) {
      // reject: cause the customer has reached the limit
      return {
        ...FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED,
        max: max_form_responses_by_customer ?? Infinity,
        last_response_id: data?.[0]?.id as string,
      };
    }
  } else {
    // there is a limit to 'by-customer' but there was no way to identify this customer
    // yet, we are allowing this since the api can be accessed by anyone for pinning
    return null;
    // TODO: revise me
  }
}
