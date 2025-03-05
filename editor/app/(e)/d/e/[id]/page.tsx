import { Agent } from "@/scaffolds/e/form";
import i18next from "i18next";
import { ssr_page_init_i18n } from "@/i18n/ssr";

export const revalidate = 0;

type Params = { id: string };

export default async function FormPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: { [key: string]: string };
}) {
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
