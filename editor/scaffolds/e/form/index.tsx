"use client";

import React, { memo, useMemo } from "react";
import { notFound, redirect } from "next/navigation";
import { FormPageDeveloperErrorDialog } from "@/scaffolds/e/form/error";
import { Skeleton } from "@/components/ui/skeleton";
import { useFingerprint } from "@/components/fingerprint";
import { formlink } from "@/lib/forms/url";
import { GridaFormsFormView, type FormViewTranslation } from "./formview";
import type { FormPageBackgroundSchema } from "@/types";
import { FormPageBackground } from "./background";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useRequestFormSession, useFormSession } from "./load";
import { Env } from "@/env";
import { FormStartPage as FormStartPageRenderer } from "@/theme/templates/formstart";
import { ScreenWindowRoot } from "@/theme/templates/kit/components";
import { AgentPagesFlow, useAgentFlow } from "@/lib/formstate/core/flow";
import type {
  FormAgentPrefetchData,
  FormClientFetchResponseError,
} from "@/app/(api)/(public)/v1/[id]/route";
import { CTAProvider } from "@/theme/templates/kit/contexts/cta.context";
import { StandaloneDocumentEditor } from "@/grida-react-canvas/provider";
import { grida } from "@/grida";
import { FormAgentGeo } from "@/lib/formstate/core/geo";

export function Agent({
  form_id,
  params,
  translation,
  geo,
}: {
  form_id: string;
  params: { [key: string]: string };
  translation: FormViewTranslation;
  geo?: FormAgentGeo;
}) {
  const { session } = useRequestFormSession(form_id);
  const { result: fingerprint } = useFingerprint();

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

  if (error) {
    console.log("form preload error", error);
  }

  if (servererror) {
    return notFound();
  }

  return (
    <Ready
      form_id={form_id}
      session={session}
      geo={geo}
      data={data}
      error={error}
      translation={translation}
    />
  );
}

function Ready({
  form_id,
  session,
  geo,
  data,
  error,
  translation,
}: {
  form_id: string;
  session: string;
  geo?: FormAgentGeo;
  data: FormAgentPrefetchData;
  error?: FormClientFetchResponseError | null;
  translation: FormViewTranslation;
}) {
  const { background } = data;

  const pages = useMemo(() => {
    const { start_page, lang, campaign } = data;
    return {
      start: start_page ? (
        <FormStartPage
          start_page={start_page}
          campaign={campaign}
          lang={lang}
        />
      ) : undefined,
      main: (
        <FormPage
          form_id={form_id}
          session={session}
          geo={geo}
          data={data}
          error={error}
          translation={translation}
        />
      ),
    };
  }, [data, form_id, session, error, translation]);

  return (
    <>
      <AgentPagesFlow pages={pages} />
      {background && (
        <FormPageBackground {...(background as FormPageBackgroundSchema)} />
      )}
      {error && (
        <div className="fixed top-4 right-4 z-[9999]">
          <FormPageDeveloperErrorDialog {...error} />
        </div>
      )}
    </>
  );
}

function FormStartPage({
  start_page,
  campaign,
  lang,
}: {
  start_page: NonNullable<FormAgentPrefetchData["start_page"]>;
  campaign: FormAgentPrefetchData["campaign"];
  lang: FormAgentPrefetchData["lang"];
}) {
  const { next } = useAgentFlow();

  return (
    <StandaloneDocumentEditor
      editable={false}
      initial={{
        document: start_page,
        templates: {
          [(
            start_page.nodes["page"] as grida.program.nodes.TemplateInstanceNode
          ).template_id]: FormStartPageRenderer.getTemplate(
            (
              start_page.nodes[
                "page"
              ] as grida.program.nodes.TemplateInstanceNode
            ).template_id
          ),
        },
      }}
    >
      <CTAProvider value={{ onClick: next }}>
        <ScreenWindowRoot>
          {/* TODO: use a unified renderer */}
          <FormStartPageRenderer.TemplateRenderer
            name={
              (
                start_page.nodes[
                  "page"
                ] as grida.program.nodes.TemplateInstanceNode
              ).template_id
            }
            // TODO: handle more data - agent errors states
            meta={campaign}
            lang={lang}
          />
        </ScreenWindowRoot>
      </CTAProvider>
    </StandaloneDocumentEditor>
  );
}

function FormPage({
  form_id,
  session,
  geo,
  data,
  error,
  translation,
}: {
  form_id: string;
  session: string;
  geo?: FormAgentGeo;
  data: FormAgentPrefetchData;
  error?: FormClientFetchResponseError | null;
  translation: FormViewTranslation;
}) {
  const {
    //
    start_page,
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
    campaign,
  } = data;

  const { clearSessionStorage } = useRequestFormSession(form_id);

  const onAfterSubmit = () => {
    clearSessionStorage();
  };

  if (error) {
    switch (error.code) {
      case "FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED":
        const { __gf_fp_fingerprintjs_visitorid, customer_id } = error;
        return redirect(
          formlink(Env.web.HOST, form_id, "alreadyresponded", {
            fingerprint: __gf_fp_fingerprintjs_visitorid,
            customer_id: customer_id,
            session_id: session,
          })
        );
      case "FORM_FORCE_CLOSED":
      case "FORM_SCHEDULE_NOT_IN_RANGE":
      case "FORM_RESPONSE_LIMIT_REACHED":
        return redirect(`./${form_id}/formclosed`);
      case "FORM_SOLD_OUT":
        return redirect(`./${form_id}/formsoldout`);
      case "FORM_OPTION_UNAVAILABLE":
        throw new Error("FORM_OPTION_UNAVAILABLE"); // this cant happen
    }
  }

  const submit_action = `${Env.web.HOST}/v1/submit/${form_id}`;

  return (
    <main className="min-h-screen flex flex-col items-center pt-10 md:pt-16">
      <TooltipProvider>
        <GridaFormsFormView
          method={method}
          encType={method === "post" ? "multipart/form-data" : undefined}
          action={submit_action}
          form_id={form_id}
          session_id={session}
          geo={geo}
          fields={fields}
          defaultValues={default_values}
          blocks={blocks}
          tree={tree}
          translation={translation}
          config={options}
          stylesheet={stylesheet}
          onAfterSubmit={onAfterSubmit}
        />
      </TooltipProvider>
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
