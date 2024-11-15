import FormStartPage000 from "@/theme/templates/formstart/default/page";
import FormStartPage001 from "@/theme/templates/formstart/001/page";
import FormStartPage002 from "@/theme/templates/formstart/002/page";
import FormStartPage003 from "@/theme/templates/formstart/003/page";
import FormStartPage004 from "@/theme/templates/formstart/004/page";
import FormStartPage005 from "@/theme/templates/formstart/005/page";
import FormStartPage006 from "@/theme/templates/formstart/006/page";
import { CampaignMeta } from "@/types";
import React, { useMemo } from "react";
import { grida } from "@/grida";

export namespace FormStartPage {
  type ClientTemplateDefinition =
    grida.program.document.template.TemplateDocumentDefinition & {
      component: React.ComponentType<
        FormStartPage.CampaignTemplateProps<any, any>
      >;
    };

  export const templates: ClientTemplateDefinition[] = [
    // {
    //   ...FormStartPage000.definition,
    //   component: FormStartPage000,
    // },
    {
      ...FormStartPage001.definition,
      component: FormStartPage001,
    },
    // {
    //   type: "template",
    //   name: "002",
    //   version: "0.0.0",
    //   default: {},
    //   properties: FormStartPage002.properties,
    //   component: FormStartPage002,
    // },
    {
      ...FormStartPage003.definition,
      component: FormStartPage003,
    },
    // {
    //   type: "template",
    //   name: "004",
    //   version: "0.0.0",
    //   default: {},
    //   properties: FormStartPage004.properties,
    //   component: FormStartPage004,
    // },
    {
      ...FormStartPage005.definition,
      component: FormStartPage005,
    },
    // {
    //   type: "template",
    //   name: "006",
    //   version: "0.0.0",
    //   default: {},
    //   properties: FormStartPage006.properties,
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

  export interface CampaignTemplateProps<P, M extends Resource> {
    meta: CampaignMeta;
    // props: P;
    resources?: M;
    lang: string;
  }

  export function TemplateRenderer({
    name,
    // props = {},
    meta,
    lang,
  }: {
    name: string;
  } & CampaignTemplateProps<any, Resource>) {
    const template = useMemo(() => FormStartPage.getTemplate(name), [name])!;

    return <template.component meta={meta} lang={lang} />;
  }
}
