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
  type ClientTemplateDefinition = grida.program.template.TemplateDefinition & {
    component: React.ComponentType<
      FormStartPage.CampaignTemplateProps<any, any>
    >;
  };

  export const templates: ClientTemplateDefinition[] = [
    // {
    //   id: "000",
    //   name: "000",
    //   component: FormStartPage000,
    // },
    {
      type: "template",
      name: "001",
      version: "0.0.0",
      default: {},
      properties: FormStartPage001.properties,
      component: FormStartPage001,
    },
    {
      type: "template",
      name: "002",
      version: "0.0.0",
      default: {},
      properties: FormStartPage002.properties,
      component: FormStartPage002,
    },
    {
      type: "template",
      name: "003",
      version: "0.0.0",
      default: {},
      properties: FormStartPage003.properties,
      component: FormStartPage003,
    },
    {
      type: "template",
      name: "004",
      version: "0.0.0",
      default: {},
      properties: FormStartPage004.properties,
      component: FormStartPage004,
    },
    {
      type: "template",
      name: "005",
      version: "0.0.0",
      default: {},
      properties: FormStartPage005.properties,
      component: FormStartPage005,
    },
    {
      type: "template",
      name: "006",
      version: "0.0.0",
      default: {},
      properties: FormStartPage006.properties,
      component: FormStartPage006,
    },
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
    values: P;
    resources?: M;
    lang: string;
  }

  export function Renderer({
    name,
    values: data,
    meta,
    lang,
  }: {
    name: string;
  } & CampaignTemplateProps<any, Resource>) {
    const template = useMemo(() => FormStartPage.getTemplate(name), [name])!;

    return <template.component values={data} meta={meta} lang={lang} />;
  }
}
