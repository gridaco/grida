import type { FormClientFetchResponse } from "@/app/(api)/v1/[id]/route";
import type { FormPageBackgroundSchema } from "@/types";
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

  const {
    //
    title,
    blocks,
    tree,
    fields,
    options,
    lang,
    stylesheet,
    background,
  } = data;

  return (
    <>
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
        stylesheet={stylesheet}
      />
      {background && (
        <FormPageBackground {...(background as FormPageBackgroundSchema)} />
      )}
    </>
  );
}

function FormPageBackground({ element, src }: FormPageBackgroundSchema) {
  const renderBackground = () => {
    switch (element) {
      case "iframe":
        return <FormPageBackgroundIframe src={src!} />;
      default:
        return <></>;
    }
  };

  return (
    <div className="fixed select-none inset-0 -z-10">{renderBackground()}</div>
  );
}

function FormPageBackgroundIframe({ src }: { src: string }) {
  return (
    <iframe
      className="absolute inset-0 w-screen h-screen -z-10 bg-transparent"
      src={src}
      width="100vw"
      height="100vh"
    />
  );
}
