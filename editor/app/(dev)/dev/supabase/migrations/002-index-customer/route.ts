import { service_role } from "@/lib/supabase/server";
import { process_response_provisional_info } from "@/services/customer/utils";
import { NextResponse } from "next/server";

export async function POST() {
  // list all customer, except dev account
  const { data: customers, error } = await service_role.workspace
    .from("customer")
    .select()
    .neq("project_id", 2);

  if (error) console.error(error);

  let i = 0;
  for (const customer of customers!) {
    try {
      const { data: responses } = await service_role.forms
        .from("response")
        .select(
          `*, response_fields:response_field(*, form_field:attribute(type, name))`
        )
        // where email_provisional length is 0
        .eq("customer_id", customer.uid);

      const { email_provisional, phone_provisional } =
        process_response_provisional_info(responses as any);

      // update customer
      await service_role.workspace
        .from("customer")
        .update({
          email_provisional: unique(
            customer.email_provisional.concat(email_provisional)
          ),
          phone_provisional: unique(
            customer.phone_provisional.concat(phone_provisional)
          ),
        })
        .eq("uid", customer.uid);
      //
    } catch (e) {
      console.error("error ", customer.uid, e);
    }

    console.log("processed", customer.uid, `${i + 1} of ${customers?.length}`);
    i++;
  }

  return NextResponse.json({
    message: "ok",
  });
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
