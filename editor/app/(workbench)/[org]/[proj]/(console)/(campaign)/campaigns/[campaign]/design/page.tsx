"use client";

import React, { useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { usePropsEditor } from "@/scaffolds/props-editor";
import { CMSImageField, CMSRichText } from "@/components/formfield-cms";
import { Button } from "@/components/ui-editor/button";
import { Spinner } from "@/components/ui/spinner";
import { useProject } from "@/scaffolds/workspace";
import { useCampaign } from "../store";
import { Platform } from "@/lib/platform";
import { documentpreviewlink } from "@/lib/internal/url";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TemplateData } from "@/theme/templates/west-referral/templates";
import { OpenInNewWindowIcon } from "@radix-ui/react-icons";
import { Label } from "@/components/ui/label";
import {
  useWWWLayout,
  useWWWTemplate,
  WWWLayoutProvider,
  type WWWTemplateEditorInstance,
} from "@/scaffolds/platform/www";
import assert from "assert";
import { NavbarLogoEditor } from "@/scaffolds/www-theme-config/components/navbar-logo";
import { toast } from "sonner";
import { CampaignTemplateDuo001Viewer } from "./template-duo-001-viewer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";

export default function CampaignLayoutDesignerPage() {
  const { layout_id } = useCampaign();

  if (!layout_id) {
    return <div>This campaign does not have a layout.</div>;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <WWWLayoutProvider id={layout_id}>
        <TemplateEditorRoot />
      </WWWLayoutProvider>
    </div>
  );
}

function TemplateEditorRoot() {
  const { template_id } = useWWWLayout();
  const template =
    useWWWTemplate<TemplateData.West_Referrral__Duo_001>(template_id);

  if (template.loading || !template.data) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return <TemplateEditor template={template} />;
}

type EditorTab =
  | "referrer"
  | "referrer-share"
  | "referrer-share-message"
  | "invitation-ux-overlay"
  | "invitation"
  | "theme";
type CanvasComponent =
  | "referrer"
  | "referrer-share"
  | "referrer-share-message"
  | "invitation-ux-overlay"
  | "invitation";

function getCanvasFocus(tab: EditorTab): { node: CanvasComponent } | null {
  switch (tab) {
    case "referrer":
      return { node: "referrer" };
    case "referrer-share":
      return { node: "referrer-share" };
    case "referrer-share-message":
      return { node: "referrer-share-message" };
    case "invitation-ux-overlay":
      return {
        node: "invitation-ux-overlay",
      };
    case "invitation":
      return {
        node: "invitation",
      };
    default:
      return null;
  }
}

function TemplateEditor({
  template,
}: {
  template: WWWTemplateEditorInstance<any>;
}) {
  assert(template.data, "data should be warmed");

  const [tab, setTab] = React.useState<EditorTab>("referrer");
  const focus = useMemo(() => getCanvasFocus(tab), [tab]);

  const project = useProject();
  const campaign = useCampaign();

  const previewbaseurl = documentpreviewlink({
    docid: campaign.id,
    org: project.organization_id,
    proj: project.id,
  });

  const props = usePropsEditor<TemplateData.West_Referrral__Duo_001>({
    initialProps: template.data,
    onChange: template.set,
  });

  const values = props.mergedDefaultProps as unknown as
    | TemplateData.West_Referrral__Duo_001
    | undefined;

  useUnsavedChangesWarning(() => template.dirty);

  return (
    <div className="h-full flex flex-col">
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as EditorTab)}
        className="h-full flex flex-col overflow-hidden"
      >
        <header className="flex-none flex justify-between items-center p-4 border-b">
          <TabsList>
            <TabsTrigger value="referrer">Referrer</TabsTrigger>
            <TabsTrigger value="referrer-share">Before Share</TabsTrigger>
            <TabsTrigger value="referrer-share-message">
              Share Message
            </TabsTrigger>
            <TabsTrigger value="invitation-ux-overlay">
              Invitation Card
            </TabsTrigger>
            <TabsTrigger value="invitation">Invitation</TabsTrigger>
            <TabsTrigger value="theme">Theme</TabsTrigger>
          </TabsList>
          <Button
            variant="default"
            onClick={() => {
              toast.promise(template.save(), {
                loading: "Saving...",
                success: "Saved",
                error: "Error saving",
              });
            }}
            disabled={!template.dirty || template.saving}
          >
            {template.saving ? "Saving..." : "Save & Publish Changes"}
          </Button>
        </header>
        <div className="flex-1 h-full flex gap-4 p-4 overflow-hidden">
          {focus && (
            <aside className="flex-[2] overflow-hidden">
              <CampaignTemplateDuo001Viewer
                focus={focus}
                props={props}
                campaign={{
                  id: "",
                  enabled: true,
                  title: "",
                  description: null,
                  reward_currency: "",
                  max_invitations_per_referrer: null,
                  layout_id: null,
                  scheduling_close_at: null,
                  scheduling_open_at: null,
                  scheduling_tz: null,
                  public: undefined,
                  www_name: null,
                  www_route_path: null,
                }}
                locale={values?.locale ?? "en"}
              />
            </aside>
          )}
          <aside className="flex-1 flex flex-col w-full">
            <Card className="flex flex-1 overflow-scroll flex-col">
              <TabsContent value="referrer" className="m-0">
                <CardHeader>
                  <CardTitle className="flex justify-between items-center">
                    <span>Referrer</span>
                    <span>
                      <Link
                        href={`${previewbaseurl}/t/${Platform.WEST.Referral.TEST_CODE_REFERRER}`}
                        target="_blank"
                      >
                        <Button size="xs" variant="outline">
                          <OpenInNewWindowIcon />
                          Preview Referrer
                        </Button>
                      </Link>
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="flex flex-col gap-8">
                    <div className="grid gap-2">
                      <Label>Image</Label>
                      <CMSImageField
                        uploader={template.upload}
                        value={
                          values?.components?.referrer?.image?.src
                            ? {
                                publicUrl:
                                  values.components.referrer?.image?.src,
                              }
                            : undefined
                        }
                        onValueChange={(r) => {
                          props.set("components.referrer.image", {
                            type: "image",
                            src: r?.publicUrl,
                          });
                        }}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Title</Label>
                      <Input
                        value={values?.components?.referrer?.title}
                        onChange={(e) => {
                          props.set(
                            "components.referrer.title",
                            e.target.value
                          );
                        }}
                        placeholder="Enter your title"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Description</Label>
                      <Textarea
                        value={values?.components?.referrer?.description}
                        onChange={(e) => {
                          props.set(
                            "components.referrer.description",
                            e.target.value
                          );
                        }}
                        placeholder="Enter your description"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Button Text</Label>
                      <Input
                        value={values?.components?.referrer?.cta}
                        onChange={(e) => {
                          props.set("components.referrer.cta", e.target.value);
                        }}
                        placeholder="Button Text"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Article</Label>
                      <CMSRichText
                        value={
                          values?.components?.referrer?.article?.html ?? ""
                        }
                        uploader={template.upload}
                        onValueChange={(value) => {
                          props.set("components.referrer.article", {
                            type: "richtext",
                            html: value,
                          });
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </TabsContent>
              <TabsContent value="referrer-share" className="m-0">
                <CardHeader>
                  <CardTitle>Referrer Share</CardTitle>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="flex flex-col gap-8">
                    <div className="grid gap-2">
                      <Label>Article</Label>
                      <CMSRichText
                        value={
                          values?.components?.["referrer-share"]?.article
                            ?.html ?? ""
                        }
                        uploader={template.upload}
                        onValueChange={(value) => {
                          props.set("components.referrer-share.article", {
                            type: "richtext",
                            html: value,
                          });
                        }}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Consent</Label>
                      <Textarea
                        value={
                          values?.components?.["referrer-share"]?.consent ?? ""
                        }
                        onChange={(e) => {
                          props.set(
                            "components.referrer-share.consent",
                            e.target.value
                          );
                        }}
                        placeholder="Enter your consent"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Button Text</Label>
                      <Input
                        value={values?.components?.referrer?.cta}
                        onChange={(e) => {
                          props.set(
                            "components.referrer-share.cta",
                            e.target.value
                          );
                        }}
                        placeholder="Button Text"
                      />
                    </div>
                  </div>
                </CardContent>
              </TabsContent>
              <TabsContent value="referrer-share-message" className="m-0">
                <CardHeader>
                  <CardTitle>Referrer Share Message</CardTitle>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="flex flex-col gap-8">
                    <div className="grid gap-2">
                      <Label>Message</Label>
                      <Textarea
                        placeholder="Enter your message"
                        value={
                          values?.components?.["referrer-share-message"]
                            ?.message ?? ""
                        }
                        onChange={(e) => {
                          props.set(
                            "components.referrer-share-message.message",
                            e.target.value
                          );
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </TabsContent>
              <TabsContent value="invitation-ux-overlay" className="m-0">
                <CardHeader>
                  <CardTitle className="flex justify-between items-center">
                    <span>Invitation Ticket</span>
                    <span>
                      <Link
                        href={`${previewbaseurl}/t/${Platform.WEST.Referral.TEST_CODE_INVITATION}`}
                        target="_blank"
                      >
                        <Button size="xs" variant="outline">
                          <OpenInNewWindowIcon />
                          Preview Invitation
                        </Button>
                      </Link>
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto">
                  <div className="flex flex-col gap-8">
                    <div className="grid gap-2">
                      <Label>Ticket Image</Label>
                      <CMSImageField
                        uploader={template.upload}
                        value={
                          values?.components?.["invitation-ux-overlay"]?.image
                            ?.src
                            ? {
                                publicUrl:
                                  values.components["invitation-ux-overlay"]
                                    ?.image?.src,
                              }
                            : undefined
                        }
                        onValueChange={(r) => {
                          props.set("components.invitation-ux-overlay.image", {
                            type: "image",
                            src: r?.publicUrl,
                          });
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </TabsContent>
              <TabsContent value="invitation" className="m-0">
                <CardHeader>
                  <CardTitle className="flex justify-between items-center">
                    <span>Invitation</span>
                    <span>
                      <Link
                        href={`${previewbaseurl}/t/${Platform.WEST.Referral.TEST_CODE_INVITATION}`}
                        target="_blank"
                      >
                        <Button size="xs" variant="outline">
                          <OpenInNewWindowIcon />
                          Preview Invitation
                        </Button>
                      </Link>
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto">
                  <div className="flex flex-col gap-8">
                    <div className="grid gap-2">
                      <Label>Image</Label>
                      <CMSImageField
                        uploader={template.upload}
                        value={
                          values?.components?.invitation?.image?.src
                            ? {
                                publicUrl:
                                  values.components.invitation?.image?.src,
                              }
                            : undefined
                        }
                        onValueChange={(r) => {
                          props.set("components.invitation.image", {
                            type: "image",
                            src: r?.publicUrl,
                          });
                        }}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Title</Label>

                      <Input
                        value={values?.components?.invitation?.title}
                        onChange={(e) => {
                          props.set(
                            "components.invitation.title",
                            e.target.value
                          );
                        }}
                        placeholder="Enter your title"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Description</Label>
                      <Textarea
                        value={
                          values?.components?.invitation?.description as string
                        }
                        onChange={(e) => {
                          props.set(
                            "components.invitation.description",
                            e.target.value
                          );
                        }}
                        placeholder="Enter your description"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Button Text</Label>
                      <Input
                        value={values?.components?.invitation?.cta as string}
                        onChange={(e) => {
                          props.set(
                            "components.invitation.cta",
                            e.target.value
                          );
                        }}
                        placeholder="Button Text"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Article</Label>
                      <CMSRichText
                        value={
                          values?.components?.invitation?.article?.html ?? ""
                        }
                        uploader={template.upload}
                        onValueChange={(value) => {
                          props.set("components.invitation.article", {
                            type: "richtext",
                            html: value,
                          });
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </TabsContent>
              <TabsContent value="theme" className="m-0">
                <CardHeader>
                  <CardTitle>Theme</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto">
                  <div className="grid gap-2">
                    <NavbarLogoEditor
                      logo={values?.theme?.navbar?.logo}
                      uploader={template.upload}
                      onLogoChange={(file, type) => {
                        if (type === "src")
                          props.set("theme.navbar.logo.src", file.publicUrl);
                        if (type === "srcDark")
                          props.set(
                            "theme.navbar.logo.srcDark",
                            file.publicUrl
                          );
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Locale</Label>
                    <Select
                      value={values?.locale}
                      onValueChange={(v) => {
                        props.set("locale", v);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Locale" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ko">Korean</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="mt-10">
                    You can{" "}
                    <Link
                      href={`/${project.organization_name}/${project.name}/www`}
                      target="_blank"
                      className="underline"
                    >
                      manage site settings here
                    </Link>
                  </div>
                </CardContent>
              </TabsContent>
            </Card>
          </aside>
        </div>
      </Tabs>
    </div>
  );
}
