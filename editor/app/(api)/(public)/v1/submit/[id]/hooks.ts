import { Bird } from "@/clients/bird";
import { toArrayOf } from "@/types/utility";
import { Env } from "@/env";
import { resend } from "@/clients/resend";
import EmailTemplate from "@/theme/templates-email/formcomplete/default";
import { FormCompletionAuth } from "@/services/form/completion-auth";

// In hosted env, avoid calling the deployment domain (`*.vercel.app`) since it
// can be protected upstream (401) even when our app routes would allow it.
const HOOK_BASE_URL = Env.server.IS_HOSTED ? Env.web.HOST : Env.server.HOST;

const bird = new Bird(
  process.env.BIRD_WORKSPACE_ID as string,
  process.env.BIRD_SMS_CHANNEL_ID as string,
  {
    access_key: process.env.BIRD_API_KEY as string,
  }
);

export namespace OnSubmit {
  async function invoke(path: string, body: unknown) {
    const response = await fetch(`${HOOK_BASE_URL}${path}`, {
      headers: FormCompletionAuth.headers(),
      method: "POST",
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(`Forms completion failed (${response.status})`);
    return response;
  }
  export async function clearsession({
    form_id,
    response_id,
    session_id,
  }: {
    form_id: string;
    response_id: string;
    session_id: string;
  }) {
    return invoke(`/v1/submit/${form_id}/hooks/clearsession`, {
      response_id,
      session_id,
    });
  }

  export async function postindexing({
    form_id,
    response_id,
  }: {
    form_id: string;
    response_id: string;
  }) {
    return invoke(`/v1/submit/${form_id}/hooks/postindexing`, {
      response_id,
    });
  }

  export async function notification_respondent_email({
    form_id,
    response_id,
  }: {
    form_id: string;
    response_id: string;
  }) {
    return invoke(`/v1/submit/${form_id}/hooks/notification-respondent-email`, {
      response_id,
    });
  }
}

export namespace OnSubmitProcessors {
  export async function send_email({
    type,
    from,
    to,
  }: {
    type: "formcomplete";
    form_id: string;
    from:
      | {
          name: string;
          email: string;
        }
      | string;
    to: string | string[];
    lang: string;
  }) {
    const { data, error } = await resend.emails.send({
      from: typeof from === "string" ? from : `${from.name} <${from.email}>`,
      to: Array.isArray(to) ? to : [to],
      subject: type,
      react: EmailTemplate({ firstName: "John" }),
    });

    console.log(data, error);
    //
  }

  export async function send_sms({
    form_id: _form_id,
    to,
    lang: _lang,
    ...rest
  }: (
    | { type: "formcomplete" }
    | {
        type: "custom";
        text: string;
      }
  ) & {
    form_id: string;
    to: string | string[];
    lang: string;
  }) {
    const { type } = rest;

    switch (type) {
      case "formcomplete": {
        return bird
          .sendsms({
            text: "Form complete",
            contacts: toArrayOf(to).map((tel) => ({
              identifierKey: "phonenumber",
              identifierValue: tel,
            })),
          })
          .then(console.log)
          .catch(console.error);
      }
      case "custom": {
        return bird
          .sendsms({
            text: rest.text,
            contacts: toArrayOf(to).map((tel) => ({
              identifierKey: "phonenumber",
              identifierValue: tel,
            })),
          })
          .then(console.log)
          .catch(console.error);
      }
    }
  }
}
