import { GridaLogo } from "@/components/grida-logo";
import { createServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

export default async function FormPage({ params }: { params: { id: string } }) {
  const id = params.id;

  const cookieStore = cookies();

  const supabase = createServerClient(cookieStore);

  const { data, error } = await supabase
    .from("form")
    .select(
      `
        *,
        fields:form_field(*)
      `
    )
    .eq("id", id)
    .single();

  if (!data) {
    return notFound();
  }

  const { title, fields } = data;

  console.log(fields);
  return (
    <main className="p-4 container mx-auto min-h-screen">
      <header>
        <h1 className="text-4xl font-bold">{title}</h1>
      </header>
      <form className="grid grid-cols-1 gap-4 my-4 h-full">
        {fields.map((field: any) => {
          return (
            <label key={field.id} className="flex flex-col">
              {field.label || field.name}
              <input
                min={field.min}
                max={field.max}
                pattern={field.pattern}
                required={field.required}
                minLength={field.minlength}
                maxLength={field.maxlength}
                placeholder={field.placeholder || field.label || field.name}
                type={field.type}
              />
            </label>
          );
        })}
        <button className="bg-blue-500 text-white rounded p-2" type="submit">
          Submit
        </button>
      </form>
      <footer className="w-max mx-auto">
        <PoweredByWaterMark />
      </footer>
    </main>
  );
}

function PoweredByWaterMark() {
  return (
    <div className="flex items-center opacity-50">
      <span className="text-xs">Powered by</span>
      <span className="ml-2">
        <GridaLogo size={15} />
      </span>
    </div>
  );
}
