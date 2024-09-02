"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
  PreferenceDescription,
} from "@/components/preferences";
import resources from "@/i18n";
import { TemplateEditor, useMockedContext } from "@/scaffolds/template-editor";
import { Component as FormCompleteDefault } from "@/theme/templates/formcomplete/default";
import { Component as FormCompleteReceipt01 } from "@/theme/templates/formcomplete/receipt01";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { MixIcon } from "@radix-ui/react-icons";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { I18nProvider } from "@/i18n/csr";
import { useTranslation } from "react-i18next";
import { createClientFormsClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import type {
  EndingPageI18nOverrides,
  EndingPageTemplateID,
  LanguageCode,
} from "@/types";
import {
  render,
  getPropTypes,
  getRenderedTexts,
} from "@/lib/templating/template";
import {
  ending_page_template_config,
  ending_page_templates,
} from "@/k/templates";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useEditorState } from "@/scaffolds/editor";
import { useForm, Controller } from "react-hook-form";
import { Spinner } from "@/components/spinner";

export function EndingPagePreferences() {
  const [state] = useEditorState();

  const {
    form,
    document: { lang },
    form: { ending },
  } = state;

  const [customizeOpen, setCustomizeOpen] = useState(false);
  const supabase = createClientFormsClient();

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty },
    reset,
    watch,
    setValue,
  } = useForm({
    defaultValues: {
      is_ending_page_enabled: ending.is_ending_page_enabled,
      ending_page_template_id: ending.ending_page_template_id,
      overrides: ending.ending_page_i18n_overrides?.overrides,
    },
  });

  const save = async (data: {
    is_ending_page_enabled: boolean;
    ending_page_template_id: EndingPageTemplateID | null;
    overrides?: Record<string, string> | null;
  }) => {
    const _: EndingPageI18nOverrides = {
      $schema: "https://forms.grida.co/schemas/v1/endingpage.json",
      template_id: data.ending_page_template_id ?? "default",
      overrides: data.overrides ?? {},
    };

    const { error } = await supabase
      .from("form_document")
      .update({
        is_ending_page_enabled: data.is_ending_page_enabled,
        ending_page_template_id: data.ending_page_template_id,
        ending_page_i18n_overrides: _ as {},
        // disable redirect if ending page is enabled
        is_redirect_after_response_uri_enabled: data.is_ending_page_enabled
          ? false
          : undefined,
      })
      // TODO: change to document id after migration
      .eq("form_id", form.form_id);

    if (error) throw error;

    toast.success("Saved");
  };

  const onSubmit = handleSubmit(save);

  const enabled = watch("is_ending_page_enabled");
  const template = watch("ending_page_template_id");
  const overrides = watch("overrides");
  const disabled = !!overrides || !enabled;

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Ending Page Template</>} />
      <PreferenceBody>
        <form id="ending-page" className="space-y-4" onSubmit={onSubmit}>
          <Controller
            name="is_ending_page_enabled"
            control={control}
            render={({ field }) => (
              <div className="flex gap-2 items-center">
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label>{enabled ? <>Enabled</> : <>Disabled</>}</Label>
              </div>
            )}
          />

          <Controller
            name="ending_page_template_id"
            control={control}
            render={({ field }) => (
              <Select
                name="ending_page_template_id"
                value={field.value ?? ""}
                onValueChange={(template) =>
                  field.onChange(template as EndingPageTemplateID)
                }
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Ending Page Template" />
                </SelectTrigger>
                <SelectContent>
                  {ending_page_templates.map((id) => (
                    <SelectItem key={id} value={id}>
                      {ending_page_template_config[id].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <PreferenceDescription>
            Enabling ending page will disable redirection
          </PreferenceDescription>
        </form>
        <I18nProvider lng={lang}>
          {template && (
            <div className="flex justify-center items-center min-h-96">
              <Preview
                title={form.form_title}
                lang={lang}
                template={template}
                overrides={overrides}
              />
            </div>
          )}
        </I18nProvider>
      </PreferenceBody>
      <CustomizeTemplate
        key={template}
        form_id={form.form_id}
        title={form.form_title}
        lang={lang}
        init={{
          template_id: template ?? "default",
          i18n_overrides: overrides,
        }}
        open={customizeOpen}
        onOpenChange={(open) => {
          if (open === false) setCustomizeOpen(false);
        }}
        onSave={(template, data) => {
          setValue("ending_page_template_id", template as EndingPageTemplateID);
          setValue("overrides", data);
          setCustomizeOpen(false);
          onSubmit();
        }}
      />
      <PreferenceBoxFooter>
        <Button
          variant="secondary"
          type="button"
          onClick={() => setCustomizeOpen(true)}
        >
          <MixIcon className="me-2" />
          Customize
        </Button>
        <Button
          form="ending-page"
          type="submit"
          disabled={isSubmitting || !isDirty}
        >
          {isSubmitting ? <Spinner /> : "Save"}
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}

function Preview({
  template,
  title,
  lang,
  overrides,
}: {
  template: EndingPageTemplateID;
  title: string;
  lang: LanguageCode;
  overrides?: Record<string, string>;
}) {
  const { t } = useTranslation();

  const context = useMockedContext(
    {
      title,
      form_title: title,
    },
    {
      lang: lang,
    }
  );

  const texts = useMemo(() => {
    return getRenderedTexts({
      shape: getPropTypes(resources.en.translation.formcomplete[template])
        .shape,
      overrides,
      config: {
        context,
        i18n: {
          t,
          basePath: `formcomplete.${template}`,
        },
        renderer: render,
        merge: false,
      },
    });
  }, [template, overrides, context, t]);

  return (
    <>
      {template &&
        React.createElement(
          // @ts-ignore
          getComponent(template),
          {
            ...texts,
          }
        )}
    </>
  );
}

function getComponent(template_id: string) {
  switch (template_id) {
    case "receipt01":
      return FormCompleteReceipt01;
    case "default":
    default:
      return FormCompleteDefault;
  }
}

function CustomizeTemplate({
  lang,
  title,
  form_id,
  init,
  onSave,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  init: {
    template_id?: EndingPageTemplateID;
    i18n_overrides?: Record<string, string>;
  };
  lang: LanguageCode;
  title: string;
  form_id: string;
  onSave?: (template_id: string, data: Record<string, string>) => void;
}) {
  const { t } = useTranslation();

  const onClose = () => {
    props.onOpenChange?.(false);
  };
  return (
    <Dialog {...props}>
      <DialogContent className="min-w-full h-screen p-0" hideCloseButton>
        <TemplateEditor
          context={{
            title,
            language: lang,
          }}
          lang={lang}
          defaultTemplateId={init.template_id}
          defaultTexts={init.i18n_overrides}
          t={t}
          getComponent={getComponent}
          getPropTypes={(template_id) => {
            return getPropTypes(
              resources[lang].translation["formcomplete"][
                template_id as EndingPageTemplateID
              ]
            );
          }}
          onSave={onSave}
          onCancel={() => {
            onClose();
            //
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
