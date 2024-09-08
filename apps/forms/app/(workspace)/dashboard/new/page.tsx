import { createServerComponentClient } from "@/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const prices = {
  free: {
    monthly: false,
    yearly: false,
  },
  pro: {
    monthly: "price_1P10PJAvR3geCh5rTIJJ4S0G",
    yearly: "price_1P10OgAvR3geCh5rMkl3O0GJ",
  },
  team: {
    monthly: "price_1P10QUAvR3geCh5rLrRd7wuM",
    yearly: "price_1P10QKAvR3geCh5r4kTphqOy",
  },
} as const;

export default async function OnboardWithNewFormPage({
  searchParams,
}: {
  searchParams: {
    plan?: keyof typeof prices;
    period?: "monthly" | "yearly";
  };
}) {
  const cookieStore = cookies();
  const { plan, period } = searchParams || {};
  const price = prices[plan || "free"][period || "monthly"];

  const supabase = createServerComponentClient(cookieStore);

  const { data } = await supabase.auth.getSession();
  // if no auth, sign in, redirect back here
  if (data.session === null || data.session.user === null) {
    const search = new URLSearchParams(searchParams).toString();
    const uri = encodeURIComponent("/dashboard/new?" + search);
    redirect("/sign-in?redirect_uri=" + uri);
  }

  if (price) {
    // if has price, create checkout session
    //
  }

  return <main></main>;
}
