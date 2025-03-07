import { createServerComponentClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);

  const { data } = await supabase.auth.getUser();

  const isLoggedIn = !!data?.user;

  if (isLoggedIn) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
