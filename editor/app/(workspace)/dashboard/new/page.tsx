import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const prices = {
  free: {
    monthly: false,
    yearly: false,
  },
  // TODO: get from db
  pro: {
    monthly: "price_1P10PJAvR3geCh5rTIJJ4S0G",
    yearly: "price_1P10OgAvR3geCh5rMkl3O0GJ",
  },
  team: {
    monthly: "price_1P10QUAvR3geCh5rLrRd7wuM",
    yearly: "price_1P10QKAvR3geCh5r4kTphqOy",
  },
} as const;

type SearchParams = {
  plan?: keyof typeof prices;
  period?: "monthly" | "yearly";
};

export default async function OnboardWithNewFormPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { plan, period } = await searchParams;
  const price = prices[plan || "free"][period || "monthly"];

  const client = await createClient();

  const { data: auth } = await client.auth.getUser();
  // if no auth, sign in, redirect back here
  if (!auth.user) {
    const search = new URLSearchParams(await searchParams).toString();
    const uri = encodeURIComponent("/dashboard/new?" + search);
    redirect("/sign-in?redirect_uri=" + uri);
  }

  // FIXME:
  redirect("/dashboard");

  if (price) {
    // if has price, create checkout session
    //
  }

  return <main></main>;
}
