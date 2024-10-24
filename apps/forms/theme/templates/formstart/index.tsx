import FormStartPage000 from "@/theme/templates/formstart/default/page";
import FormStartPage001 from "@/theme/templates/formstart/001/page";
import FormStartPage002 from "@/theme/templates/formstart/002/page";
import FormStartPage003 from "@/theme/templates/formstart/003/page";
import FormStartPage004 from "@/theme/templates/formstart/004/page";
import FormStartPage005 from "@/theme/templates/formstart/005/page";
import FormStartPage006 from "@/theme/templates/formstart/006/page";
import { CampaignMeta } from "@/types";
import { useMemo } from "react";

export namespace FormStartPage {
  export const templates = [
    // {
    //   id: "000",
    //   name: "000",
    //   component: FormStartPage000,
    // },
    {
      id: "001",
      name: "001",
      component: FormStartPage001,
    },
    {
      id: "002",
      name: "002",
      component: FormStartPage002,
    },
    {
      id: "003",
      name: "003",
      component: FormStartPage003,
    },
    {
      id: "004",
      name: "004",
      component: FormStartPage004,
    },
    {
      id: "005",
      name: "005",
      component: FormStartPage005,
    },
    {
      id: "006",
      name: "006",
      component: FormStartPage006,
    },
  ];

  export function getTemplate(template_id: string) {
    return templates.find((t) => t.id === template_id)!;
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

  export interface CampaignTemplateProps<M extends Resource> {
    meta: CampaignMeta;
    values: {};
    resources?: M;
    lang: string;
  }

  export function Renderer({
    template_id,
    values: data,
    meta,
    lang,
  }: {
    template_id: string;
  } & CampaignTemplateProps<Resource>) {
    const template = useMemo(
      () => FormStartPage.getTemplate(template_id),
      [template_id]
    )!;

    return <template.component values={data} meta={meta} lang={lang} />;
  }
}
