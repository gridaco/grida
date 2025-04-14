import { createRouteHandlerWWWClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

type Params = {
  path_tokens: string[];
};
export default async function APage({ params }: { params: Promise<Params> }) {
  const { path_tokens } = await params;
  const name = "/" + path_tokens.join("/");

  const cookieStore = cookies();
  const client = createRouteHandlerWWWClient(cookieStore);

  const { data, error } = await client
    .from("public_route")
    .select()
    .eq("route_path", name)
    .single();

  if (error || !data) return notFound();

  return (
    <main>
      <code>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </code>
    </main>
  );
}
