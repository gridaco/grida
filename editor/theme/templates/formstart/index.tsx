"use client";

import FormStartPage000 from "@/theme/templates/formstart/default/page";
import FormStartPage001 from "@/theme/templates/formstart/001/page";
import FormStartPage002 from "@/theme/templates/formstart/002/page";
import FormStartPage003 from "@/theme/templates/formstart/003/page";
import FormStartPage004 from "@/theme/templates/formstart/004/page";
import FormStartPage005 from "@/theme/templates/formstart/005/page";
import FormStartPage005_RES from "@/theme/templates/formstart/005/messages.json";
import FormStartPage006 from "@/theme/templates/formstart/006/page";
import { CampaignMeta } from "@/types";
import React, { useMemo } from "react";
import { grida } from "@/grida";
import { StandaloneSceneContent } from "@/grida-react-canvas";
import { FormCampaignStartPageContextProvider } from "../kit/campaign";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";

export namespace FormStartPage {
  type ClientTemplateDefinition =
    grida.program.document.template.TemplateDocumentDefinition & {
      component: React.ComponentType<any>;
      resources: Resource;
    };

  export const templates: ClientTemplateDefinition[] = [
    // {
    //   ...FormStartPage000.definition,
    //   component: FormStartPage000,
    // },
    // {
    //   ...FormStartPage001.definition,
    //   component: FormStartPage001,
    // },
    // {
    //   ...FormStartPage002.definition,
    //   component: FormStartPage002,
    // },
    {
      ...FormStartPage003.definition,
      component: FormStartPage003,
      resources: {},
    },
    // {
    //   ...FormStartPage004.definition,
    //   component: FormStartPage004,
    // },
    {
      ...FormStartPage005.definition,
      component: FormStartPage005,
      resources: FormStartPage005_RES,
    },
    // {
    //   ...FormStartPage006.definition,
    //   component: FormStartPage006,
    // },
  ];

  export function getTemplate(name: string) {
    return templates.find((t) => t.name === name)!;
  }

  type ResourceKey =
    | string
    | {
        [key: string]: any;
      };

  interface ResourceLanguage {
    [namespace: string]: ResourceKey;
  }

  interface Resource {
    [language: string]: ResourceLanguage;
  }

  interface CampaignTemplateProps {
    meta: CampaignMeta;
    // props: P;
    // resources?: M;
    lang: string;
  }

  export function TemplateRenderer({
    name,
    meta,
    lang,
    // resources = {},
  }: {
    name: string;
  } & CampaignTemplateProps) {
    const template = useMemo(() => FormStartPage.getTemplate(name), [name])!;

    // return <template.component meta={meta} lang={lang} />;

    const i18n = useMemo(() => {
      return i18next.createInstance(
        {
          fallbackLng: "en",
          resources: template.resources,
          lng: lang,
        },
        (err, t) => {
          if (err) return console.log("something went wrong loading", err);
        }
      );
    }, [lang]);

    return (
      <FormCampaignStartPageContextProvider value={meta}>
        <I18nextProvider i18n={i18n}>
          <StandaloneSceneContent
            templates={{
              [name]: template.component,
            }}
            className="w-full h-full"
          />
        </I18nextProvider>
      </FormCampaignStartPageContextProvider>
    );
  }
}
