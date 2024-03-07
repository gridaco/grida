import { createServerClient } from "@/lib/supabase";
import { DownloadIcon } from "@radix-ui/react-icons";
import { cookies } from "next/headers";

export default async function FormResponsesPage({
  params,
}: {
  params: {
    id: string;
  };
}) {
  const { id: form_id } = params;

  const cookieStore = cookies();
  const supabase = createServerClient(cookieStore);

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
    <div>
      <h1>Form Responses {form?.responses?.length}</h1>
      <button>
        <DownloadIcon />
      </button>

      <table className="table-auto">
        <thead>
          <tr>
            {form?.fields?.map((field) => (
              <th key={field.id}>{field.label ?? field.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {form?.responses?.map((response) => (
            <tr key={response.id}>
              {response?.fields?.map((field) => (
                <td key={field.id}>{field.value?.toString()}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
