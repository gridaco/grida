"use client";

import React from "react";
import { notFound, redirect } from "next/navigation";
import { FormPageDeveloperErrorDialog } from "@/scaffolds/e/form/error";
import { Skeleton } from "@/components/ui/skeleton";
import { useFingerprint } from "@/scaffolds/fingerprint";
import { formlink } from "@/lib/forms/url";
import { GridaFormsFormView, type FormViewTranslation } from "./formview";
import type { FormPageBackgroundSchema } from "@/types";
import { FormPageBackground } from "./background";

import { useRequestFormSession, useFormSession } from "./load";
import { Env } from "@/env";

export function GridaForm({
  form_id,
  params,
  translation,
}: {
  form_id: string;
  params: { [key: string]: string };
  translation: FormViewTranslation;
}) {
  const { session, clearSessionStorage } = useRequestFormSession(form_id);
  const { result: fingerprint } = useFingerprint();

  const onAfterSubmit = () => {
    clearSessionStorage();
  };

  const {
    data: res,
    error: servererror,
    isLoading,
  } = useFormSession(form_id, {
    mode: "anon",
    session_id: session,
    fingerprint: fingerprint,
    urlParams: params,
  });

  const { data, error } = res || {};

  if (isLoading || !session || !data) {
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
    method,
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
          formlink(Env.client.HOST, form_id, "alreadyresponded", {
            fingerprint: __gf_fp_fingerprintjs_visitorid,
            customer_id: customer_id,
            session_id: session,
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
      <GridaFormsFormView
        method={method}
        encType={method === "post" ? "multipart/form-data" : undefined}
        action={submit_action}
        form_id={form_id}
        session_id={session}
        fields={fields}
        defaultValues={default_values}
        blocks={blocks}
        tree={tree}
        translation={translation}
        config={options}
        stylesheet={stylesheet}
        onAfterSubmit={onAfterSubmit}
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

export { GridaFormsFormView };
export { FormView } from "./formview";
