"use client";

import React from "react";
import useSWR from "swr";
import { notFound, redirect } from "next/navigation";
import { FormPageDeveloperErrorDialog } from "@/scaffolds/e/form/error";
import { Skeleton } from "@/components/ui/skeleton";
import { useFingerprint } from "@/scaffolds/fingerprint";
import { formlink } from "@/lib/forms/url";
import { FormView, FormViewTranslation } from "./formview";
import {
  SYSTEM_GF_CUSTOMER_UUID_KEY,
  SYSTEM_GF_FINGERPRINT_VISITORID_KEY,
} from "@/k/system";
import type { EditorApiResponse } from "@/types/private/api";
import type { FormPageBackgroundSchema } from "@/types";
import type {
  FormClientFetchResponseData,
  FormClientFetchResponseError,
} from "@/app/(api)/v1/[id]/route";
import { FormPageBackground } from "./background";

const HOST_NAME = process.env.NEXT_PUBLIC_HOST_NAME || "http://localhost:3000";

export function Form({
  form_id,
  params,
  translation,
}: {
  form_id: string;
  params: { [key: string]: string };
  translation: FormViewTranslation;
}) {
  const { result: fingerprint } = useFingerprint();

  const __fingerprint_ready = !!fingerprint?.visitorId;
  const __gf_customer_uuid = params[SYSTEM_GF_CUSTOMER_UUID_KEY];
  const can_make_initial_request = !!__gf_customer_uuid || __fingerprint_ready;

  const req_url = can_make_initial_request
    ? HOST_NAME +
      `/v1/${form_id}?${
        // rather intended or not, this will fetch data again when fingerprint is ready (when and even when it's not required)
        fingerprint?.visitorId
          ? new URLSearchParams({
              ...params,
              [SYSTEM_GF_FINGERPRINT_VISITORID_KEY]: fingerprint?.visitorId,
            })
          : new URLSearchParams(params)
      }`
    : null;

  const {
    data: res,
    error: servererror,
    isLoading,
  } = useSWR<
    EditorApiResponse<FormClientFetchResponseData, FormClientFetchResponseError>
  >(
    req_url,
    async (url: string) => {
      const res = await fetch(url);
      return res.json();
    },
    {
      // TODO: this is expensive, consider removing with other real-time features
      // refreshInterval: 1000,
    }
  );

  const { data, error } = res || {};

  if (isLoading || !data) {
    return (
      <main className="h-screen min-h-screen">
        <div className="prose mx-auto p-4 pt-10 md:pt-16 h-full overflow-auto flex-1">
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
    console.log("form preload error", error);

    switch (error.code) {
      case "FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED":
        const { __gf_fp_fingerprintjs_visitorid, customer_id } = error;
        return redirect(
          formlink(HOST_NAME, form_id, "alreadyresponded", {
            fingerprint: __gf_fp_fingerprintjs_visitorid,
            customer: customer_id,
          })
        );
      case "FORM_FORCE_CLOSED":
      case "FORM_RESPONSE_LIMIT_REACHED":
        return redirect(`./${form_id}/formclosed`);
      case "FORM_SOLD_OUT":
        return redirect(`./${form_id}/formsoldout`);
      case "FORM_OPTION_UNAVAILABLE":
        throw new Error("FORM_OPTION_UNAVAILABLE"); // this cant happen
    }
  }

  const submit_action = "/submit/" + form_id;

  return (
    <main className="min-h-screen flex flex-col items-center pt-10 md:pt-16">
      <FormView
        method="POST"
        form_id={form_id}
        action={submit_action}
        title={title}
        fields={fields}
        defaultValues={default_values}
        blocks={blocks}
        tree={tree}
        translation={translation}
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
    </main>
  );
}

function SkeletonCard() {
  return (
    <div className="flex flex-col space-y-3">
      <Skeleton className="h-[24px] w-3/4 rounded-xl" />
      <Skeleton className="h-[100px] w-full rounded-xl" />
      <div className="h-10" />
      <div className="space-y-10">
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    </div>
  );
}

export { FormView } from "./formview";
