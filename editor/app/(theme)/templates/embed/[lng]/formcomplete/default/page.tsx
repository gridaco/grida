import { createFormsTranslator } from "@workspace/translations/forms";
import FormCompletePageDefault from "@/theme/templates/formcomplete/default";

type Params = { lng: string };
type SearchParams = { title?: string };

const mock = {
  title: "ACME Form Title",
  response_short_id: "#123",
} as const;

export default async function Component({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { lng } = await params;
  const { title = mock.title } = await searchParams;
  const t = await createFormsTranslator(lng);

  return (
    <main className="flex items-center justify-center min-h-screen">
      <FormCompletePageDefault
        t={t}
        // @ts-expect-error - context prop type mismatch with FormCompletePageDefault
        context={{
          form_title: title,
        }}
      />
    </main>
  );
}
