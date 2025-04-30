import type { Platform } from "@/lib/platform";
import { createClient, createFormsClient } from "@/lib/supabase/server";
import { Form, FormResponse } from "@/types";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

type Params = {
  uid: string;
};

export interface FormCustomerDetail extends Platform.Customer.CustomerWithTags {
  responses: (FormResponse & { form: Form })[];
}

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const { uid } = await context.params;
  const client = await createClient();
  const formsClient = await createFormsClient();

  const { data: customer } = await client
    .from("customer_with_tags")
    .select("*")
    .eq("uid", uid)
    .single();

  if (!customer) {
    return notFound();
  }

  const { data: responses } = await formsClient
    .from("response")
    .select("*, form(*)")
    .eq("customer_id", customer.uid);

  // fetch form responses

  const data: FormCustomerDetail = {
    ...customer,
    responses: responses as FormCustomerDetail["responses"],
  };

  return NextResponse.json(data);
}
