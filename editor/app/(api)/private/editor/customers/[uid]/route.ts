import type { Platform } from "@/lib/platform";
import {
  createRouteHandlerClient,
  createRouteHandlerWorkspaceClient,
} from "@/lib/supabase/server";
import { Form, FormResponse } from "@/types";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

type Params = {
  uid: string;
};

export interface FormCustomerDetail extends Platform.Customer.Customer {
  responses: (FormResponse & { form: Form })[];
}

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const { uid } = await context.params;
  const cookieStore = await cookies();
  const client = createRouteHandlerClient(cookieStore);
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
