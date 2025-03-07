import { createServerComponentClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Playground from "@/scaffolds/playground";

export const maxDuration = 60;

type Params = {
  slug: string;
};

export default async function SharedPlaygroundPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);

  const { data: _gist } = await supabase
    .from("gist")
    .select()
    .eq("slug", slug)
    .single();

  if (!_gist) {
    return redirect("/playground");
  }

  const { data, prompt } = _gist;

  return (
    <main>
      <Playground
        initial={{
          src: (data as any)?.["form.json"],
          prompt: prompt || undefined,
          slug: slug,
        }}
      />
    </main>
  );
}
