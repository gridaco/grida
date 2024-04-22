import type {
  FormClientFetchResponseData,
  FormClientFetchResponseError,
} from "@/app/(api)/v1/[id]/route";
import type { FormFieldDefinition, FormPageBackgroundSchema } from "@/types";
import { Form } from "@/scaffolds/e/form";
import { EditorApiResponse } from "@/types/private/api";
import { notFound } from "next/navigation";
import { FormLoading } from "@/scaffolds/e/form/loading";
import i18next from "i18next";

export const revalidate = 0;

const HOST_NAME = process.env.NEXT_PUBLIC_HOST_NAME || "http://localhost:3000";

export default async function FormPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { [key: string]: string };
}) {
  const id = params.id;

  const req_url =
    HOST_NAME +
    `/v1/${id}?${new URLSearchParams({
      ...searchParams,
    })}`;
  console.log(req_url, searchParams);
  const res = await (await fetch(req_url)).json();
  const { data, error } = res as EditorApiResponse<
    FormClientFetchResponseData,
    FormClientFetchResponseError
  >;

  if (!data) {
    return notFound();
  }

  const {
    //
    title,
    blocks,
    tree,
    fields,
    required_hidden_fields,
    default_values,
    options,
    lang,
    stylesheet,
    background,
  } = data;

  if (error) {
    return <FormPageDeveloperError {...error} />;
  }

  return (
    <FormLoading>
      <Form
        form_id={id}
        title={title}
        fields={fields}
        defaultValues={default_values}
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
    </FormLoading>
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

function FormPageDeveloperError({
  code,
  message,
  missing_required_hidden_fields,
}: {
  code: string;
  message?: string;
  missing_required_hidden_fields?: FormFieldDefinition[];
}) {
  return (
    <main className="font-mono p-8 prose">
      <header>
        <h1 className="text-2xl font-bold">
          Developer Error: <code>{code}</code>{" "}
        </h1>
      </header>
      <p>{message}</p>
      {missing_required_hidden_fields && (
        <>
          <p>Missing required hidden fields:</p>
          <ul>
            {missing_required_hidden_fields.map((m) => (
              <li key={m.name}>{m.name}</li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
