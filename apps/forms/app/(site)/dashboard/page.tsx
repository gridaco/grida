import { DashboardFormCard } from "@/components/dashboard-form-card";
import { createServerClient } from "@/lib/supabase";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function FormsDashboardPage() {
  const cookieStore = cookies();
  const supabase = createServerClient(cookieStore);

  const { data: auth } = await supabase.auth.getSession();

  if (!auth.session) {
    return redirect("/login");
  }

  const { data: forms, error } = await supabase.from("form").select();

  return (
    <main>
      <h1>Dashboard</h1>
      <section>
        <Link href="/new">
          <button className="bg-blue">Create Form</button>
        </Link>
      </section>
      {forms?.map((form, i) => (
        <DashboardFormCard key={i} />
      ))}
    </main>
  );
}
