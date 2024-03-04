import { DashboardFormCard } from "@/components/dashboard-form-card";
import Link from "next/link";

export default async function FormsDashboardPage() {
  return (
    <main>
      <h1>Dashboard</h1>
      <section>
        <Link href="/new">
          <button>Create Form</button>
        </Link>
      </section>
      {[1, 1, 1].map((form, i) => (
        <DashboardFormCard key={i} />
      ))}
    </main>
  );
}
