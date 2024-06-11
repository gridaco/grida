import { Resend } from "resend";
import { EmailTemplate } from "@/theme/templates-email/formcomplete/default";
import { Bird } from "@/lib/bird";
import { toArrayOf } from "@/types/utility";
import { SupabaseStorageExt } from "@/lib/supabase/storage-ext";
import { client } from "@/lib/supabase/server";
import {
  GRIDA_FORMS_RESPONSE_BUCKET,
  GRIDA_FORMS_RESPONSE_BUCKET_TMP_FOLDER,
} from "@/k/env";
import assert from "assert";

const resend = new Resend(process.env.RESEND_API_KEY);
const bird = new Bird(
  process.env.BIRD_WORKSPACE_ID as string,
  process.env.BIRD_SMS_CHANNEL_ID as string,
  {
    access_key: process.env.BIRD_API_KEY as string,
  }
);

const HOST = process.env.HOST || "http://localhost:3000";

export namespace OnSubmit {
  export async function clearsession(form_id: string, session_id: string) {
    return fetch(`${HOST}/submit/${form_id}/hooks/clearsession`, {
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({ session_id }),
    });
  }
}

export namespace OnSubmitProcessors {
  export async function send_email({
    type,
    form_id,
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
      text: undefined as any, // bug
      react: EmailTemplate({ firstName: "John" }),
    });

    console.log(data, error);
    //
  }

  export async function send_sms({
    form_id,
    to,
    lang,
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

  export async function clean_tmp_files(session_id: string) {
    assert(session_id, "session_id is required");

    SupabaseStorageExt.rmdir(
      client.storage,
      GRIDA_FORMS_RESPONSE_BUCKET,
      GRIDA_FORMS_RESPONSE_BUCKET_TMP_FOLDER + "/" + session_id
    )
      .then(() => {
        console.log("cleaned tmp files for session", session_id);
      })
      .catch(console.error);
  }
}
