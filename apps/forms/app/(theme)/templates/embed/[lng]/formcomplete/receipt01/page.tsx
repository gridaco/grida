import resources from "@/i18n";
import i18next from "i18next";
import FormCompletePageTemplate_receipt01 from "@/theme/templates/formcomplete/receipt01";

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
    <FormCompletePageTemplate_receipt01
      title={title}
      form_title={title}
      language={params.lng}
      response={{
        idx: "#123",
        index: 123,
        short_id: "R12",
      }}
      session={{}}
      fields={{}}
      customer={{
        short_id: "C34",
      }}
    />
  );
}
