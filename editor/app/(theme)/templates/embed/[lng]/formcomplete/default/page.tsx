import resources from "@/i18n";
import i18next from "i18next";
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
  await i18next.init({
    lng: lng,
    fallbackLng: "en",
    debug: false,
    resources: resources,
  });

  return (
    <main className="flex items-center justify-center min-h-screen">
      <FormCompletePageDefault
        // @ts-ignore
        context={{
          form_title: title,
        }}
      />
    </main>
  );
}
