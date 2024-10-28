"use client";

import { Button } from "@/components/ui/button";
import React, { useMemo } from "react";
import {
  ScreenBackground,
  ScreenCenter,
  ScreenRoot,
  TextAlign,
} from "@/theme/templates/kit/components";
import Image from "next/image";
import type { grida } from "@/grida";
import type { FormStartPage } from "..";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18next from "i18next";
import {
  FormCampaignStartPageContextProvider,
  useCampaignMeta,
} from "@/theme/templates/kit/campaign";
import { TemplateBuilderWidgets } from "@/builder/template-builder/widgets";
import { NodeSlot } from "@/builder/template-builder/node";
import { Factory } from "@/ast";

const userprops = {
  title: { type: "string" },
  subtitle: { type: "string" },
  background: { type: "image" },
} satisfies grida.program.template.TemplateDefinition["properties"];

type UserProps = grida.program.schema.TInferredPropTypes<typeof userprops>;

export default function _003({
  meta,
  resources = {},
  lang,
}: FormStartPage.CampaignTemplateProps<UserProps, {}>) {
  const i18n = useMemo(() => {
    return i18next.createInstance(
      {
        fallbackLng: "en",
        resources: resources,
        lng: lang,
      },
      (err, t) => {
        if (err) return console.log("something went wrong loading", err);
      }
    );
  }, [lang]);

  return (
    <FormCampaignStartPageContextProvider value={meta}>
      <I18nextProvider
        // @ts-expect-error
        i18n={i18n}
      >
        <Consumer />
      </I18nextProvider>
    </FormCampaignStartPageContextProvider>
  );
}

function Consumer() {
  return (
    <ScreenRoot>
      <ScreenCenter>
        <section className="px-4 max-w-screen-sm z-10">
          <TextAlign align="center">
            <div className="flex flex-col justify-center items-center gap-4">
              <h1 className="text-6xl font-bold w-4/5">
                <NodeSlot
                  node_id="003.title"
                  component={TemplateBuilderWidgets.Text}
                  style={{}}
                />
              </h1>
              <p className="text-lg text-foreground/80 w-4/5">
                <NodeSlot
                  node_id="003.subtitle"
                  component={TemplateBuilderWidgets.Text}
                  style={{}}
                />
                {/* {data.subtitle} */}
              </p>
            </div>
          </TextAlign>
          <div className="flex justify-center items-center p-4 py-10">
            <Button>Start Now</Button>
          </div>
        </section>
        <NodeSlot
          node_id="003.background"
          component={TemplateBuilderWidgets.Image}
          style={{
            position: "absolute",
            inset: 0,
            objectFit: "cover",
            width: "100%",
            height: "100%",
          }}
        />
      </ScreenCenter>
    </ScreenRoot>
  );
}

_003.definition = {
  type: "template",
  name: "003",
  properties: userprops,
  version: "1.0.0",
  default: {
    title: "Enter Title",
    subtitle: "Enter Subtitle",
    background: "/images/abstract-placeholder.jpg",
  },
  nodes: [
    {
      active: true,
      locked: false,
      type: "text",
      id: "003.title",
      name: "Title",
      text: Factory.createPropertyAccessExpression(["props", "title"]),
    },
    {
      active: true,
      locked: false,
      type: "text",
      id: "003.subtitle",
      name: "Subtitle",
      text: Factory.createPropertyAccessExpression(["props", "subtitle"]),
    },
    {
      active: true,
      locked: false,
      type: "image",
      id: "003.background",
      name: "Background",
      src: Factory.createPropertyAccessExpression(["props", "background"]),
    },
  ],
} satisfies grida.program.template.TemplateDefinition;
