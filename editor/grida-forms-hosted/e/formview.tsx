"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import FormField from "@/components/formfield";
import { PoweredByGridaFooter } from "./powered-by-brand-footer";
import { FormBlockTree } from "@/grida-forms/lib/types";
import type {
  FormFieldDefinition,
  PaymentFieldData,
} from "@/grida-forms-hosted/types";
import dynamic from "next/dynamic";
import { cn } from "@/components/lib/utils";
import { request_toss_payments_checkout_session } from "@/grida-forms-hosted/integrations/payments/tosspayments/api";
import { TossPaymentsCheckoutSessionResponseData } from "@/types/integrations/api";
import {
  TossPaymentsCheckout,
  TossPaymentsCheckoutProvider,
  TossPaymentsPayButton,
} from "@/components/tosspayments";
import { StripePaymentFormFieldPreview } from "@/components/formfield/form-field-preview-payment-stripe";
import {
  EmailChallengeProvider,
  createHttpEmailChallengeProvider,
} from "@/components/formfield/email-challenge";
import { useFingerprint } from "@/components/fingerprint";
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
} from "@/grida-forms/lib";
import { Button } from "@/components/ui/button";
import {
  FormAgentProvider,
  useFormAgentState,
  init,
  useFormAgent,
} from "@/grida-forms/formstate";
import { FieldSupports } from "@/k/supported_field_types";
import { SessionDataSyncProvider } from "./sync";
import { MediaLoadPluginProvider } from "./mediaload";
import { FormAgentMessagingInterfaceProvider } from "./interface";
import { FormAgentMessagingInterface } from "./emit";
import { useValue } from "@/lib/spock";
import { Spinner } from "@/components/ui/spinner";
import { PhoneFieldDefaultCountryProvider } from "@/components/formfield/phone-field";
import type { FormAgentGeo } from "@/grida-forms/formstate/core/geo";
import resources from "@/i18n";
import { select_lang } from "@/i18n/utils";
import { supported_form_page_languages } from "@/k/supported_languages";

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
  email_challenge: {
    verify: string;
    sending: string;
    verify_code: string;
    enter_verification_code: string;
    code_sent: string;
    didnt_receive_code: string;
    resend: string;
    retry: string;
    code_expired: string;
    incorrect_code: string;
    error_occurred: string;
  };
}

/**
 * Build a {@link FormViewTranslation} from shared i18n resources for the
 * given language code.  Unknown / unsupported codes fall back to `"en"`.
 */
function build_form_view_translation(lang: string): FormViewTranslation {
  const lng = select_lang(lang, supported_form_page_languages, "en");
  const t = resources[lng].translation;
  const ec = t.email_challenge;

  return {
    next: t.next,
    back: t.back,
    submit: t.submit,
    pay: t.pay,
    email_challenge: {
      verify: t.verify,
      sending: t.sending,
      verify_code: ec.verify_code,
      enter_verification_code: ec.enter_verification_code,
      code_sent: ec.code_sent,
      didnt_receive_code: ec.didnt_receive_code,
      resend: t.resend,
      retry: t.retry,
      code_expired: ec.code_expired,
      incorrect_code: ec.incorrect_code,
      error_occurred: ec.error_occurred,
    },
  };
}

/** Canonical English translation, derived from the shared i18n resources. */
const default_form_view_translation_en = build_form_view_translation("en");

const FormViewTranslationContext = React.createContext<FormViewTranslation>(
  default_form_view_translation_en
);

function useFormViewTranslation() {
  return React.useContext(FormViewTranslationContext);
}

type FormViewRootProps = {
  form_id: string;
  session_id?: string;
  geo?: FormAgentGeo;
  fields: FormFieldDefinition[];
  blocks: ClientRenderBlock[];
  tree: FormBlockTree<ClientRenderBlock[]>;
  defaultValues?: { [key: string]: string };
  /**
   * Optional language code (e.g. `"ko"`, `"en"`).
   * Resolves a {@link FormViewTranslation} from the shared i18n resources and
   * provides it via context so that `FormView.Body`, `FormView.Prev`,
   * `FormView.Next`, and `FormView.Submit` are automatically localised.
   *
   * An explicit {@link translation} prop takes precedence over `lang`.
   */
  lang?: string;
  /**
   * Explicit {@link FormViewTranslation} object.
   * Takes precedence over {@link lang}.  When both are omitted the context
   * defaults to English.
   */
  translation?: FormViewTranslation;
};

export function GridaFormsFormView(
  props: FormViewRootProps & FormBodyProps & HtmlFormElementProps & IOnSubmit
) {
  return (
    <FormViewRoot {...props}>
      <div
        id="form-view"
        data-cjk={props.config.optimize_for_cjk}
        className={cn(
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
  lang,
  translation: translationProp,
  ...props
}: React.PropsWithChildren<FormViewRootProps>) {
  const translation = useMemo(
    () =>
      translationProp ??
      (lang
        ? build_form_view_translation(lang)
        : default_form_view_translation_en),
    [translationProp, lang]
  );

  return (
    <FormViewTranslationContext.Provider value={translation}>
      <Providers {...props}>{children}</Providers>
    </FormViewTranslationContext.Provider>
  );
}

function Providers({
  form_id,
  session_id,
  geo,
  fields,
  blocks,
  children,
  tree,
  defaultValues,
}: React.PropsWithChildren<{
  form_id: string;
  session_id?: string;
  geo?: FormAgentGeo;
  defaultValues?: { [key: string]: string };
  fields: FormFieldDefinition[];
  blocks: ClientRenderBlock[];
  tree: FormBlockTree<ClientRenderBlock[]>;
}>) {
  const [checkoutSession, setCheckoutSession] =
    useState<PaymentCheckoutSession | null>(null);
  const emailChallengeProvider = useMemo(
    () => createHttpEmailChallengeProvider({}),
    []
  );

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
        <PhoneFieldDefaultCountryProvider defaultCountry={geo?.country}>
          <FormAgentMessagingInterfaceProvider />
          <MediaLoadPluginProvider />
          <SessionDataSyncProvider session_id={session_id}>
            <EmailChallengeProvider provider={emailChallengeProvider}>
              <TossPaymentsCheckoutProvider initial={checkoutSession}>
                {children}
              </TossPaymentsCheckoutProvider>
            </EmailChallengeProvider>
          </SessionDataSyncProvider>
        </PhoneFieldDefaultCountryProvider>
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
  translation: translationProp,
  config,
  stylesheet,
  ...formattributes
}: FormBodyProps & HtmlFormElementProps & IOnSubmit) {
  const contextTranslation = useFormViewTranslation();
  const translation = translationProp ?? contextTranslation;
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
              emailChallengeTranslation={translation.email_challenge}
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
}: {
  is_powered_by_branding_enabled: boolean;
}) {
  const { pay_hidden } = useFormAgent();

  return (
    <>
      <Footer shouldHidePay={pay_hidden} />
      {/* on desktop, branding attribute is below footer */}
      {is_powered_by_branding_enabled && (
        <div className="hidden md:block">
          <PoweredByGridaFooter />
        </div>
      )}
    </>
  );
}

function Footer({ shouldHidePay }: { shouldHidePay: boolean }) {
  const translation = useFormViewTranslation();

  return (
    <footer
      className={cn(
        "sticky bottom-0",
        "flex gap-2 p-4 pt-4 border-t",
        "justify-end bg-background",
        "md:static md:justify-start md:bg-transparent md:dark:bg-transparent"
      )}
    >
      <FormPrev />
      <FormNext className="flex-1 md:w-auto" />
      <FormSubmit className="flex-1 md:w-auto" />
      <TossPaymentsPayButton
        data-pay-hidden={shouldHidePay}
        className={cn(
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
  const translation = useFormViewTranslation();

  return (
    <Button
      variant="outline"
      data-next-hidden={!has_previous}
      className={cn("data-[next-hidden='true']:hidden", className)}
      onClick={onPrevious}
    >
      {children ?? translation.back}
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
  const translation = useFormViewTranslation();

  return (
    <Button
      variant="outline"
      data-next-hidden={!has_next}
      form={html_form_id}
      type="submit"
      className={cn("data-[next-hidden='true']:hidden", className)}
    >
      {children ?? translation.next}
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
  const translation = useFormViewTranslation();

  return (
    <Button
      data-submit-hidden={submit_hidden}
      disabled={submit_hidden || is_submitting}
      form={html_form_id}
      type="submit"
      className={cn(
        "min-w-10",
        "data-[submit-hidden='true']:hidden",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
    >
      {is_submitting && (
        <div className="flex items-center justify-center">
          <Spinner className="me-2" />
        </div>
      )}
      {children ?? translation.submit}
    </Button>
  );
}

function BlockRenderer({
  block,
  stylesheet,
  getDefaultValue,
  emailChallengeTranslation,
  // this is the default config because if the form does not have a section, it is considered as a single root section.
  // if there is a section, the section renderer will create a new context.
  context = { is_root: true, is_in_current_section: false },
}: {
  block: ClientRenderBlock;
  stylesheet?: any;
  // e.g. (key) => defaultValues?.[key]
  getDefaultValue?: (key: string) => string | undefined;
  emailChallengeTranslation: FormViewTranslation["email_challenge"];
  context?: {
    is_root: boolean;
    is_in_current_section: boolean;
  };
}) {
  const [state, dispatch] = useFormAgentState();
  const { session_id } = useFormAgent();

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
          className={cn(
            "data-[active-section='false']:hidden",
            "rounded-sm",
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
                emailChallengeTranslation={emailChallengeTranslation}
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
        case "challenge_email": {
          return (
            <div {...__shared_root_attr}>
              {!hidden ? (
                <FormField
                  key={field.id}
                  id={field.id}
                  name={field.name}
                  label={field.label}
                  placeholder={field.placeholder ?? "alice@example.com"}
                  type="challenge_email"
                  required={field.required}
                  requiredAsterisk
                  helpText={field.help_text}
                  disabled={is_not_in_current_section_nor_root || hidden}
                  novalidate={is_not_in_current_section_nor_root || hidden}
                  locked={is_not_in_current_section_nor_root || hidden}
                  sessionId={session_id}
                  fieldId={field.id}
                  emailChallengeI18n={emailChallengeTranslation}
                />
              ) : (
                <></>
              )}
            </div>
          );
        }
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
      // eslint-disable-next-line @next/next/no-img-element -- Intentional: renders user-provided form content (external URLs).
      return <img {...__shared_root_attr} src={block.src} alt="" />;
    }
    case "video": {
      return (
        <div
          {...__shared_root_attr}
          className="rounded-sm overflow-hidden border border-black/20 aspect-video"
        >
          <ReactPlayer
            width={"100%"}
            height={"100%"}
            url={block.src ?? ""}
            controls={false}
            playing
            playsinline
            loop
            muted
          />
        </div>
      );
    }
    case "pdf": {
      return (
        <object
          {...__shared_root_attr}
          data={block.data + "#toolbar=0&navpanes=0&scrollbar=0"}
          className="w-full h-full aspect-[1/1.2] max-h-screen rounded-sm overflow-hidden border shadow-sm box-content"
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

function GroupLayout({ children }: React.PropsWithChildren) {
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
