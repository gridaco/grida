import { createServerClient } from "@/lib/supabase/server";
import { Grid } from "@/scaffolds/grid";
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

  const columns = [
    {
      key: "id",
      name: "id",
      frozen: true,
    },
  ].concat(
    form?.fields?.map((field) => ({
      key: field.id,
      name: field.label ?? field.name,
      frozen: false,
      // You can add more properties here as needed by react-data-grid
    })) ?? []
  );

  // Transforming the responses into the format expected by react-data-grid
  const rows =
    form?.responses?.map((response, index) => {
      const row: any = { id: response.id }; // react-data-grid expects each row to have a unique 'id' property
      response.fields.forEach((field) => {
        row[field.form_field_id] = field.value?.toString(); // Matching the field's ID with its value
      });
      return row;
    }) ?? [];

  return (
    <div>
      <h1>Form Responses {form?.responses?.length}</h1>
      <button>
        <DownloadIcon />
      </button>

      <Grid columns={columns} rows={rows} />
    </div>
  );
}
