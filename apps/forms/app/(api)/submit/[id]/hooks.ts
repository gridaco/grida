import { Resend } from "resend";
import { EmailTemplate } from "@/theme/templates-email/formcomplete/default";
const resend = new Resend(process.env.RESEND_API_KEY);

export namespace SubmissionHooks {
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
}
