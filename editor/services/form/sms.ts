import { Bird } from "@/clients/bird";
import { toArrayOf } from "@/types/utility";
const bird = new Bird(
  process.env.BIRD_WORKSPACE_ID as string,
  process.env.BIRD_SMS_CHANNEL_ID as string,
  { access_key: process.env.BIRD_API_KEY as string }
);

export namespace OnSubmitProcessors {
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
