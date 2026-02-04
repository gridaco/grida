"use client";

import React, { useMemo } from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
  PreferenceDescription,
} from "@/components/preferences";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { PrivateEditorApi } from "@/lib/private";
import { toast } from "sonner";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useEditorState } from "@/scaffolds/editor";
import { Badge } from "@/components/ui/badge";
import { EmailTemplateAuthoringKit } from "@/kits/email-template-authoring";
import MailAppFrame from "@/components/frames/mail-app-frame";

type FormValues = {
  enabled: boolean;
  from_name: string | null;
  subject_template: string | null;
  body_html_template: string | null;
  reply_to: string | null;
};

export function NotificationRespondentEmailPreferences() {
  const [state, dispatch] = useEditorState();
  const { form } = state;

  const isCiamEnabled = useMemo(() => {
    return form.fields.some((f) => f.type === "challenge_email");
  }, [form.fields]);

  const initial = form.notification_respondent_email;

  const {
    handleSubmit,
    control,
    setValue,
    formState: { isSubmitting, isDirty },
    reset,
  } = useForm<FormValues>({
    defaultValues: {
      enabled: initial.enabled,
      from_name: initial.from_name,
      subject_template: initial.subject_template,
      body_html_template: initial.body_html_template,
      reply_to: initial.reply_to,
    },
  });

  const enabled = useWatch({ control, name: "enabled" });
  const reply_to = useWatch({ control, name: "reply_to" });
  const from_name = useWatch({ control, name: "from_name" });
  const subject_template = useWatch({ control, name: "subject_template" });
  const body_html_template = useWatch({ control, name: "body_html_template" });

  const onSubmit = async (data: FormValues) => {
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
      reset(data);
    } catch (e) {
      // toast.promise handles UI
    }
  };

  const disabled = !enabled;
  const inputDisabled = disabled || !isCiamEnabled;

  return (
    <PreferenceBox>
      <PreferenceBoxHeader
        heading={
          <>
            Respondent email notifications
            <Badge className="ms-2 align-middle">Pro</Badge>
          </>
        }
        description={
          <>
            Send a confirmation email after a successful submission (CIAM /
            verified email only).
          </>
        }
        actions={
          <Controller
            name="enabled"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Switch
                  id="notification-respondent-email-enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={!isCiamEnabled}
                />
              </div>
            )}
          />
        }
      />
      <PreferenceBody>
        <div className="max-h-96 rounded-3xl border-4 mb-6">
          <MailAppFrame
            sidebarHidden
            message={{
              at: "Just now",
              from: {
                name: from_name?.trim() || "Grida Forms",
                email: "no-reply@accounts.grida.co",
                avatar: "GR",
              },
              title:
                subject_template?.trim() || "Your submission has been received",
            }}
            messages={[
              {
                from: "Grida Forms",
                title:
                  subject_template?.trim() ||
                  "Your submission has been received",
                at: "Just now",
              },
            ]}
          >
            {body_html_template?.trim() ? (
              <div
                // Admin-authored HTML preview. This is only rendered inside the editor.
                dangerouslySetInnerHTML={{
                  __html: body_html_template,
                }}
              />
            ) : (
              <>
                <p>Thanks for your submission.</p>
                <p>
                  Tip: add a body HTML template below to preview the email
                  content here.
                </p>
              </>
            )}
          </MailAppFrame>
        </div>
        <form
          id="notification-respondent-email"
          onSubmit={handleSubmit(onSubmit)}
        >
          <EmailTemplateAuthoringKit
            notice={
              !isCiamEnabled ? (
                <PreferenceDescription>
                  This notification requires CIAM email verification. Add a{" "}
                  <code>challenge_email</code> field to enable verified
                  respondent email sending.
                </PreferenceDescription>
              ) : null
            }
            helper={
              <PreferenceDescription>
                Supported variables: <code>{"{{form_title}}"}</code>,{" "}
                <code>{"{{response.idx}}"}</code>,{" "}
                <code>{"{{fields.<field_name>}}"}</code>.
              </PreferenceDescription>
            }
            fields={{
              to: { state: "disabled", value: "Respondent (verified email)" },
              replyTo: {
                state: "on",
                value: reply_to ?? "",
                disabled: inputDisabled,
                onValueChange: (v: string) =>
                  setValue("reply_to", v || null, {
                    shouldDirty: true,
                  }),
              },
              subject: {
                state: "on",
                value: subject_template ?? "",
                disabled: inputDisabled,
                onValueChange: (v: string) =>
                  setValue("subject_template", v || null, {
                    shouldDirty: true,
                  }),
              },
              fromName: {
                state: "on",
                value: from_name ?? "",
                disabled: inputDisabled,
                onValueChange: (v: string) =>
                  setValue("from_name", v || null, { shouldDirty: true }),
              },
              from: {
                state: "disabled",
                value: `${from_name?.trim() || "Grida Forms"} <no-reply@accounts.grida.co>`,
              },
              bodyHtml: {
                state: "on",
                value: body_html_template ?? "",
                disabled: inputDisabled,
                onValueChange: (v: string) =>
                  setValue("body_html_template", v || null, {
                    shouldDirty: true,
                  }),
              },
            }}
          />
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button
          form="notification-respondent-email"
          type="submit"
          disabled={isSubmitting || !isDirty || !isCiamEnabled}
        >
          {isSubmitting ? <Spinner /> : "Save"}
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
