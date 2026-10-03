import { createFormsTranslator } from "@workspace/translations/forms";
import FormCompletePageTemplate_receipt01 from "@/theme/templates/formcomplete/receipt01";

const mock = {
  title: "ACME Form Title",
  response_short_id: "#123",
} as const;

type Params = { lng: string };
type SearchParams = { title?: string };

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
      <FormCompletePageTemplate_receipt01
        t={t}
        context={{
          title: title,
          form_title: title,
          language: lng,
          response: {
            idx: "#123",
            index: 123,
            short_id: "R12",
          },
          session: {},
          fields: {},
          customer: {
            short_id: "C34",
          },
        }}
      />
    </main>
  );
}
