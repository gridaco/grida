import resources from "@/i18n";
import i18next from "i18next";
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
  await i18next.init({
    lng: lng,
    fallbackLng: "en",
    debug: false,
    resources: resources,
  });

  return (
    <main className="flex items-center justify-center min-h-screen">
      <FormCompletePageTemplate_receipt01
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
