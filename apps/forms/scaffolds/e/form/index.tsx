"use client";

import type { FormPageBackgroundSchema } from "@/types";
import type {
  FormClientFetchResponseData,
  FormClientFetchResponseError,
} from "@/app/(api)/v1/[id]/route";
import { EditorApiResponse } from "@/types/private/api";
import { notFound, redirect } from "next/navigation";
import { FormPageDeveloperErrorDialog } from "@/scaffolds/e/form/error";
import useSWR from "swr";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClientRenderBlock,
  ClientSectionRenderBlock,
} from "@/app/(api)/v1/[id]/route";
import { FormFieldPreview } from "@/components/formfield";
import { PoweredByGridaFooter } from "./powered-by-brand-footer";
import React, { useEffect, useMemo, useState } from "react";
import { FormBlockTree } from "@/lib/forms/types";
import { FormFieldDefinition, PaymentFieldData } from "@/types";
import dynamic from "next/dynamic";
import clsx from "clsx";
import { TossPaymentsCheckoutSessionResponseData } from "@/types/integrations/api";
import { request_toss_payments_checkout_session } from "@/lib/agent/integrations/payments/tosspayments/api";
import {
  TossPaymentsCheckout,
  TossPaymentsCheckoutProvider,
  TossPaymentsPayButton,
} from "@/components/tosspayments";
import { StripePaymentFormFieldPreview } from "@/components/formfield/form-field-preview-payment-stripe";
import { useFingerprint } from "@/scaffolds/fingerprint";
import {
  SYSTEM_GF_CUSTOMER_UUID_KEY,
  SYSTEM_GF_FINGERPRINT_VISITORID_KEY,
} from "@/k/system";
import { formlink } from "@/lib/forms/url";

const ReactPlayer = dynamic(() => import("react-player/lazy"), { ssr: false });

const cjk = ["ko", "ja"];

const cls_button_submit =
  "text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800";
const cls_button_nuetral =
  "py-2.5 px-5 me-2 mb-2 text-sm font-medium text-neutral-900 focus:outline-none bg-white rounded-lg border border-neutral-200 hover:bg-neutral-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-neutral-100 dark:focus:ring-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700 dark:hover:text-white dark:hover:bg-neutral-800";

type PaymentCheckoutSession = TossPaymentsCheckoutSessionResponseData | any;

const HOST_NAME = process.env.NEXT_PUBLIC_HOST_NAME || "http://localhost:3000";

export function Form({
  form_id,
  params,
  translation,
}: {
  form_id: string;
  params: { [key: string]: string };
  translation: FormTranslation;
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

  return (
    <>
      <FormView
        form_id={form_id}
        title={title}
        fields={fields}
        defaultValues={default_values}
        blocks={blocks}
        tree={tree}
        translation={translation}
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
    </>
  );
}

interface FormTranslation {
  next: string;
  back: string;
  submit: string;
  pay: string;
}

function FormView({
  form_id,
  title,
  blocks,
  fields,
  defaultValues,
  tree,
  translation,
  options,
  lang,
  stylesheet,
}: {
  form_id: string;
  title: string;
  defaultValues?: { [key: string]: string };
  fields: FormFieldDefinition[];
  blocks: ClientRenderBlock[];
  tree: FormBlockTree<ClientRenderBlock[]>;
  translation: FormTranslation;
  lang: string;
  options: {
    is_powered_by_branding_enabled: boolean;
  };
  stylesheet?: any;
}) {
  const [checkoutSession, setCheckoutSession] =
    useState<PaymentCheckoutSession | null>(null);
  const [is_submitting, set_is_submitting] = useState(false);

  const submit_action = "/submit/" + form_id;

  const sections = tree.children.filter((block) => block.type === "section");

  const has_sections = sections.length > 0;

  const last_section_id = has_sections
    ? sections[sections.length - 1].id
    : null;

  const [current_section_id, set_current_section_id] = useState<string | null>(
    has_sections ? sections[0].id : null
  );

  const current_section = useMemo(() => {
    return sections.find((section) => section.id === current_section_id) as
      | ClientSectionRenderBlock
      | undefined;
  }, [current_section_id]);

  const primary_action_override_by_payment =
    current_section?.attributes?.contains_payment;

  const submit_hidden = has_sections
    ? primary_action_override_by_payment ||
      last_section_id !== current_section_id
    : false;

  const pay_hidden = !primary_action_override_by_payment;

  const previous_section_button_hidden = has_sections
    ? current_section_id === sections[0].id
    : true;

  const next_section_button_hidden =
    (has_sections ? current_section_id === last_section_id : true) ||
    primary_action_override_by_payment;

  useEffect(() => {
    request_toss_payments_checkout_session({
      form_id: form_id,
      testmode: true,
      redirect: true,
    }).then(setCheckoutSession);
  }, []);

  const onPrevious = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (current_section_id === sections[0].id) {
      return;
    }

    const index = sections.findIndex(
      (section) => section.id === current_section_id
    );
    set_current_section_id(sections[index - 1].id);

    // scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onNext = (e?: React.MouseEvent<HTMLButtonElement>) => {
    // validate current section
    // e.preventDefault();
    // e.stopPropagation();

    if (current_section_id === last_section_id) {
      return;
    }

    const index = sections.findIndex(
      (section) => section.id === current_section_id
    );
    set_current_section_id(sections[index + 1].id);

    // scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const renderBlock = (
    block: ClientRenderBlock,
    context?: {
      is_in_current_section: boolean;
    }
  ): any => {
    switch (block.type) {
      case "section": {
        const is_current_section = current_section_id === block.id;
        return (
          <section
            id={block.id}
            data-gf-section-id={block.id}
            data-gf-section-contains-payment={
              block.attributes?.contains_payment
            }
            key={block.id}
            data-active-section={is_current_section}
            className={clsx(
              "data-[active-section='false']:hidden",
              "rounded",
              stylesheet?.section
            )}
          >
            <GroupLayout>
              {block.children?.map((b) =>
                renderBlock(b, {
                  is_in_current_section: is_current_section,
                })
              )}
            </GroupLayout>
          </section>
        );
      }
      case "field": {
        const { field } = block;
        const { type } = field;

        switch (type) {
          case "payment": {
            switch ((field.data as PaymentFieldData)?.service_provider) {
              case "tosspayments": {
                return <TossPaymentsCheckout {...checkoutSession} />;
              }
              case "stripe": {
                return <StripePaymentFormFieldPreview />;
              }
              default: {
                return <></>;
              }
            }
          }
          default: {
            const defaultValue = defaultValues?.[field.name];
            const is_not_in_current_section = !context?.is_in_current_section;

            return (
              <FormFieldPreview
                key={field.id}
                name={field.name}
                label={field.label}
                placeholder={field.placeholder}
                type={field.type}
                required={field.required}
                requiredAsterisk
                helpText={field.help_text}
                options={field.options}
                pattern={field.pattern}
                defaultValue={defaultValue}
                data={field.data}
                autoComplete={field.autocomplete}
                accept={field.accept}
                multiple={field.multiple}
                novalidate={is_not_in_current_section}
                locked={is_not_in_current_section}
              />
            );
          }
        }
      }
      case "html": {
        return (
          <article
            key={block.id}
            dangerouslySetInnerHTML={{ __html: block.html }}
          />
        );
      }
      case "header": {
        return (
          <header key={block.id}>
            {block.title_html && (
              <h1
                dangerouslySetInnerHTML={{
                  __html: block.title_html,
                }}
              />
            )}
            {block.description_html && (
              <p
                dangerouslySetInnerHTML={{
                  __html: block.description_html,
                }}
              />
            )}
          </header>
        );
      }
      case "image": {
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={block.id} src={block.src} alt="" />
        );
      }
      case "video": {
        return (
          <div
            key={block.id}
            className="rounded overflow-hidden border border-black/20 dark:bg-white/10 aspect-video"
          >
            <ReactPlayer width={"100%"} height={"100%"} url={block.src ?? ""} />
          </div>
        );
      }
      case "pdf": {
        return (
          <object
            key={block.id}
            data={block.data + "#toolbar=0&navpanes=0&scrollbar=0"}
            className="w-full h-full aspect-[1/1.2] max-h-screen rounded overflow-hidden border shadow-sm box-content"
            type="application/pdf"
            width="100%"
            height="100%"
          >
            <a href={block.data} target="_blank">
              {block.data}
            </a>
          </object>
        );
      }
      case "divider":
        return <hr key={block.id} />;
      default:
        return <div key={block["id"]}></div>;
    }
  };

  return (
    <main
      data-cjk={cjk.includes(lang)}
      className={clsx(
        "h-screen md:h-auto min-h-screen",
        "relative mx-auto prose dark:prose-invert",
        "data-[cjk='true']:break-keep",
        "flex flex-col"
      )}
    >
      <TossPaymentsCheckoutProvider initial={checkoutSession}>
        <form
          id="form"
          action={submit_hidden ? undefined : submit_action}
          onSubmit={(e) => {
            if (submit_hidden) {
              e.preventDefault();
              e.stopPropagation();
              const valid = (e.target as HTMLFormElement).checkValidity();
              if (valid) {
                onNext();
              } else {
                // show error
                alert("Please fill out the form correctly.");
              }
            } else {
              // submit
              // disable submit button
              set_is_submitting(true);
            }
          }}
          className="p-4 pt-10 md:pt-16 h-full overflow-auto flex-1"
        >
          <FingerprintField />
          <GroupLayout>{tree.children.map((b) => renderBlock(b))}</GroupLayout>
          {options.is_powered_by_branding_enabled && (
            // desktop branding
            <div className="block md:hidden">
              <PoweredByGridaFooter />
            </div>
          )}
        </form>
        <footer
          className="
          sticky md:static bottom-0
          flex gap-2 justify-end md:justify-start
          bg-white md:bg-transparent dark:bg-neutral-900 md:dark:bg-transparent
          p-4 mt-4 pt-4
          border-t border-neutral-200 dark:border-neutral-800
        "
        >
          <button
            data-previous-hidden={previous_section_button_hidden}
            className={clsx(
              cls_button_nuetral,
              "data-[previous-hidden='true']:hidden"
            )}
            onClick={onPrevious}
          >
            {translation.back}
          </button>
          <button
            data-next-hidden={next_section_button_hidden}
            form="form"
            type="submit"
            className={clsx(
              cls_button_nuetral,
              "w-full md:w-auto",
              "data-[next-hidden='true']:hidden"
            )}
            // onClick={onNext}
          >
            {translation.next}
          </button>
          <button
            data-submit-hidden={submit_hidden}
            disabled={submit_hidden || is_submitting}
            form="form"
            type="submit"
            className={clsx(
              cls_button_submit,
              "w-full md:w-auto",
              "data-[submit-hidden='true']:hidden",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {translation.submit}
          </button>
          <TossPaymentsPayButton
            data-pay-hidden={pay_hidden}
            className={clsx(
              cls_button_submit,
              "w-full md:w-auto",
              "data-[pay-hidden='true']:hidden"
            )}
          >
            {translation.pay}
          </TossPaymentsPayButton>
        </footer>
      </TossPaymentsCheckoutProvider>
      {options.is_powered_by_branding_enabled && (
        // desktop branding
        <div className="hidden md:block">
          <PoweredByGridaFooter />
        </div>
      )}
    </main>
  );
}

function GroupLayout({ children }: React.PropsWithChildren<{}>) {
  return <div className="flex flex-col gap-8">{children}</div>;
}

function FingerprintField() {
  const { result } = useFingerprint();

  /* hidden client fingerprint field */
  return (
    <input
      type="hidden"
      name={SYSTEM_GF_FINGERPRINT_VISITORID_KEY}
      value={result?.visitorId}
    />
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
