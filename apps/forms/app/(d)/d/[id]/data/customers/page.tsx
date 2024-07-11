import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createRouteHandlerClient,
  createRouteHandlerWorkspaceClient,
} from "@/lib/supabase/server";
import { CustomerGrid } from "@/scaffolds/grid/customer-grid";
import { Siebar } from "@/scaffolds/sidebar/sidebar";
import { provisional } from "@/services/customer/utils";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

export default async function Customers({
  params,
}: {
  params: {
    id: string;
  };
}) {
  const form_id = params.id;
  const cookieStore = cookies();
  const formsclient = createRouteHandlerClient(cookieStore);
  const wsclient = createRouteHandlerWorkspaceClient(cookieStore);

  const { data: form_ref, error: form_ref_error } = await formsclient
    .from("form")
    .select("id, project_id")
    .eq("id", form_id)
    .single();

  if (form_ref_error || !form_ref) {
    return notFound();
  }

  const { data: customers, error: customers_error } = await wsclient
    .from("customer")
    .select()
    .order("last_seen_at", { ascending: false })
    .eq("project_id", form_ref.project_id);

  if (customers_error || !customers) {
    return notFound();
  }

  return (
    <div className="h-full flex flex-1 w-full">
      {/* side */}
      <aside className="hidden lg:flex h-full">
        <Siebar mode="data" />
      </aside>
      <div className="w-full h-full overflow-x-hidden">
        <main className="flex flex-col h-full">
          {/* <Tabs>
            <TabsList>
              <TabsTrigger value="1">All</TabsTrigger>
              <TabsTrigger value="2">Repeat Customers</TabsTrigger>
              <TabsTrigger value="2">First-time Customers</TabsTrigger>
            </TabsList>
          </Tabs> */}
          <h1 className="text-2xl font-bold p-4">
            All Customers
            <small className="ms-2 text-muted-foreground">
              ({customers.length})
            </small>
          </h1>
          <div className="flex flex-col w-full h-full">
            <CustomerGrid
              rows={customers.map((customer) => ({
                uid: customer.uid,
                email: provisional(
                  customer.email,
                  customer.email_provisional
                ).join(", "),
                phone: provisional(
                  customer.phone,
                  customer.phone_provisional
                ).join(", "),
                created_at: customer.created_at,
                last_seen_at: customer.last_seen_at,
              }))}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
