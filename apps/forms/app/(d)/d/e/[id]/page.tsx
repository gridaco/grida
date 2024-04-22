"use client";

import type { FormPageBackgroundSchema } from "@/types";
import type {
  FormClientFetchResponseData,
  FormClientFetchResponseError,
} from "@/app/(api)/v1/[id]/route";
import { Form } from "@/scaffolds/e/form";
import { EditorApiResponse } from "@/types/private/api";
import { notFound, redirect } from "next/navigation";
import { FormLoading } from "@/scaffolds/e/form/loading";
import { FormPageDeveloperErrorDialog } from "@/scaffolds/e/form/error";
import i18next from "i18next";
import useSWR from "swr";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import clsx from "clsx";
import { useFingerprint } from "@/scaffolds/fingerprint";
import { SYSTEM_GF_FINGERPRINT_VISITORID_KEY } from "@/k/system";

const HOST_NAME = process.env.NEXT_PUBLIC_HOST_NAME || "http://localhost:3000";

export default function FormPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { [key: string]: string };
}) {
  const form_id = params.id;

  const { result: fingerprint } = useFingerprint();

  const req_url = fingerprint?.visitorId
    ? HOST_NAME +
      `/v1/${form_id}?${new URLSearchParams({
        ...searchParams,
        [SYSTEM_GF_FINGERPRINT_VISITORID_KEY]: fingerprint.visitorId,
      })}`
    : null;

  const {
    data: res,
    error: servererror,
    isLoading,
  } = useSWR<
    EditorApiResponse<FormClientFetchResponseData, FormClientFetchResponseError>
  >(req_url, async (url: string) => {
    const res = await fetch(url);
    return res.json();
  });

  const { data, error } = res || {};

  if (isLoading || !data) {
    return (
      <main
        className={clsx(
          "h-screen md:h-auto min-h-screen",
          "relative mx-auto prose dark:prose-invert",
          "data-[cjk='true']:break-keep",
          "flex flex-col"
        )}
      >
        <div className="mt-8">
          <SkeletonCard />
        </div>
      </main>
    );
  }

  if (servererror) {
    return notFound();
  }

  const {
    //
    title,
    blocks,
    tree,
    fields,
    default_values,
    options,
    lang,
    stylesheet,
    background,
  } = data;

  if (error) {
    switch (error.code) {
      case "FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED":
      case "FORM_RESPONSE_LIMIT_REACHED":
        return redirect(`./${form_id}/alreadyresponded`);
    }
  }

  return (
    <FormLoading>
      <Form
        form_id={form_id}
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
      {error && (
        <div className="absolute top-4 right-4">
          <FormPageDeveloperErrorDialog {...error} />
        </div>
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

function SkeletonCard() {
  return (
    <div className="flex flex-col space-y-3">
      <Skeleton className="h-[125px] w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  );
}
