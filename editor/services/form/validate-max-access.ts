import { PGXXError } from "@/k/errcode";
import {
  FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED,
  FORM_RESPONSE_LIMIT_REACHED,
  SERVICE_ERROR,
} from "@/k/error";
// TODO: need RLS?
import { grida_forms_client } from "@/lib/supabase/server";

export async function validate_max_access_by_form({
  form_id,
}: {
  form_id: string;
}) {
  const { error: max_response_error } = await grida_forms_client.rpc(
    "rpc_check_max_responses",
    { form_id }
  );

  if (max_response_error) {
    switch (max_response_error.code) {
      case PGXXError.XX221: {
        return FORM_RESPONSE_LIMIT_REACHED;
      }
      default: {
        return SERVICE_ERROR;
      }
    }
  }

  return null;
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
    const { count, data, error } = await grida_forms_client
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
