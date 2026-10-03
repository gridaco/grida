import { Agent } from "@/grida-forms-hosted/e";
import { headers } from "next/headers";
import { geolocation } from "@vercel/functions";
import { ssr_page_init_i18n } from "@/i18n/ssr";

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
  const t = await ssr_page_init_i18n({ form_id });

  return (
    <Agent
      debug
      form_id={form_id}
      params={searchParams}
      geo={geo}
      translation={{
        next: t("next"),
        back: t("back"),
        submit: t("submit"),
        pay: t("pay"),
        email_challenge: {
          verify: t("verify", { defaultValue: "Verify" }),
          sending: t("sending", { defaultValue: "Sending" }),
          verify_code: t("email_challenge.verify_code", {
            defaultValue: "Verify",
          }),
          enter_verification_code: t(
            "email_challenge.enter_verification_code",
            { defaultValue: "Enter verification code" }
          ),
          code_sent: t("email_challenge.code_sent", {
            defaultValue: "A verification code has been sent to your inbox.",
          }),
          didnt_receive_code: t("email_challenge.didnt_receive_code", {
            defaultValue: "Didn't receive a code?",
          }),
          resend: t("resend", { defaultValue: "Resend" }),
          retry: t("retry", { defaultValue: "Retry" }),
          code_expired: t("email_challenge.code_expired", {
            defaultValue: "Verification code has expired.",
          }),
          incorrect_code: t("email_challenge.incorrect_code", {
            defaultValue: "Incorrect verification code. Please try again.",
          }),
          error_occurred: t("email_challenge.error_occurred", {
            defaultValue: "An error occurred. Please try again later.",
          }),
        },
      }}
    />
  );
}
