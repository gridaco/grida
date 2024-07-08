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
  FormsPageLanguage,
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

export function EndingPagePreferences({
  form_id,
  lang = "en",
  title,
  init,
}: {
  form_id: string;
  lang?: FormsPageLanguage;
  title: string;
  init: {
    enabled: boolean;
    template_id: EndingPageTemplateID | null;
    i18n_overrides: EndingPageI18nOverrides | null;
  };
}) {
  const [template, setTemplate] = useState(init.template_id ?? undefined);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [overrides, setOverrides] = useState(init.i18n_overrides?.overrides);

  const supabase = createClientFormsClient();

  const save = async (
    template_id: EndingPageTemplateID,
    texts: Record<string, string>
  ) => {
    const _: EndingPageI18nOverrides = {
      $schema: "https://forms.grida.co/schemas/v1/endingpage.json",
      template_id,
      overrides: texts,
    };

    const { error } = await supabase
      .from("form")
      .update({
        is_ending_page_enabled: true,
        ending_page_template_id: template_id,
        ending_page_i18n_overrides: _ as {},
      })
      .eq("id", form_id);

    if (error) throw error;
  };

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Ending Page Template</>} />
      <PreferenceBody>
        <form
          id="/private/editor/customize/ending-page"
          action="/private/editor/customize/ending-page"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <Select
            name="template_id"
            value={template ?? undefined}
            onValueChange={(template) =>
              setTemplate(template as EndingPageTemplateID)
            }
            disabled={!!overrides}
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
          <PreferenceDescription>
            Enabling ending page will disable redirection
          </PreferenceDescription>
        </form>
        <I18nProvider lng={lang}>
          {template && (
            <div className="flex justify-center items-center min-h-96">
              <Preview
                title={title}
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
        form_id={form_id}
        title={title}
        lang={lang}
        init={{
          template_id: template,
          i18n_overrides: overrides,
        }}
        open={customizeOpen}
        onOpenChange={(open) => {
          if (open === false) setCustomizeOpen(false);
        }}
        onSave={(template, data) => {
          const saving = save(template as EndingPageTemplateID, data).then(
            () => {
              setTemplate(template as EndingPageTemplateID);
              setCustomizeOpen(false);
              setOverrides(data);
            }
          );

          toast.promise(saving, {
            loading: "Saving...",
            success: "Saved",
            error: "Failed to save",
          });
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
        {!overrides && (
          <Button form="/private/editor/customize/ending-page" type="submit">
            Save
          </Button>
        )}
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
  lang: FormsPageLanguage;
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
    template_id?: string;
    i18n_overrides?: Record<string, string>;
  };
  lang: FormsPageLanguage;
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
