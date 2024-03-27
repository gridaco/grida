import { FormClientFetchResponse } from "@/app/(api)/v1/[id]/route";
import { Form } from "@/scaffolds/e/form";
import { EditorApiResponse } from "@/types/private/api";
import { notFound } from "next/navigation";
import i18next from "i18next";

export const revalidate = 0;

const HOST_NAME = process.env.NEXT_PUBLIC_HOST_NAME || "http://localhost:3000";

export default async function FormPage({ params }: { params: { id: string } }) {
  const id = params.id;

  const res = await (await fetch(HOST_NAME + `/v1/${id}`)).json();
  const { data } = res as EditorApiResponse<FormClientFetchResponse>;

  if (!data) {
    return notFound();
  }

  const { title, blocks, tree, fields, options, lang } = data;

  return (
    <Form
      form_id={id}
      title={title}
      fields={fields}
      blocks={blocks}
      tree={tree}
      translations={{
        next: i18next.t("next"),
        back: i18next.t("back"),
        submit: i18next.t("submit"),
        pay: i18next.t("pay"),
      }}
      lang={lang}
      options={options}
    />
  );
}
