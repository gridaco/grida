import { service_role } from "@/lib/supabase/server";
import { process_response_provisional_info } from "@/services/customer/utils";
import { unique } from "@/utils/unique";
import assert from "assert";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import validator from "validator";

type Params = { id: string };

export async function POST(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const { id: form_id } = await context.params;
  const { response_id } = await req.json();

  assert(response_id, "response_id is required");

  const { data: response, error: response_err } = await service_role.forms
    .from("response")
    .select(
      `*, response_fields:response_field(*, form_field:attribute(type, name))`
    )
    .eq("id", response_id)
    .eq("form_id", form_id)
    .single();

  if (response_err) console.error("postindexing/err", response_err);
  if (!response) {
    return notFound();
  }

  // index customer based on response
  // targets - provisional - email, phone

  if (!response.customer_id) {
    return NextResponse.json(
      {
        message: "ok",
      },
      {
        status: 204,
      }
    );
  }

  // Extract customer info based on form_field type
  const provisionals = response.response_fields.reduce(
    (info, field) => {
      const fieldType = field.form_field!.type;
      const value = (response.raw as any)[field.form_field!.name];

      if (fieldType === "email") {
        if (validator.isEmail(value)) {
          info.provisional_email.push(value);
        }
      } else if (fieldType === "tel") {
        if (validator.isMobilePhone(value, "any")) {
          info.provisional_phone.push(value);
        }
      }

      return info;
    },
    {
      provisional_email: [] as string[],
      provisional_phone: [] as string[],
    }
  );

  // update customer

  const { data: customer_prev, error: customer_prev_err } =
    await service_role.workspace
      .from("customer")
      .select("email_provisional, phone_provisional")
      .eq("uid", response.customer_id)
      .single();

  if (customer_prev_err) {
    console.error("postindexing/err", customer_prev_err);
    return NextResponse.error();
  }

  const { email_provisional, phone_provisional } =
    process_response_provisional_info([response as any]);

  const { error } = await service_role.workspace
    .from("customer")
    .update({
      email_provisional: unique(
        customer_prev.email_provisional.concat(email_provisional)
      ),
      phone_provisional: unique(
        customer_prev.phone_provisional.concat(phone_provisional)
      ),
    })
    .eq("uid", response.customer_id);

  if (error) {
    console.error("postindexing/err", error);
    return NextResponse.error();
  }

  return NextResponse.json(
    {
      message: "ok",
    },
    {
      status: 200,
    }
  );
}
