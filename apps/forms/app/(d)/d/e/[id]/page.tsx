import { FormClientFetchResponse } from "@/app/(api)/v1/[id]/route";
import { GridaLogo } from "@/components/grida-logo";
import { EditorApiResponse } from "@/types/private/api";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 0;

const HOST_NAME = process.env.NEXT_PUBLIC_HOST_NAME || "http://localhost:3000";

export default async function FormPage({ params }: { params: { id: string } }) {
  const id = params.id;

  const res = await (await fetch(HOST_NAME + `/v1/${id}`)).json();
  const { data } = res as EditorApiResponse<FormClientFetchResponse>;

  if (!data) {
    return notFound();
  }

  const { title, blocks } = data;

  return (
    <main className="p-4 container mx-auto min-h-screen">
      <header>
        <h1 className="py-10 text-4xl font-bold">{title}</h1>
      </header>
      <form
        action={"/submit/" + id}
        className="flex flex-col gap-4 py-4 h-full overflow-auto flex-1"
      >
        {blocks.map(({ field }) => {
          return (
            <label
              data-has-label={!!field.label}
              key={field.id}
              className="flex flex-col data-[has-label='false']:capitalize"
            >
              {field.label || field.name}
              {field.help_text && (
                <span className="text-sm text-gray-500">{field.help_text}</span>
              )}
              <input
                name={field.name}
                className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
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
      <Footer />
    </main>
  );
}

function Footer() {
  return (
    <footer className="py-10 w-max mx-auto">
      <Link href={"/"} target="_blank">
        <PoweredByWaterMark />
      </Link>
    </footer>
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
