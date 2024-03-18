import { createServerComponentClient } from "@/lib/supabase/server";
import { DownloadIcon } from "@radix-ui/react-icons";
import { cookies } from "next/headers";

import { GridEditor } from "@/scaffolds/grid-editor";
import Link from "next/link";

export default async function FormResponsesPage({
  params,
}: {
  params: {
    id: string;
  };
}) {
  const { id: form_id } = params;

  const cookieStore = cookies();
  const supabase = createServerComponentClient(cookieStore);

  const { data: form, error } = await supabase
    .from("form")
    .select(
      `
        *,
        fields:form_field(*),
        responses: response(*, fields:response_field(*))
      `
    )
    .eq("id", form_id)
    .single();

  if (error) {
    console.error(error);
  }

  return (
    <div className="h-full flex flex-col flex-1 w-full overflow-x-hidden">
      <div className="flex flex-col h-full w-full">
        <GridEditor />
      </div>
      <footer className="flex min-h-9 overflow-hidden items-center px-2 w-full border-t">
        <div>{form?.responses?.length ?? 0} response(s)</div>
        <Link href={`/v1/${form_id}/export/csv`} download target="_blank">
          <button className="flex items-center gap-1 p-2 bg-neutral-100 rounded">
            Export to CSV
            <DownloadIcon />
          </button>
        </Link>
      </footer>
    </div>
  );
}
