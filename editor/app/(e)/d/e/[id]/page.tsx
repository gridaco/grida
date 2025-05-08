import { Agent } from "@/scaffolds/e/form";
import i18next from "i18next";
import { ssr_page_init_i18n } from "@/i18n/ssr";

type Params = { id: string };
type SearchParams = { [key: string]: string };

export default async function FormPage(props: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { id: form_id } = await params;
  await ssr_page_init_i18n({ form_id });

  return (
    <Agent
      form_id={form_id}
      params={searchParams}
      translation={{
        next: i18next.t("next"),
        back: i18next.t("back"),
        submit: i18next.t("submit"),
        pay: i18next.t("pay"),
      }}
    />
  );
}
