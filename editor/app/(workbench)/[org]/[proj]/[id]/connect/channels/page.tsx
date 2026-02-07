"use client";

import { useMemo, useState, type ReactNode } from "react";
import React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Controller, useForm, useWatch } from "react-hook-form";
import { BirdLogo, KakaoTalkLogo, WhatsAppLogo } from "@/components/logos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  LightningBoltIcon,
  QuestionMarkCircledIcon,
} from "@radix-ui/react-icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import MessageAppFrame from "@/components/frames/message-app-frame";
import { bird_sms_fees } from "@/k/sms_fees";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui-editor/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Separator } from "@/components/ui/separator";
import { MessageCircleIcon } from "lucide-react";
import { useEditorState } from "@/scaffolds/editor";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { PrivateEditorApi } from "@/lib/private";
import { EmailTemplateAuthoringKit } from "@/kits/email-template-authoring";
import {
  EmailFrame,
  EmailFrameSubject,
  EmailFrameSender,
  EmailFrameBody,
} from "@/components/frames/email-frame";

const SMS_DEFAULT_ORIGINATOR = process.env
  .NEXT_PUBLIC_BIRD_SMS_DEFAULT_ORIGINATOR as string;

function ControlsPreviewLayout({
  controls,
  preview,
}: {
  controls: ReactNode;
  preview?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[4fr_6fr] gap-0 min-h-0">
      <div className="py-10 pr-8">{controls}</div>
      <div className="py-10 pl-8 pr-8 bg-muted/40 rounded-r-lg">
        {preview ?? null}
      </div>
    </div>
  );
}

type EmailFormValues = {
  enabled: boolean;
  from_name: string | null;
  subject_template: string | null;
  body_html_template: string | null;
  reply_to: string | null;
};

export default function ConnectChannels() {
  const [state, dispatch] = useEditorState();
  const { form } = state;

  const isCiamEnabled = useMemo(() => {
    return form.fields.some((f) => f.type === "challenge_email");
  }, [form.fields]);

  const emailInitial = form.notification_respondent_email;

  const emailForm = useForm<EmailFormValues>({
    defaultValues: {
      enabled: emailInitial.enabled,
      from_name: emailInitial.from_name,
      subject_template: emailInitial.subject_template,
      body_html_template: emailInitial.body_html_template,
      reply_to: emailInitial.reply_to,
    },
  });

  const {
    handleSubmit: handleEmailSubmit,
    control: emailControl,
    setValue: setEmailValue,
    formState: { isSubmitting: emailSubmitting, isDirty: emailDirty },
    reset: resetEmail,
  } = emailForm;

  const emailEnabled = useWatch({ control: emailControl, name: "enabled" });
  const reply_to = useWatch({ control: emailControl, name: "reply_to" });
  const from_name = useWatch({ control: emailControl, name: "from_name" });
  const subject_template = useWatch({
    control: emailControl,
    name: "subject_template",
  });
  const body_html_template = useWatch({
    control: emailControl,
    name: "body_html_template",
  });

  const onEmailSubmit = async (data: EmailFormValues) => {
    const req = PrivateEditorApi.Settings.updateNotificationRespondentEmail({
      form_id: form.form_id,
      enabled: data.enabled,
      from_name: data.from_name,
      subject_template: data.subject_template,
      body_html_template: data.body_html_template,
      reply_to: data.reply_to,
    }).then(() => {
      dispatch({
        type: "editor/form/notification_respondent_email/preferences",
        enabled: data.enabled,
        from_name: data.from_name,
        subject_template: data.subject_template,
        body_html_template: data.body_html_template,
        reply_to: data.reply_to,
      });
    });

    try {
      await toast.promise(req, {
        loading: "Saving...",
        success: "Saved",
        error: "Failed",
      });
      resetEmail(data);
    } catch {
      // toast.promise handles UI
    }
  };

  const emailInputDisabled = !emailEnabled || !isCiamEnabled;

  return (
    <div className="container mx-auto max-w-7xl">
        <header className="py-10">
          <h1 className="text-2xl font-black">
            Channels
            <Badge className="ms-2 align-middle">Pro</Badge>
          </h1>
          <p className="text-muted-foreground mt-1">
            Connect with your customers through SMS and Email.
          </p>
        </header>

        <div className="space-y-0 pb-20">
          {/* Email notifications */}
          <ControlsPreviewLayout
            controls={
              <FieldSet className="space-y-4">
                <Field
                  orientation="horizontal"
                  className="flex-row items-center justify-between gap-4"
                >
                  <FieldLegend variant="legend">
                    Respondent Email Notifications
                    <Badge className="ms-2 align-middle">Pro</Badge>
                  </FieldLegend>
                  <Controller
                    name="enabled"
                    control={emailControl}
                    render={({ field }) => (
                      <Switch
                        id="notification-respondent-email-enabled"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!isCiamEnabled}
                      />
                    )}
                  />
                </Field>
                <FieldDescription>
                  Send a confirmation email after a successful submission (CIAM
                  / verified email only).
                </FieldDescription>
                {emailEnabled ? (
                  <form
                    id="notification-respondent-email"
                    onSubmit={handleEmailSubmit(onEmailSubmit)}
                    className="space-y-4"
                  >
                    <EmailTemplateAuthoringKit
                      notice={
                        !isCiamEnabled ? (
                          <FieldDescription>
                            This notification requires CIAM email verification.
                            Add a <code>challenge_email</code> field to enable
                            verified respondent email sending.
                          </FieldDescription>
                        ) : null
                      }
                      helper={
                        <FieldDescription>
                          Supported variables: <code>{`{{form_title}}`}</code>,{" "}
                          <code>{`{{response.idx}}`}</code>,{" "}
                          <code>{`{{fields.<field_name>}}`}</code>.
                        </FieldDescription>
                      }
                      fields={{
                        to: {
                          state: "disabled",
                          value: "Respondent (verified email)",
                        },
                        replyTo: {
                          state: "on",
                          value: reply_to ?? "",
                          disabled: emailInputDisabled,
                          placeholder: "support@yourdomain.com",
                          onValueChange: (v: string) =>
                            setEmailValue("reply_to", v || null, {
                              shouldDirty: true,
                            }),
                        },
                        subject: {
                          state: "on",
                          value: subject_template ?? "",
                          disabled: emailInputDisabled,
                          placeholder: "Thanks, {{fields.first_name}}",
                          onValueChange: (v: string) =>
                            setEmailValue("subject_template", v || null, {
                              shouldDirty: true,
                            }),
                        },
                        fromName: {
                          state: "on",
                          value: from_name ?? "",
                          disabled: emailInputDisabled,
                          placeholder: "Grida Forms",
                          onValueChange: (v: string) =>
                            setEmailValue("from_name", v || null, {
                              shouldDirty: true,
                            }),
                        },
                        from: {
                          state: "disabled",
                          value: `${from_name?.trim() || "Grida Forms"} <no-reply@accounts.grida.co>`,
                        },
                        bodyHtml: {
                          state: "on",
                          value: body_html_template ?? "",
                          disabled: emailInputDisabled,
                          placeholder:
                            "<h1>Thanks</h1>\n<p>We received your submission for {{form_title}}.</p>",
                          onValueChange: (v: string) =>
                            setEmailValue("body_html_template", v || null, {
                              shouldDirty: true,
                            }),
                        },
                      }}
                    />
                    <Button
                      form="notification-respondent-email"
                      type="submit"
                      disabled={
                        emailSubmitting || !emailDirty || !isCiamEnabled
                      }
                    >
                      {emailSubmitting ? <Spinner /> : "Save"}
                    </Button>
                  </form>
                ) : (
                  <FieldGroup className="space-y-4">
                    <FieldDescription>
                      Enable the toggle above to customize the respondent email
                      notification.
                    </FieldDescription>
                    <Button
                      disabled={
                        emailSubmitting || !emailDirty || !isCiamEnabled
                      }
                      onClick={handleEmailSubmit(onEmailSubmit)}
                    >
                      {emailSubmitting ? <Spinner /> : "Save"}
                    </Button>
                  </FieldGroup>
                )}
              </FieldSet>
            }
            preview={
              <div className="w-full aspect-video overflow-hidden rounded-lg border bg-background">
                <EmailFrame className="h-full flex flex-col">
                  <EmailFrameSubject>
                    {subject_template?.trim() ||
                      "Your submission has been received"}
                  </EmailFrameSubject>
                  <EmailFrameSender
                    name={from_name?.trim() || "Grida Forms"}
                    email="no-reply@accounts.grida.co"
                    date="Just now"
                  />
                  <EmailFrameBody className="prose prose-stone dark:prose-invert max-w-none">
                    {body_html_template?.trim() ? (
                      <div
                        dangerouslySetInnerHTML={{
                          __html: body_html_template,
                        }}
                      />
                    ) : (
                      <>
                        <p>Thanks for your submission.</p>
                        <p>
                          Tip: add a body HTML template below to preview the
                          email content here.
                        </p>
                      </>
                    )}
                  </EmailFrameBody>
                </EmailFrame>
              </div>
            }
          />

          <Separator />

          {/* SMS notifications */}
          <ControlsPreviewLayout
            controls={
              <FieldSet className="space-y-4 pointer-events-none opacity-60">
                <FieldLegend variant="legend">
                  <MessageCircleIcon className="inline me-2 size-5 align-middle" />
                  SMS Notifications
                  <Badge variant="outline" className="ms-2 align-middle">
                    Coming soon
                  </Badge>
                </FieldLegend>
                <FieldDescription>
                  SMS notifications are not ready yet. This section is currently
                  disabled.
                </FieldDescription>
                <Field>
                  <FieldLabel htmlFor="originator">Originator</FieldLabel>
                  <Select name="originator" defaultValue="default">
                    <SelectTrigger id="originator">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">
                        {SMS_DEFAULT_ORIGINATOR} (default)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="space-y-4">
                  <AboutSMSFees />
                  <TestSMS form_id={form.form_id} />
                </div>
              </FieldSet>
            }
            preview={
              <div className="pointer-events-none opacity-60 flex justify-center">
                <div className="w-full max-w-xs aspect-[9/16] rounded-3xl border-4 overflow-hidden">
                  <MessageAppFrame
                    hideInput
                    sender={{
                      name: "Grida Forms",
                      avatar: "GR",
                      phone: SMS_DEFAULT_ORIGINATOR,
                    }}
                    messages={[
                      {
                        message: "Event is opening soon. Register now!",
                        role: "incoming",
                      },
                      {
                        message: "Your submission has been received.",
                        role: "incoming",
                      },
                    ]}
                  />
                </div>
              </div>
            }
          />

          <Separator />

          {/* WhatsApp */}
          <ControlsPreviewLayout
            controls={
              <FieldSet className="space-y-2">
                <FieldLegend variant="legend">
                  <WhatsAppLogo className="inline me-2 size-5 align-middle" />
                  WhatsApp
                  <Badge variant="outline" className="ms-2 align-middle">
                    Add-on
                  </Badge>
                </FieldLegend>
                <FieldDescription>
                  Contact us to enable WhatsApp for your project.
                </FieldDescription>
              </FieldSet>
            }
          />

          <Separator />

          {/* Kakao Talk */}
          <ControlsPreviewLayout
            controls={
              <FieldSet className="space-y-2">
                <FieldLegend variant="legend">
                  <KakaoTalkLogo className="inline me-2 size-5 align-middle" />
                  Kakao Talk
                  <Badge variant="outline" className="ms-2 align-middle">
                    Enterprise
                  </Badge>
                </FieldLegend>
                <FieldDescription>
                  Contact us to enable Kakao Talk for your enterprise account.
                </FieldDescription>
              </FieldSet>
            }
          />
        </div>
      </div>
  );
}

function TestSMS({ form_id }: { form_id: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");

  const onSend = () => {
    setBusy(true);
    const sending = fetch(
      `/private/editor/connect/${form_id}/channels/sms/test`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: phone,
          message: message,
        }),
      }
    );

    toast.promise(sending, {
      loading: "Sending SMS...",
      success: "SMS sent successfully",
      error: "Failed to send SMS",
    });

    sending.finally(() => setBusy(false));
  };

  return (
    <Dialog>
      <DialogTrigger>
        <Badge variant={"outline"}>
          <LightningBoltIcon className="size-3" />
          Test
        </Badge>
      </DialogTrigger>
      <DialogContent className="!max-w-screen-lg">
        <DialogHeader>
          <DialogTitle>Test SMS Notifications</DialogTitle>
          <DialogDescription>
            Send a test SMS to your phone to verify the message format.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-4">
          <aside className="col-span-1 grid gap-4">
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="originator">Originator</FieldLabel>
                <Input
                  id="originator"
                  type="tel"
                  value={SMS_DEFAULT_ORIGINATOR}
                  readOnly
                  disabled
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">Phone Number</FieldLabel>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Enter your phone number"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="message">Message</FieldLabel>
                <Textarea
                  id="message"
                  placeholder="Enter your message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                />
              </Field>
            </FieldGroup>
          </aside>
          <aside className="col-span-2 shadow-lg rounded-lg border-2 overflow-hidden">
            <MessageAppFrame
              hideInput
              sender={{
                name: "Grida Forms",
                avatar: "GR",
                phone: SMS_DEFAULT_ORIGINATOR,
              }}
              messages={[
                {
                  message: (
                    <>
                      {message.split("\n").map((line, index) => (
                        <React.Fragment key={index}>
                          {line}
                          <br />
                        </React.Fragment>
                      ))}
                    </>
                  ),
                  role: "incoming",
                },
              ]}
            />
          </aside>
        </div>
        <DialogFooter>
          <Button disabled={busy} onClick={onSend}>
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AboutSMSFees() {
  return (
    <Collapsible>
      <CollapsibleTrigger>
        <Badge variant={"outline"}>
          <QuestionMarkCircledIcon />
          Learn more about SMS Fees
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <article className="my-4 prose dark:prose-invert">
          <strong>For Pro Users,</strong> please refer to our{" "}
          <Link href="/pricing" target="_blank">
            standard pricing
          </Link>
          <br />
          <br />
          <strong>For Enterprise Users</strong>
          <h6>Large-scale SMS messaging for enterprise customers</h6>
          <p>
            For enterprise customers, we offer dedicated pricing for SMS,{" "}
            <Link href="https://bird.com/" target="_blank">
              by <BirdLogo size={20} className="inline" />.
            </Link>
            <br />
            <i>We take 0 margin on the SMS fees,</i> and you pay exactly what
            you would pay to the carrier.
          </p>
        </article>
        <Table>
          <TableHeader>
            <TableRow>
              {[
                "Unit",
                "Destination Country",
                "Originator Type",
                "Unit price",
              ].map((th) => (
                <TableHead key={th}>{th}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {bird_sms_fees.map(([a, b, c, d], i) => (
              <TableRow key={i}>
                <TableCell>
                  <small>{a}</small>
                </TableCell>
                <TableCell>{b}</TableCell>
                <TableCell>{c}</TableCell>
                <TableCell>{d}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CollapsibleContent>
    </Collapsible>
  );
}
