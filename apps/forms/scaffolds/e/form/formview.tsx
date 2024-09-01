"use client";

import FormField from "@/components/formfield";
import { PoweredByGridaFooter } from "./powered-by-brand-footer";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FormBlockTree } from "@/lib/forms/types";
import { FormFieldDefinition, PaymentFieldData } from "@/types";
import dynamic from "next/dynamic";
import clsx from "clsx";
import { request_toss_payments_checkout_session } from "@/lib/agent/integrations/payments/tosspayments/api";
import { TossPaymentsCheckoutSessionResponseData } from "@/types/integrations/api";
import {
  TossPaymentsCheckout,
  TossPaymentsCheckoutProvider,
  TossPaymentsPayButton,
} from "@/components/tosspayments";
import { StripePaymentFormFieldPreview } from "@/components/formfield/form-field-preview-payment-stripe";
import { useFingerprint } from "@/scaffolds/fingerprint";
import {
  SYSTEM_GF_FINGERPRINT_VISITORID_KEY,
  SYSTEM_GF_SESSION_KEY,
  SYSTEM_GF_TIMEZONE_UTC_OFFSET_KEY,
} from "@/k/system";
import {
  ClientFieldRenderBlock,
  ClientFileUploadFieldRenderBlock,
  ClientRenderBlock,
  ClientSectionRenderBlock,
} from "@/lib/forms";
import { Button } from "@/components/ui/button";
import {
  FormAgentProvider,
  useFormAgentState,
  init,
  useFormAgent,
} from "@/lib/formstate";
import { FieldSupports } from "@/k/supported_field_types";
import { SessionDataSyncProvider } from "./sync";
import { MediaLoadPluginProvider } from "./mediaload";
import { FormAgentMessagingInterfaceProvider } from "./interface";
import { FormAgentMessagingInterface } from "./emit";
import { useValue } from "@/lib/spock";

const html_form_id = "form";

type PaymentCheckoutSession = TossPaymentsCheckoutSessionResponseData | any;

const ReactPlayer = dynamic(() => import("react-player/lazy"), { ssr: false });

type HtmlFormElementProps = Omit<
  React.FormHTMLAttributes<HTMLFormElement>,
  "title" | "onSubmit"
>;

interface IOnSubmit {
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  onAfterSubmit?: () => void;
}

export interface FormViewTranslation {
  next: string;
  back: string;
  submit: string;
  pay: string;
}

const default_form_view_translation_en: FormViewTranslation = {
  next: "Next",
  back: "Back",
  submit: "Submit",
  pay: "Pay",
};

type FormViewRootProps = {
  form_id: string;
  session_id?: string;
  fields: FormFieldDefinition[];
  blocks: ClientRenderBlock[];
  tree: FormBlockTree<ClientRenderBlock[]>;
  defaultValues?: { [key: string]: string };
};

export function GridaFormsFormView(
  props: FormViewRootProps & FormBodyProps & HtmlFormElementProps & IOnSubmit
) {
  return (
    <FormViewRoot {...props}>
      <div
        id="form-view"
        data-cjk={props.config.optimize_for_cjk}
        className={clsx(
          "prose dark:prose-invert prose-headings:text-foreground prose-p:text-foreground prose-hr:border-border text-foreground",
          "w-full h-full md:h-auto grow md:grow-0",
          "relative",
          "data-[cjk='true']:break-keep",
          "flex flex-col",
          props.className
        )}
      >
        <GridaFormBody {...props} />
        <GridaFormFooter
          translation={props.translation}
          is_powered_by_branding_enabled={
            props.config.is_powered_by_branding_enabled
          }
        />
      </div>
    </FormViewRoot>
  );
}

export function FormViewRoot({
  children,
  ...props
}: React.PropsWithChildren<FormViewRootProps>) {
  return <Providers {...props}>{children}</Providers>;
}

function Providers({
  form_id,
  session_id,
  fields,
  blocks,
  children,
  tree,
  defaultValues,
}: React.PropsWithChildren<{
  form_id: string;
  session_id?: string;
  defaultValues?: { [key: string]: string };
  fields: FormFieldDefinition[];
  blocks: ClientRenderBlock[];
  tree: FormBlockTree<ClientRenderBlock[]>;
}>) {
  const [checkoutSession, setCheckoutSession] =
    useState<PaymentCheckoutSession | null>(null);

  useEffect(() => {
    request_toss_payments_checkout_session({
      form_id: form_id,
      testmode: true,
      redirect: true,
    }).then(setCheckoutSession);
  }, [form_id]);

  return (
    <>
      <FormAgentProvider
        initial={init({
          form_id,
          session_id,
          fields,
          blocks,
          tree,
          defaultValues,
        })}
      >
        <FormAgentMessagingInterfaceProvider />
        <MediaLoadPluginProvider />
        <SessionDataSyncProvider session_id={session_id}>
          <TossPaymentsCheckoutProvider initial={checkoutSession}>
            {children}
          </TossPaymentsCheckoutProvider>
        </SessionDataSyncProvider>
      </FormAgentProvider>
    </>
  );
}

type FormBodyProps = {
  translation?: FormViewTranslation;
  config: {
    is_powered_by_branding_enabled: boolean;
    optimize_for_cjk?: boolean;
  };
  stylesheet?: any;
};

const GridaFormBody = FormBody;

export function FormBody({
  onSubmit,
  onAfterSubmit,
  className,
  translation = default_form_view_translation_en,
  config,
  stylesheet,
  ...formattributes
}: FormBodyProps & HtmlFormElementProps & IOnSubmit) {
  const [state, dispatch] = useFormAgentState();
  const { tree, session_id, current_section_id, submit_hidden, onNext } =
    useFormAgent();

  // the default value shall be fixed on the first render (since the defaultValues can be changed due to session data sync. - which might cause data loss on the form field.)
  const initialDefaultValues = useRef(state.defaultValues);

  useEffect(() => {
    // scroll to top when section changes
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [current_section_id]);

  const getDefaultValue = useCallback(
    (key: string) => initialDefaultValues.current?.[key],
    []
  );

  return (
    <>
      <form
        {...formattributes}
        id={html_form_id}
        action={submit_hidden ? undefined : formattributes.action}
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
            FormAgentMessagingInterface.emit({ type: "submit" });
            // disable submit button
            dispatch({ type: "form/submit" });

            onSubmit?.(e);
            onAfterSubmit?.();
          }
        }}
        className="p-4 h-full md:h-auto flex-1"
      >
        <div hidden>
          <BrowserTimezoneOffsetField />
          <FingerprintField />
          {session_id && (
            <input
              type="hidden"
              name={SYSTEM_GF_SESSION_KEY}
              value={session_id}
            />
          )}
        </div>
        <GroupLayout>
          {tree.children.map((b) => (
            <BlockRenderer
              key={b.id}
              block={b}
              stylesheet={stylesheet}
              getDefaultValue={getDefaultValue}
            />
          ))}
        </GroupLayout>
        {config.is_powered_by_branding_enabled && (
          // desktop branding
          <div className="block md:hidden">
            <PoweredByGridaFooter />
          </div>
        )}
      </form>
    </>
  );
}

function GridaFormFooter({
  is_powered_by_branding_enabled,
  translation = default_form_view_translation_en,
}: {
  is_powered_by_branding_enabled: boolean;
  translation?: FormViewTranslation;
}) {
  const { pay_hidden } = useFormAgent();

  return (
    <>
      <Footer shouldHidePay={pay_hidden} translation={translation} />
      {/* on desktop, branding attribute is below footer */}
      {is_powered_by_branding_enabled && (
        <div className="hidden md:block">
          <PoweredByGridaFooter />
        </div>
      )}
    </>
  );
}

function Footer({
  translation,
  shouldHidePay,
}: {
  shouldHidePay: boolean;
  translation: FormViewTranslation;
}) {
  return (
    <footer
      className={clsx(
        "sticky bottom-0",
        "flex gap-2 p-4 pt-4 border-t",
        "justify-end bg-background",
        "md:static md:justify-start md:bg-transparent md:dark:bg-transparent"
      )}
    >
      <FormPrev>{translation.back}</FormPrev>
      <FormNext className="w-full md:w-auto">{translation.next}</FormNext>
      <FormSubmit className="w-full md:w-auto">{translation.submit}</FormSubmit>
      <TossPaymentsPayButton
        data-pay-hidden={shouldHidePay}
        className={clsx(
          "text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800",
          "w-full md:w-auto",
          "data-[pay-hidden='true']:hidden"
        )}
      >
        {translation.pay}
      </TossPaymentsPayButton>
    </footer>
  );
}

function FormPrev({
  className,
  children,
}: React.PropsWithChildren<{
  className?: string;
}>) {
  const { has_previous, onPrevious } = useFormAgent();

  return (
    <Button
      variant="outline"
      data-next-hidden={!has_previous}
      className={clsx("data-[next-hidden='true']:hidden", className)}
      onClick={onPrevious}
    >
      {children}
    </Button>
  );
}

function FormNext({
  className,
  children,
}: React.PropsWithChildren<{
  className?: string;
}>) {
  const { has_next } = useFormAgent();

  return (
    <Button
      variant="outline"
      data-next-hidden={!has_next}
      form={html_form_id}
      type="submit"
      className={clsx("data-[next-hidden='true']:hidden", className)}
    >
      {children}
    </Button>
  );
}

function FormSubmit({
  className,
  children,
}: React.PropsWithChildren<{
  className?: string;
}>) {
  const { submit_hidden, is_submitting } = useFormAgent();

  return (
    <Button
      data-submit-hidden={submit_hidden}
      disabled={submit_hidden || is_submitting}
      form={html_form_id}
      type="submit"
      className={clsx(
        "data-[submit-hidden='true']:hidden",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
    >
      {children}
    </Button>
  );
}

function BlockRenderer({
  block,
  stylesheet,
  getDefaultValue,
  // this is the default config because if the form does not have a section, it is considered as a single root section.
  // if there is a section, the section renderer will create a new context.
  context = { is_root: true, is_in_current_section: false },
}: {
  block: ClientRenderBlock;
  stylesheet?: any;
  // e.g. (key) => defaultValues?.[key]
  getDefaultValue?: (key: string) => string | undefined;
  context?: {
    is_root: boolean;
    is_in_current_section: boolean;
  };
}) {
  const [state, dispatch] = useFormAgentState();

  const onValueChange = useCallback(
    (value: string | boolean | number) => {
      dispatch({
        type: "fields/value/change",
        id: (block as ClientFieldRenderBlock).field.id,
        value,
      });
    },
    [block, dispatch]
  );

  const onFilesChange = useCallback(
    (files: File[]) => {
      dispatch({
        type: "fields/files/change",
        id: (block as ClientFieldRenderBlock).field.id,
        files,
      });
    },
    [block, dispatch]
  );

  const hidden = useValue<boolean>(block.v_hidden);

  const { current_section_id } = state;

  const __shared_root_attr = {
    hidden: hidden,
    id: block.id,
  };

  switch (block.type) {
    case "section": {
      const is_current_section = current_section_id === block.id;
      return (
        <section
          {...__shared_root_attr}
          data-gf-section-id={block.id}
          data-gf-section-contains-payment={block.attributes?.contains_payment}
          data-active-section={is_current_section}
          className={clsx(
            "data-[active-section='false']:hidden",
            "rounded",
            stylesheet?.section
          )}
        >
          <GroupLayout>
            {block.children?.map((b) => (
              <BlockRenderer
                key={b.id}
                block={b}
                stylesheet={stylesheet}
                getDefaultValue={getDefaultValue}
                context={{
                  is_root: false, // always false
                  is_in_current_section: is_current_section,
                }}
              />
            ))}
          </GroupLayout>
        </section>
      );
    }
    case "field": {
      const { field } = block;
      const { type } = field;

      const is_not_in_current_section_nor_root =
        !context.is_in_current_section && !context.is_root;

      const defaultValue = getDefaultValue?.(field.name);

      switch (type) {
        case "payment": {
          switch ((field.data as PaymentFieldData)?.service_provider) {
            case "tosspayments": {
              return <TossPaymentsCheckout />;
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
          return (
            <div {...__shared_root_attr}>
              {/* we are unmounting the field on hidden to prevent the hidden block field value being submitted */}
              {/* this is mainly for strict logic handling on inventory tracking, but there will be a case where user might still want to accpet the value even when hidden (since the hidden can change in runtime.) */}
              {!hidden ? (
                <FormField
                  key={field.id}
                  id={field.id}
                  name={field.name}
                  label={field.label}
                  placeholder={field.placeholder}
                  type={field.type}
                  is_array={field.is_array}
                  required={field.required}
                  readonly={field.readonly}
                  requiredAsterisk
                  helpText={field.help_text}
                  options={field.options}
                  optgroups={field.optgroups}
                  pattern={field.pattern}
                  step={field.step}
                  min={field.min}
                  max={field.max}
                  defaultValue={defaultValue}
                  data={field.data}
                  autoComplete={field.autocomplete}
                  accept={field.accept}
                  multiple={field.multiple}
                  novalidate={is_not_in_current_section_nor_root || hidden}
                  locked={is_not_in_current_section_nor_root || hidden}
                  v_value={field.v_value}
                  fileupload={
                    FieldSupports.file_upload(type)
                      ? (field as ClientFileUploadFieldRenderBlock["field"])
                          .upload
                      : undefined
                  }
                  fileresolve={
                    FieldSupports.file_upload(type)
                      ? (field as ClientFileUploadFieldRenderBlock["field"])
                          .resolve
                      : undefined
                  }
                  onValueChange={onValueChange}
                  onCheckedChange={onValueChange}
                  onRangeChange={([num]) => {
                    // this does not support multiple range input
                    onValueChange(num);
                  }}
                  onFilesChange={onFilesChange}
                />
              ) : (
                <></>
              )}
            </div>
          );
        }
      }
    }
    case "html": {
      return (
        <article
          {...__shared_root_attr}
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      );
    }
    case "header": {
      return (
        <header {...__shared_root_attr}>
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
        <img {...__shared_root_attr} src={block.src} alt="" />
      );
    }
    case "video": {
      return (
        <div
          {...__shared_root_attr}
          className="rounded overflow-hidden border border-black/20 dark:bg-white/10 aspect-video"
        >
          <ReactPlayer width={"100%"} height={"100%"} url={block.src ?? ""} />
        </div>
      );
    }
    case "pdf": {
      return (
        <object
          {...__shared_root_attr}
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
      return <hr {...__shared_root_attr} />;
    default:
      return <div {...__shared_root_attr}></div>;
  }
}

function GroupLayout({ children }: React.PropsWithChildren<{}>) {
  return <div className="flex flex-col gap-8">{children}</div>;
}

function BrowserTimezoneOffsetField() {
  const offset = useMemo(() => new Date().getTimezoneOffset(), []);
  return (
    <input
      type="hidden"
      name={SYSTEM_GF_TIMEZONE_UTC_OFFSET_KEY}
      value={offset}
    />
  );
}

function FingerprintField() {
  const { result } = useFingerprint();

  /* hidden client fingerprint field */
  return (
    <input
      type="hidden"
      name={SYSTEM_GF_FINGERPRINT_VISITORID_KEY}
      value={result?.visitorId ?? ""}
    />
  );
}

export const FormView = {
  Root: FormViewRoot,
  Body: FormBody,
  Prev: FormPrev,
  Next: FormNext,
  Submit: FormSubmit,
};
