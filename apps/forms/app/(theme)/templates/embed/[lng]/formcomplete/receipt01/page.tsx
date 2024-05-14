import resources from "@/k/i18n";
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
      form_title={title}
      response_short_id={mock.response_short_id}
    />
  );
}
