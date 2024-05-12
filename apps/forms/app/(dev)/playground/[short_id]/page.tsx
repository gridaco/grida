import { createServerComponentClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Playground from "@/scaffolds/playground";

export default async function SharedPlaygroundPage({
  params,
}: {
  params: {
    short_id: string;
  };
}) {
  const { short_id } = params;
  const cookieStore = cookies();
  const supabase = createServerComponentClient(cookieStore);

  const { data: _gist } = await supabase
    .from("gist")
    .select()
    .eq("short_id", short_id)
    .single();

  if (!_gist) {
    return redirect("/playground");
  }

  const { data, prompt } = _gist;

  return (
    <main>
      <Playground
        initial={(data && JSON.stringify(data, null, 2)) || null}
        prompt={prompt || undefined}
        slug={short_id}
      />
    </main>
  );
}
