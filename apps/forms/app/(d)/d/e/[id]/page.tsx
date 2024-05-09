import { Form } from "@/scaffolds/e/form";
import i18next from "i18next";
import { ssr_page_init_i18n } from "../i18n";

export const revalidate = 0;

export default async function FormPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { [key: string]: string };
}) {
  const form_id = params.id;
  await ssr_page_init_i18n({ form_id });

  return (
    <main className="min-h-screen flex flex-col items-center">
      <Form
        form_id={form_id}
        params={searchParams}
        translation={{
          next: i18next.t("next"),
          back: i18next.t("back"),
          submit: i18next.t("submit"),
          pay: i18next.t("pay"),
        }}
      />
    </main>
  );
}
