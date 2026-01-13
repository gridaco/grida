import { Agent } from "@/grida-forms-hosted/e";
import { headers } from "next/headers";
import { geolocation } from "@vercel/functions";
import { ssr_page_init_i18n } from "@/i18n/ssr";
import i18next from "i18next";

type Params = { id: string };
type SearchParams = { [key: string]: string };

export default async function FormPage(props: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const headersList = await headers();
  const geo = geolocation({ headers: headersList });
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { id: form_id } = await params;
  await ssr_page_init_i18n({ form_id });

  return (
    <Agent
      debug
      form_id={form_id}
      params={searchParams}
      geo={geo}
      translation={{
        next: i18next.t("next"),
        back: i18next.t("back"),
        submit: i18next.t("submit"),
        pay: i18next.t("pay"),
        email_challenge: {
          verify: i18next.t("verify", { defaultValue: "Verify" }),
          sending: i18next.t("sending", { defaultValue: "Sending" }),
          verify_code: i18next.t("email_challenge.verify_code", {
            defaultValue: "Verify",
          }),
          enter_verification_code: i18next.t(
            "email_challenge.enter_verification_code",
            { defaultValue: "Enter verification code" }
          ),
          code_sent: i18next.t("email_challenge.code_sent", {
            defaultValue: "A verification code has been sent to your inbox.",
          }),
          didnt_receive_code: i18next.t("email_challenge.didnt_receive_code", {
            defaultValue: "Didn't receive a code?",
          }),
          resend: i18next.t("resend", { defaultValue: "Resend" }),
          retry: i18next.t("retry", { defaultValue: "Retry" }),
          code_expired: i18next.t("email_challenge.code_expired", {
            defaultValue: "Verification code has expired.",
          }),
          incorrect_code: i18next.t("email_challenge.incorrect_code", {
            defaultValue: "Incorrect verification code. Please try again.",
          }),
          error_occurred: i18next.t("email_challenge.error_occurred", {
            defaultValue: "An error occurred. Please try again later.",
          }),
        },
      }}
    />
  );
}
