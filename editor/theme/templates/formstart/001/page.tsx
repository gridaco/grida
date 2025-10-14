"use client";
import React, { createContext, useContext, useMemo } from "react";
import Image from "next/image";
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
  HeaderLogoImage,
  CardBackgroundGradientBlur,
  Timer,
  digit2,
  BackgroundVideo,
} from "@/theme/templates/kit/components";
import { cn } from "@/components/lib/utils";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import ReactPlayer from "react-player";
import {
  FormCampaignStartPageContextProvider,
  useCampaignMeta,
} from "@/theme/templates/kit/campaign";
import type { FormStartPage } from "..";
import { DataProvider, useData } from "../../kit/contexts/data.context";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18next from "i18next";
import _messages from "./messages.json";
import type grida from "@grida/schema";

type Messages = typeof _messages;

const userprops = {
  title: { type: "string" },
  subtitle: { type: "string" },
  background_video: { type: "video" },
} satisfies grida.program.document.template.TemplateDocumentDefinition["properties"];

type UserProps = grida.program.schema.TInferredPropTypes<typeof userprops>;

export default function _001() {
  return <Consumer />;
}

function Consumer() {
  const { t } = useTranslation<any>();
  const data = useData<UserProps>();

  return (
    <ScreenRoot>
      <ScreenMobileFrame>
        <Header>
          <HeaderLogoImage
            className="h-10 invert"
            src="/templates/sample-brand-prism/logo.png"
            alt=""
            width={400}
            height={200}
          />
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
                <CardBackgroundGradientBlur className="rounded-xl border border-foreground/10 shadow-xl">
                  <div className="flex flex-col gap-4 p-4">
                    <article className="prose prose-sm dark:prose-invert">
                      <h2 className="w-2/3">{data.title || t("title")}</h2>
                      <p className="w-full max-w-sm">
                        {data.subtitle || t("subtitle")}
                      </p>
                    </article>
                    <div className="flex justify-end items-center gap-4">
                      <Timer
                        date={"2024-12-15"}
                        render={({ ready, h, m, s }) => (
                          <>
                            <div
                              data-ready={ready}
                              className="flex gap-1 opacity-0 transition-opacity duration-1000 data-[ready=true]:opacity-100"
                            >
                              <span>{digit2(h)}</span>
                              <span>:</span>
                              <span>{digit2(m)}</span>
                              <span>:</span>
                              <span>{digit2(s)}</span>
                            </div>
                          </>
                        )}
                      />
                      <Button
                        variant="outline"
                        className="border-foreground bg-transparent uppercase"
                      >
                        {t("button")}
                      </Button>
                    </div>
                  </div>
                </CardBackgroundGradientBlur>
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
              <Image
                src="/templates/sample-images/licensed/winter-dev-only.png"
                alt=""
                width={1080}
                height={1920}
                className="h-full w-full object-cover"
              />
            </motion.div>
            <BackgroundVideo
              source={data.background_video || t("background_video")}
              width="100%"
              height="100%"
              style={{
                objectFit: "cover",
                position: "absolute",
                inset: 0,
                scale: 1.2,
                zIndex: -1,
              }}
            />
          </ScreenBackground>
        </motion.div>
      </ScreenMobileFrame>
      <ScreenRootBackground>
        <Image
          src="/templates/sample-images/licensed/winter-dev-only.png"
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
    <div className={cn("p-4 flex flex-col gap-4 rounded-xs", className)}>
      {children}
    </div>
  );
}

_001.definition = {
  type: "template",
  name: "001",
  properties: userprops,
  version: "1.0.0",
  default: {
    title: "Enter Title",
    subtitle: "Enter Subtitle",
    background: "/images/abstract-placeholder.jpg",
  },
  nodes: {},
  links: {},
} satisfies grida.program.document.template.TemplateDocumentDefinition;
