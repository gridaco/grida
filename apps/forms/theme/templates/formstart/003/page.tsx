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
// import { DataProvider, useData } from "../../kit/contexts/data.context";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18next from "i18next";
import {
  FormCampaignStartPageContextProvider,
  useCampaignMeta,
} from "@/theme/templates/kit/campaign";
import { TextWidget } from "@/builder/template-builder/widgets/text";
import { TemplateBuilderWidgets } from "@/builder/template-builder/widgets";
import { SlotNode } from "@/builder/template-builder/node";
import {
  DataProvider,
  RootDataContextProvider,
} from "@/builder/core/data-context";

const userprops = {
  title: { type: "string" },
  subtitle: { type: "string" },
} satisfies grida.program.template.TemplateDefinition["properties"];

type UserProps = grida.program.schema.TInferredPropTypes<typeof userprops>;

export default function _003({
  meta,
  values,
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
    <RootDataContextProvider>
      <DataProvider namespace="dummy" initialData={values}>
        <FormCampaignStartPageContextProvider value={meta}>
          <I18nextProvider
            // @ts-expect-error
            i18n={i18n}
          >
            <Consumer />
          </I18nextProvider>
        </FormCampaignStartPageContextProvider>
      </DataProvider>
    </RootDataContextProvider>
  );
}

function Consumer() {
  // const data = useData<UserProps>();

  return (
    <ScreenRoot>
      <ScreenCenter>
        <section className="px-4 max-w-screen-sm z-10">
          <TextAlign align="center">
            <SlotNode
              node_id="title"
              component={TemplateBuilderWidgets.Text}
              defaultText={"AAA"}
              defaultStyle={{
                fontSize: 24,
                fontWeight: 700,
              }}
            />
            <div className="flex flex-col justify-center items-center gap-4">
              <h1 className="text-6xl font-bold w-4/5">
                AA
                {/* {data.title} */}
              </h1>
              <p className="text-lg text-foreground/80 w-4/5">
                AA
                {/* {data.subtitle} */}
              </p>
            </div>
          </TextAlign>
          <div className="flex justify-center items-center p-4 py-10">
            <Button>Start Now</Button>
          </div>
        </section>
        <SlotNode
          node_id="background"
          component={TemplateBuilderWidgets.Image}
          className="bg-black"
          defaultStyle={{
            position: "absolute",
            inset: 0,
            objectFit: "cover",
            width: "100%",
            height: "100%",
          }}
          defaultProperties={{ src: "/images/abstract-placeholder.jpg" }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {/* <img
          src="/images/abstract-placeholder.jpg"
          alt="background"
          width={1000}
          height={1000}
          className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none -z-10"
        /> */}
        {/* <ScreenBackground overlay={{ opacity: 0.1 }}></ScreenBackground> */}
      </ScreenCenter>
    </ScreenRoot>
  );
}

_003.properties = userprops;
