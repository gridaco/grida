import {
  createRouteHandlerFormsClient,
  createRouteHandlerWorkspaceClient,
} from "@/supabase/server";
import { Customer, Form, FormResponse } from "@/types";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export interface FormCustomerDetail extends Customer {
  responses: (FormResponse & { form: Form })[];
}

export async function GET(
  req: NextRequest,
  context: {
    params: {
      uid: string;
    };
  }
) {
  const { uid } = context.params;
  const cookieStore = cookies();
  const client = createRouteHandlerFormsClient(cookieStore);
  const wsclient = createRouteHandlerWorkspaceClient(cookieStore);

  const { data: customer } = await wsclient
    .from("customer")
    .select("*")
    .eq("uid", uid)
    .single();

  if (!customer) {
    return notFound();
  }

  const { data: responses } = await client
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
