import resources from "@/i18n";
import i18next from "i18next";
import FormCompletePageDefault from "@/theme/templates/formcomplete/default";

const mock = {
  title: "ACME Form Title",
  response_short_id: "#123",
} as const;

export default async function Component({
  params,
  searchParams,
}: {
  params: {
    lng: string;
  };
  searchParams: {
    title?: string;
  };
}) {
  await i18next.init({
    lng: params.lng,
    fallbackLng: "en",
    debug: false,
    resources: resources,
  });

  const title = searchParams.title || mock.title;
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
