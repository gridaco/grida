// import {
//   commerceclient,
//   createRouteHandlerClient,
// } from "@/lib/supabase/server";
// import { GridaCommerceClient } from "@/services/commerce";
// import { cookies } from "next/headers";
// import { NextRequest } from "next/server";

// export async function GET(
//   req: NextRequest,
//   context: {
//     params: {
//       field_id: string;
//     };
//   }
// ) {
//   const cookieStore = cookies();

//   const { field_id } = context.params;

//   const { data: field } = await supabase
//     .from("form_field")
//     .select()
//     .eq("id", field_id)
//     .single();

//   return;
// }
