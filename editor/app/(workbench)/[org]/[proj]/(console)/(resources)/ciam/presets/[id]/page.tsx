"use client";

import { useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { createBrowserCIAMClient } from "@/lib/supabase/client";
import { useProject } from "@/scaffolds/workspace";
import { useForm, useWatch, Controller } from "react-hook-form";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
  PreferenceDescription,
} from "@/components/preferences";
import { EmailTemplateAuthoringKit } from "@/kits/email-template-authoring";
import MailAppFrame from "@/components/frames/mail-app-frame";
import {
  DeleteConfirmationAlertDialog,
  DeleteConfirmationSnippet,
} from "@/components/dialogs/delete-confirmation-dialog";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { ArrowLeftIcon, ExternalLink, StarIcon } from "lucide-react";
import Link from "next/link";
import { previewlink } from "@/lib/internal/url";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import type {
  Database,
  PortalPresetVerificationEmailTemplate,
  PortalPresetLoginPage,
} from "@app/database";

type PortalPresetRow =
  Database["grida_ciam_public"]["Views"]["portal_preset"]["Row"];

type EmailFormValues = {
  enabled: boolean;
  from_name: string | null;
  subject_template: string | null;
  body_html_template: string | null;
  reply_to: string | null;
};

type LoginPageFormValues = {
  email_step_title: string;
  email_step_description: string;
  email_step_button_label: string;
  otp_step_title: string;
  otp_step_description: string;
};

export default function PortalPresetEditPage() {
  const params = useParams<{ id: string; org: string; proj: string }>();
  const router = useRouter();
  const project = useProject();
  const client = useMemo(() => createBrowserCIAMClient(), []);

  const key = `portal-preset-${params.id}`;

  const { data: preset, isLoading, mutate } = useSWR<PortalPresetRow>(
    key,
    async () => {
      const { data, error } = await client
        .from("portal_preset")
        .select("*")
        .eq("id", params.id)
        .eq("project_id", project.id)
        .single();

      if (error) throw error;
      return data;
    }
  );

  // --- Name form (isolated) ---
  const nameForm = useForm<{ name: string }>({
    values: preset ? { name: preset.name ?? "" } : undefined,
  });

  const onNameSubmit = async (data: { name: string }) => {
    const req = Promise.resolve(
      client.from("portal_preset").update({ name: data.name }).eq("id", params.id)
    ).then(({ error }) => {
      if (error) throw error;
    });

    try {
      await toast.promise(req, {
        loading: "Saving...",
        success: "Name saved",
        error: "Failed to save name",
      });
      mutate();
      nameForm.reset(data);
    } catch {
      // toast handles UI
    }
  };

  // --- Email template form (isolated) ---
  const emailForm = useForm<EmailFormValues>({
    values: preset
      ? {
          enabled: preset.verification_email_template?.enabled ?? false,
          from_name: preset.verification_email_template?.from_name ?? null,
          subject_template: preset.verification_email_template?.subject_template ?? null,
          body_html_template: preset.verification_email_template?.body_html_template ?? null,
          reply_to: preset.verification_email_template?.reply_to ?? null,
        }
      : undefined,
  });

  const {
    handleSubmit,
    control,
    setValue,
    formState: { isSubmitting, isDirty },
    reset,
  } = emailForm;

  const enabled = useWatch({ control, name: "enabled" });
  const reply_to = useWatch({ control, name: "reply_to" });
  const from_name = useWatch({ control, name: "from_name" });
  const subject_template = useWatch({ control, name: "subject_template" });
  const body_html_template = useWatch({ control, name: "body_html_template" });

  // --- Login page form (isolated) ---
  const loginPageForm = useForm<LoginPageFormValues>({
    values: preset
      ? {
          email_step_title: preset.portal_login_page?.email_step_title ?? "",
          email_step_description: preset.portal_login_page?.email_step_description ?? "",
          email_step_button_label: preset.portal_login_page?.email_step_button_label ?? "",
          otp_step_title: preset.portal_login_page?.otp_step_title ?? "",
          otp_step_description: preset.portal_login_page?.otp_step_description ?? "",
        }
      : undefined,
  });

  const onLoginPageSubmit = async (data: LoginPageFormValues) => {
    const loginPage: PortalPresetLoginPage = {
      template_id: "202602-default",
      email_step_title: data.email_step_title || null,
      email_step_description: data.email_step_description || null,
      email_step_button_label: data.email_step_button_label || null,
      otp_step_title: data.otp_step_title || null,
      otp_step_description: data.otp_step_description || null,
    };

    const req = Promise.resolve(
      client
        .from("portal_preset")
        .update({ portal_login_page: loginPage as any })
        .eq("id", params.id)
    ).then(({ error }) => {
      if (error) throw error;
    });

    try {
      await toast.promise(req, {
        loading: "Saving...",
        success: "Login page saved",
        error: "Failed to save",
      });
      mutate();
      loginPageForm.reset(data);
    } catch {
      // toast handles UI
    }
  };

  const onSubmit = async (data: EmailFormValues) => {
    const template: PortalPresetVerificationEmailTemplate = {
      enabled: data.enabled,
      from_name: data.from_name,
      subject_template: data.subject_template,
      body_html_template: data.body_html_template,
      reply_to: data.reply_to,
    };

    const req = Promise.resolve(
      client
        .from("portal_preset")
        .update({ verification_email_template: template as any })
        .eq("id", params.id)
    ).then(({ error }) => {
      if (error) throw error;
    });

    try {
      await toast.promise(req, {
        loading: "Saving...",
        success: "Saved",
        error: "Failed to save",
      });
      mutate();
      reset(data);
    } catch {
      // toast handles UI
    }
  };

  const handleSetPrimary = useCallback(async () => {
    const req = Promise.resolve(
      client.rpc("set_primary_portal_preset", {
        p_project_id: project.id,
        p_preset_id: params.id,
      })
    ).then(({ error }) => {
      if (error) throw error;
    });

    await toast.promise(req, {
      loading: "Setting primary...",
      success: "This preset is now primary",
      error: "Failed to set primary",
    });
    mutate();
  }, [client, project.id, params.id, mutate]);

  const deleteDialog = useDialogState<{ id: string; match: string }>(
    "delete-preset",
    { refreshkey: true }
  );

  const handleDelete = useCallback(
    async (data: { id: string }) => {
      const { error } = await client
        .from("portal_preset")
        .delete()
        .eq("id", data.id);
      if (error) {
        toast.error("Failed to delete preset");
        return false;
      }
      toast.success("Preset deleted");
      router.push(`/${params.org}/${params.proj}/ciam/presets`);
      return true;
    },
    [client, params, router]
  );

  const basePath = `/${params.org}/${params.proj}/ciam/presets`;

  if (isLoading || !preset) {
    return (
      <main className="w-full h-full overflow-y-auto">
        <div className="container mx-auto max-w-screen-md py-10 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </main>
    );
  }

  return (
    <main className="w-full h-full overflow-y-auto">
      <div className="container mx-auto max-w-screen-md">
        <header className="py-10 space-y-4">
          <Link
            href={basePath}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3" />
            Back to Customer Portal
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black">{preset.name}</h1>
              {preset.is_primary && (
                <Badge variant="secondary" className="mt-1">
                  <StarIcon className="size-3" />
                  Primary
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!preset.is_primary && (
                <Button variant="outline" size="sm" onClick={handleSetPrimary}>
                  Set as Primary
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  deleteDialog.openDialog({
                    id: preset.id,
                    match: preset.name,
                  })
                }
              >
                Delete
              </Button>
            </div>
          </div>
        </header>

        <div className="space-y-8 pb-20">
          {/* Preset name */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preset Name</CardTitle>
            </CardHeader>
            <CardContent>
              <Controller
                name="name"
                control={nameForm.control}
                render={({ field }) => (
                  <FieldSet>
                    <FieldLegend variant="label">Name</FieldLegend>
                    <FieldGroup>
                      <Field className="max-w-sm">
                        <FieldLabel htmlFor="preset-name">Preset name</FieldLabel>
                        <Input
                          id="preset-name"
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Preset name"
                        />
                      </Field>
                    </FieldGroup>
                  </FieldSet>
                )}
              />
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button
                disabled={
                  nameForm.formState.isSubmitting ||
                  !nameForm.formState.isDirty
                }
                onClick={nameForm.handleSubmit(onNameSubmit)}
              >
                {nameForm.formState.isSubmitting ? <Spinner /> : "Save"}
              </Button>
            </CardFooter>
          </Card>

          {/* Login page overrides */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">Login Page</CardTitle>
                <Button variant="ghost" size="sm" asChild className="shrink-0">
                  <a
                    href={previewlink({
                      org: params.org,
                      proj: params.proj,
                      path: "/p/login",
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5"
                  >
                    <ExternalLink className="size-3" />
                    View
                  </a>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form
                id="portal-preset-login-page"
                onSubmit={loginPageForm.handleSubmit(onLoginPageSubmit)}
              >
                <FieldSet>
                  <FieldLegend>Login Page</FieldLegend>
                  <FieldDescription>
                    Override the default text shown on the customer portal login
                    page. Leave a field empty to use the default.
                  </FieldDescription>
                  <FieldGroup className="flex flex-col gap-6">
                    <FieldSet>
                      <FieldLegend>Email Step</FieldLegend>
                      <FieldGroup>
                        <Field>
                          <FieldLabel htmlFor="lp-email-title">Title</FieldLabel>
                          <Controller
                            name="email_step_title"
                            control={loginPageForm.control}
                            render={({ field }) => (
                              <Input
                                id="lp-email-title"
                                {...field}
                                value={field.value ?? ""}
                                placeholder="Log in to manage your account"
                              />
                            )}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="lp-email-desc">Description</FieldLabel>
                          <Controller
                            name="email_step_description"
                            control={loginPageForm.control}
                            render={({ field }) => (
                              <Input
                                id="lp-email-desc"
                                {...field}
                                value={field.value ?? ""}
                                placeholder="Enter your email and we will send you a verification code..."
                              />
                            )}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="lp-email-btn">Button Label</FieldLabel>
                          <Controller
                            name="email_step_button_label"
                            control={loginPageForm.control}
                            render={({ field }) => (
                              <Input
                                id="lp-email-btn"
                                {...field}
                                value={field.value ?? ""}
                                placeholder="Continue with Email"
                              />
                            )}
                          />
                        </Field>
                      </FieldGroup>
                    </FieldSet>
                    <FieldSet>
                      <FieldLegend>OTP Step</FieldLegend>
                      <FieldGroup>
                        <Field>
                          <FieldLabel htmlFor="lp-otp-title">Title</FieldLabel>
                          <Controller
                            name="otp_step_title"
                            control={loginPageForm.control}
                            render={({ field }) => (
                              <Input
                                id="lp-otp-title"
                                {...field}
                                value={field.value ?? ""}
                                placeholder="Verification"
                              />
                            )}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="lp-otp-desc">Description</FieldLabel>
                          <Controller
                            name="otp_step_description"
                            control={loginPageForm.control}
                            render={({ field }) => (
                              <Input
                                id="lp-otp-desc"
                                {...field}
                                value={field.value ?? ""}
                                placeholder="We have sent a code to your email. Enter it below."
                              />
                            )}
                          />
                        </Field>
                      </FieldGroup>
                    </FieldSet>
                  </FieldGroup>
                </FieldSet>
              </form>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button
                form="portal-preset-login-page"
                type="submit"
                disabled={
                  loginPageForm.formState.isSubmitting ||
                  !loginPageForm.formState.isDirty
                }
              >
                {loginPageForm.formState.isSubmitting ? <Spinner /> : "Save"}
              </Button>
            </CardFooter>
          </Card>

          {/* Email template */}
          <PreferenceBox>
            <PreferenceBoxHeader
              heading="Verification Email Template"
              description="Customize the OTP email sent to customers when they log into the customer portal."
              actions={
                <Controller
                  name="enabled"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              }
            />
            {enabled ? (
              <>
                <PreferenceBody>
                  <div className="h-96 overflow-hidden rounded-3xl border-4 mb-6">
                    <MailAppFrame
                      sidebarHidden
                      message={{
                        at: "Just now",
                        from: {
                          name: from_name?.trim() || "Portal",
                          email: "no-reply@accounts.grida.co",
                          avatar: "P",
                        },
                        title:
                          subject_template?.trim() ||
                          "Your verification code",
                      }}
                      messages={[
                        {
                          from: from_name?.trim() || "Portal",
                          title:
                            subject_template?.trim() ||
                            "Your verification code",
                          at: "Just now",
                        },
                      ]}
                    >
                      {body_html_template?.trim() ? (
                        <div
                          dangerouslySetInnerHTML={{
                            __html: body_html_template,
                          }}
                        />
                      ) : (
                        <>
                          <p>Your verification code is: <strong>123456</strong></p>
                          <p className="text-muted-foreground text-sm mt-2">
                            Tip: add a body HTML template below to preview the
                            email content here.
                          </p>
                        </>
                      )}
                    </MailAppFrame>
                  </div>
                  <form
                    id="portal-preset-email-template"
                    onSubmit={handleSubmit(onSubmit)}
                  >
                    <EmailTemplateAuthoringKit
                      helper={
                        <PreferenceDescription>
                          Supported variables:{" "}
                          <code>{"{{email_otp}}"}</code>,{" "}
                          <code>{"{{brand_name}}"}</code>,{" "}
                          <code>{"{{customer_name}}"}</code>,{" "}
                          <code>{"{{expires_in_minutes}}"}</code>,{" "}
                          <code>{"{{brand_support_url}}"}</code>,{" "}
                          <code>{"{{brand_support_contact}}"}</code>.
                        </PreferenceDescription>
                      }
                      fields={{
                        to: {
                          state: "disabled",
                          value: "Customer (verified email)",
                        },
                        replyTo: {
                          state: "on",
                          value: reply_to ?? "",
                          placeholder: "support@yourdomain.com",
                          onValueChange: (v: string) =>
                            setValue("reply_to", v || null, {
                              shouldDirty: true,
                            }),
                        },
                        subject: {
                          state: "on",
                          value: subject_template ?? "",
                          placeholder:
                            "{{email_otp}} - {{brand_name}} verification code",
                          onValueChange: (v: string) =>
                            setValue("subject_template", v || null, {
                              shouldDirty: true,
                            }),
                        },
                        fromName: {
                          state: "on",
                          value: from_name ?? "",
                          placeholder: "{{brand_name}}",
                          onValueChange: (v: string) =>
                            setValue("from_name", v || null, {
                              shouldDirty: true,
                            }),
                        },
                        from: {
                          state: "disabled",
                          value: `${from_name?.trim() || "Portal"} <no-reply@accounts.grida.co>`,
                        },
                        bodyHtml: {
                          state: "on",
                          value: body_html_template ?? "",
                          placeholder:
                            "<h1>Your verification code</h1>\n<p>Hi {{customer_name}}, your code is <strong>{{email_otp}}</strong>.</p>\n<p>This code expires in {{expires_in_minutes}} minutes.</p>",
                          onValueChange: (v: string) =>
                            setValue("body_html_template", v || null, {
                              shouldDirty: true,
                            }),
                        },
                      }}
                    />
                  </form>
                </PreferenceBody>
              </>
            ) : (
              <PreferenceBody>
                <PreferenceDescription>
                  Enable the toggle above to customize the verification email.
                  When disabled, the default Grida verification email is used.
                </PreferenceDescription>
              </PreferenceBody>
            )}
            <PreferenceBoxFooter>
              <Button
                disabled={isSubmitting || !isDirty}
                onClick={handleSubmit(onSubmit)}
              >
                {isSubmitting ? <Spinner /> : "Save"}
              </Button>
            </PreferenceBoxFooter>
          </PreferenceBox>
        </div>
      </div>
      <DeleteConfirmationAlertDialog
        key={deleteDialog.refreshkey}
        {...deleteDialog.props}
        title="Delete preset"
        description={
          <>
            This action cannot be undone. Type{" "}
            <DeleteConfirmationSnippet>
              {deleteDialog.data?.match}
            </DeleteConfirmationSnippet>{" "}
            to confirm.
          </>
        }
        match={deleteDialog.data?.match}
        onDelete={handleDelete}
      />
    </main>
  );
}
