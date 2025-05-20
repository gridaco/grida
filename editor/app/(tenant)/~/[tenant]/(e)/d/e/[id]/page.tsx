import { Agent } from "@/grida-forms-hosted/e";
import { headers } from "next/headers";
import { geolocation } from "@vercel/functions";
import { ssr_page_init_i18n } from "@/i18n/ssr";
import i18next from "i18next";

type Params = { id: string };
type SearchParams = { [key: string]: string };

export default async function FormPage(props: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const headersList = await headers();
  const geo = geolocation({ headers: headersList });
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { id: form_id } = await params;
  await ssr_page_init_i18n({ form_id });

  return (
    <Agent
      form_id={form_id}
      params={searchParams}
      geo={geo}
      translation={{
        next: i18next.t("next"),
        back: i18next.t("back"),
        submit: i18next.t("submit"),
        pay: i18next.t("pay"),
      }}
    />
  );
}
