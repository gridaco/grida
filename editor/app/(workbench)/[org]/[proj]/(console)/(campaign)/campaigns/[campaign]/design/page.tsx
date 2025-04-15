"use client";

import React, { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { usePropsEditor } from "@/scaffolds/props-editor";
import { CMSImageField, CMSRichText } from "@/components/formfield-cms";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/spinner";
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
import toast from "react-hot-toast";

export default function CampaignLayoutDesignerPage() {
  const { layout_id } = useCampaign();

  if (!layout_id) {
    return <div>This campaign does not have a layout.</div>;
  }

  return (
    <main className="w-full h-full flex relative bg-background">
      <div className="w-full my-10 container max-w-4xl mx-auto">
        <WWWLayoutProvider id={layout_id}>
          <TemplateEditorRoot />
        </WWWLayoutProvider>
      </div>
    </main>
  );
}

function TemplateEditorRoot() {
  const { template_id } = useWWWLayout();
  const template =
    useWWWTemplate<TemplateData.West_Referrral__Duo_001>(template_id);

  if (template.loading || !template.data) {
    return <Spinner />;
  }

  return <TemplateEditor template={template} />;
}

function TemplateEditor({
  template,
}: {
  template: WWWTemplateEditorInstance<any>;
}) {
  assert(template.data, "data should be warmed");

  const project = useProject();
  const campaign = useCampaign();

  const previewbaseurl = documentpreviewlink({
    docid: campaign.id,
    orgid: project.organization_id,
    projid: project.id,
  });

  const props = usePropsEditor<TemplateData.West_Referrral__Duo_001>({
    initialProps: template.data,
    onChange: template.set,
  });

  const values = props.mergedDefaultProps as unknown as
    | TemplateData.West_Referrral__Duo_001
    | undefined;

  return (
    <div className="w-full">
      <Tabs defaultValue="referrer">
        <header className="w-full flex justify-between items-center">
          <TabsList>
            <TabsTrigger value="referrer">Referrer</TabsTrigger>
            <TabsTrigger value="invitation-ux-overlay">
              Invitation Ticket
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
        <TabsContent value="referrer">
          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>Referrer</span>
                <span>
                  <Link
                    href={`${previewbaseurl}/t/${Platform.WEST.Referral.TEST_CODE_REFERRER}`}
                    target="_blank"
                  >
                    <Button size="xs" variant="outline">
                      <OpenInNewWindowIcon className="me-2" />
                      Preview Referrer
                    </Button>
                  </Link>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-8">
                <div className="grid gap-2">
                  <Label>Image</Label>
                  <CMSImageField
                    uploader={template.upload}
                    value={
                      values?.components?.referrer?.image?.src
                        ? { publicUrl: values.components.referrer?.image?.src }
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
                      props.set("components.referrer.title", e.target.value);
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
                    value={values?.components?.referrer?.article?.html ?? ""}
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
          </Card>
        </TabsContent>
        <TabsContent value="invitation-ux-overlay">
          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>Invitation Ticket</span>
                <span>
                  <Link
                    href={`${previewbaseurl}/t/${Platform.WEST.Referral.TEST_CODE_INVITATION}`}
                    target="_blank"
                  >
                    <Button size="xs" variant="outline">
                      <OpenInNewWindowIcon className="me-2" />
                      Preview Invitation
                    </Button>
                  </Link>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-8">
                <div className="grid gap-2">
                  <Label>Ticket Image</Label>
                  <CMSImageField
                    uploader={template.upload}
                    value={
                      values?.components?.["invitation-ux-overlay"]?.image?.src
                        ? {
                            publicUrl:
                              values.components["invitation-ux-overlay"]?.image
                                ?.src,
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
          </Card>
        </TabsContent>
        <TabsContent value="invitation">
          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>Invitation</span>
                <span>
                  <Link
                    href={`${previewbaseurl}/t/${Platform.WEST.Referral.TEST_CODE_INVITATION}`}
                    target="_blank"
                  >
                    <Button size="xs" variant="outline">
                      <OpenInNewWindowIcon className="me-2" />
                      Preview Invitation
                    </Button>
                  </Link>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-8">
                <div className="grid gap-2">
                  <Label>Image</Label>
                  <CMSImageField
                    uploader={template.upload}
                    value={
                      values?.components?.invitation?.image?.src
                        ? {
                            publicUrl: values.components.invitation?.image?.src,
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
                      props.set("components.invitation.title", e.target.value);
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
                      props.set("components.invitation.cta", e.target.value);
                    }}
                    placeholder="Button Text"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Article</Label>
                  <CMSRichText
                    value={values?.components?.invitation?.article?.html ?? ""}
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
          </Card>
        </TabsContent>
        <TabsContent value="theme">
          <Card>
            <CardHeader>
              <CardTitle>Theme</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                <NavbarLogoEditor
                  logo={values?.theme?.navbar?.logo}
                  uploader={template.upload}
                  onLogoChange={(file, type) => {
                    if (type === "src")
                      props.set("theme.navbar.logo.src", file.publicUrl);
                    if (type === "srcDark")
                      props.set("theme.navbar.logo.srcDark", file.publicUrl);
                  }}
                />
              </div>
              You can{" "}
              <Link
                href={`/${project.organization_name}/${project.name}/www`}
                className="underline"
              >
                manage site settings here
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
