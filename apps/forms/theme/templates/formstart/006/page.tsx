"use client";
import React, { useMemo } from "react";
import {
  ScreenGrid,
  ScreenGridPosition,
  ScreenDecorations,
  ScreenBackground,
  ScreenRootBackground,
  ScreenRoot,
  ScreenMobileFrame,
  CameraCrossDecoration,
  LinearBoxScaleDecoration,
  Header,
} from "@/theme/templates/kit/components";
import { cn } from "@/utils";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { FormCampaignStartPageContextProvider } from "@/theme/templates/kit/campaign";
import type { FormStartPage } from "..";
import { DataProvider, useData } from "../../kit/contexts/data.context";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18next from "i18next";
import _messages from "./messages.json";
import { LeviLogo } from "@/components/logos/levi";
import type { grida } from "@/grida";

type Messages = typeof _messages;

const userprops =
  {} satisfies grida.program.template.TemplateDefinition["properties"];

type UserProps = grida.program.schema.TInferredPropTypes<typeof userprops>;

const image =
  "https://www.levi.co.kr/on/demandware.static/-/Sites-LeviKR-Library/default/dwe83fbc3c/images/redtabimg/images/RedTab-Header.jpg";

export default function _006({
  meta,
  values: data,
  resources = _messages,
  lang,
}: FormStartPage.CampaignTemplateProps<UserProps, Messages>) {
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
    <DataProvider data={data}>
      <FormCampaignStartPageContextProvider value={meta}>
        <I18nextProvider
          // @ts-expect-error
          i18n={i18n}
        >
          <Consumer />
        </I18nextProvider>
      </FormCampaignStartPageContextProvider>
    </DataProvider>
  );
}

function Consumer() {
  const { t } = useTranslation<any>();
  const data = useData();

  return (
    <ScreenRoot>
      <ScreenMobileFrame>
        <Header>
          <LeviLogo className="fill-[#C41230]" />
        </Header>
        <ScreenGrid columns={8} rows={16}>
          <ScreenGridPosition col={1} row={11}>
            <motion.div
              initial={{ y: "200%", scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              transition={{
                duration: 1.2,
                delay: 0.5,
                ease: "easeInOut",
                type: "spring",
              }}
            >
              <ContentCard>
                <CardBackground>
                  <div className="flex flex-col gap-4 p-4">
                    <article className="prose prose-sm dark:prose-invert">
                      <h2 className="w-2/3">{data.title || t("title")}</h2>
                      <p className="w-full max-w-sm">
                        {data.subtitle || t("subtitle")}
                      </p>
                    </article>
                    <div className="flex justify-end items-center gap-4">
                      <Button
                        variant="default"
                        className="uppercase rounded-none"
                      >
                        {t("button")}
                      </Button>
                    </div>
                  </div>
                </CardBackground>
              </ContentCard>
            </motion.div>
          </ScreenGridPosition>
        </ScreenGrid>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 1.2 }}
        >
          <ScreenDecorations>
            <CameraCrossDecoration className="p-4" crossSize={20} />
            <div className="absolute top-1/3 right-8">
              <LinearBoxScaleDecoration
                orientation="vertical"
                length={10}
                className="bg-black"
              />
            </div>
          </ScreenDecorations>
        </motion.div>
        <motion.div
          initial={{ scale: 1.05 }}
          animate={{ scale: 1 }}
          transition={{ delay: 1, duration: 1, type: "tween" }}
          className="absolute -z-40 inset-0 w-full h-full"
        >
          <ScreenBackground>
            <motion.div
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 1, delay: 2 }}
              className="w-full h-full"
            >
              <img
                src={image}
                alt=""
                width={1080}
                height={1920}
                className="h-full w-full object-cover"
              />
            </motion.div>
            <video
              className="absolute inset-0 w-full h-full object-cover z-[-1]"
              src={data.background?.[0]?.publicUrl || t("background_video")}
              playsInline
              autoPlay
              muted
              loop
            />
          </ScreenBackground>
        </motion.div>
      </ScreenMobileFrame>
      <ScreenRootBackground>
        <img
          src={image}
          alt=""
          width={1080}
          height={1920}
          className="h-full w-full object-cover blur-3xl"
        />
      </ScreenRootBackground>
    </ScreenRoot>
  );
}

function ContentCard({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn("p-4 flex flex-col gap-4 rounded-sm", className)}>
      {children}
    </div>
  );
}

function CardBackground({ children }: React.PropsWithChildren<{}>) {
  return <div className="bg-background p-2">{children}</div>;
}

_006.properties = userprops;
