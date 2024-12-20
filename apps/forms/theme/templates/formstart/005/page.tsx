"use client";

import React, { createContext, useContext, useMemo } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import {
  CalendarBoxIcon,
  ScreenMobileFrame,
  ScreenRoot,
  ScreenScrollable,
  Timer,
} from "@/theme/templates/kit/components";
import {
  FormCampaignStartPageContextProvider,
  useCampaignMeta,
} from "@/theme/templates/kit/campaign";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import _messages from "./messages.json";
import { Features } from "@/lib/features/scheduling";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18next from "i18next";
import { cn } from "@/utils";
import type { FormStartPage } from "..";
import { DataProvider, useData } from "../../kit/contexts/data.context";
import { useCTAContext } from "../../kit/contexts/cta.context";
import { FileIO } from "@/lib/file";
import type { grida } from "@/grida";
import { Factory } from "@/ast";
import { NodeElement } from "@/grida-canvas/nodes/node";
import { useComputed } from "@/grida-canvas/nodes/use-computed";

type Messages = typeof _messages;

const userprops = {
  title: { type: "string", default: "[Your Title Goes Here.]" },
  body: {
    type: "richtext",
    default: undefined,
  },
  media: { type: "array", items: { type: "image" }, default: [] },
} satisfies grida.program.document.template.TemplateDocumentDefinition["properties"];

type UserProps = grida.program.schema.TInferredPropTypes<typeof userprops>;

export default function _005({
  meta,
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
  const { t } = useTranslation<any>();
  const data = useData();

  const bodyHtml = useMemo(
    () => ({
      __html: data.body_html || t("body_html"),
    }),
    [data.body_html, t]
  );

  return (
    <ScreenRoot>
      <ScreenMobileFrame>
        <ScreenScrollable>
          <div className="min-h-full">
            <div>
              <Media />
            </div>
            <div className="pt-5">
              <header className="flex flex-col items-center gap-4 px-4">
                <div className="w-full text-start">
                  <h1 className="text-2xl font-bold w-4/5">
                    <NodeElement node_id="005.title" />
                    {/* {data.title || t("title")} */}
                  </h1>
                </div>
                <NextEventState className="py-4" />
              </header>
              <Article />
              {/* <article className="py-10 px-4 prose prose-sm dark:prose-invert prose-img:w-screen">
                <div dangerouslySetInnerHTML={bodyHtml} />
              </article> */}
            </div>
          </div>
          <CTAFooter />
        </ScreenScrollable>
      </ScreenMobileFrame>
    </ScreenRoot>
  );
}

function Article() {
  const props = useComputed({
    __html: Factory.createPropertyAccessExpression(["props", "body"]),
  });

  const { __html } = props;

  return (
    <article className="py-10 px-4 prose prose-sm dark:prose-invert prose-img:w-screen">
      <div dangerouslySetInnerHTML={{ __html }} />
    </article>
  );
}

function Media() {
  const props = useComputed({
    media: Factory.createPropertyAccessExpression(["props", "media"]),
  });

  // TODO: fixme - wrong type
  const media = props.media as any as FileIO.GridaAsset[];
  // grida.program.objects.ImageSource

  console.log("media", media);

  return (
    <Carousel opts={{ loop: true }} plugins={[Autoplay()]}>
      <CarouselContent className="m-0">
        {media?.length > 0 &&
          media?.map((it, index) => {
            console.log("it", it);
            return (
              <CarouselItem key={index} className="p-0">
                <img
                  src={it.publicUrl}
                  alt=""
                  width={300}
                  height={300}
                  className="w-full h-full aspect-square object-cover"
                />
              </CarouselItem>
            );
          })}
      </CarouselContent>
    </Carousel>
  );
}

function CTAFooter() {
  const { t } = useTranslation<any>();
  const { onClick } = useCTAContext();

  const {
    is_scheduling_enabled,
    scheduling_close_at,
    scheduling_open_at,
    scheduling_tz,
    is_force_closed,
    is_schedule_in_range,
  } = useCampaignMeta();

  const schedule = useMemo(
    () =>
      is_scheduling_enabled
        ? new Features.ScheduleState({
            open: scheduling_open_at,
            close: scheduling_close_at,
          })
        : null,
    [is_scheduling_enabled, scheduling_open_at, scheduling_close_at]
  );

  const schedulestate = useMemo(() => schedule?.state(), [schedule]);
  const next = useMemo(() => schedule?.next(), [schedule]);

  const closed = useMemo(() => {
    if (is_force_closed) return true;
    if (is_scheduling_enabled && schedulestate !== "after_open_before_close")
      return true;
    return false;
  }, [is_force_closed, schedulestate]);

  return (
    <motion.footer
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ delay: 0.2, duration: 0.8, type: "tween" }}
      className="sticky bottom-0 left-0 right-0 bg-background border-t shadow-sm"
    >
      <div className="flex justify-between gap-4 items-center p-4 pb-8">
        <div>
          <div>
            {schedulestate && next && (
              <Timer
                date={next}
                render={({ ready, d, h, m, s }) => (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={ready ? { opacity: 1 } : {}}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span className="text-xs text-muted-foreground">
                      {t(`registration_footer.${schedulestate}`)}
                    </span>
                    <Badge
                      data-ready={ready}
                      variant="secondary"
                      className="uppercase whitespace-nowrap opacity-0 data-[ready=true]:opacity-100"
                    >
                      {d ? (
                        t("date.d", { d })
                      ) : (
                        <span className="flex items-center gap-1">
                          {h > 0 && <span>{t("date.h", { h })}</span>}
                          {m > 0 && <span>{t("date.m", { m })}</span>}
                          <span>{t("date.s", { s })}</span>
                        </span>
                      )}
                    </Badge>
                  </motion.div>
                )}
              />
            )}
          </div>
        </div>
        <div className="flex justify-end items-center">
          <Button disabled={closed} onClick={onClick}>
            {t("button")}
          </Button>
        </div>
      </div>
    </motion.footer>
  );
}

/**
 * displays the relative [next] schedule.
 * if the event is not yet open, it displays the opening date.
 * if the event is open, it displays the closing date.
 * if the event is closed (by time or by capacity), it displays the event is closed.
 */
function NextEventState({ className }: { className?: string }) {
  const { t, i18n } = useTranslation<any>();
  const lang = i18n.language;
  const {
    is_scheduling_enabled,
    scheduling_close_at,
    scheduling_open_at,
    scheduling_tz,
    is_schedule_in_range: is_open,
  } = useCampaignMeta();

  const schedule = useMemo(
    () =>
      is_scheduling_enabled
        ? new Features.ScheduleState({
            open: scheduling_open_at,
            close: scheduling_close_at,
          })
        : null,
    [is_scheduling_enabled, scheduling_open_at, scheduling_close_at]
  );

  const schedulestate = useMemo(() => schedule?.state(), [schedule]);
  const next = useMemo(() => schedule?.next(), [schedule]);

  const cal_text = useMemo(() => {
    if (!next) return null;

    return {
      month: next.toLocaleDateString(lang, { month: "short" }),
      day: next.toLocaleDateString(lang, { day: "numeric" }),
    };
  }, [next, lang]);

  const state_text = useMemo(() => {
    return t(`registration_banner.${schedulestate}`, {
      context: next ? undefined : "alt",
      date: next?.toLocaleDateString(lang, {
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
  }, [t, schedulestate, lang, next]);

  if (is_scheduling_enabled && state_text) {
    return (
      <div className={cn("flex items-start gap-2", className)}>
        {cal_text && (
          <CalendarBoxIcon month={cal_text.month} day={cal_text.day} />
        )}
        <div className="inline-flex items-center min-h-10 gap-2 bg-background border px-4 py-2 rounded text-xs">
          {state_text}
        </div>
      </div>
    );
  }

  return <></>;
}

_005.definition = {
  type: "template",
  name: "005",
  properties: userprops,
  version: "1.0.0",
  default: {},
  nodes: {
    "005.title": {
      type: "text",
      id: "005.title",
      name: "Title",
      active: true,
      locked: false,
      opacity: 1,
      position: "relative",
      style: {},
      width: "auto",
      height: "auto",
      fontWeight: 400,
      fontSize: 24,
      textAlign: "left",
      textAlignVertical: "top",
      textDecoration: "none",
      text: Factory.createPropertyAccessExpression(["props", "title"]),
      zIndex: 0,
    },
    // "005.body": {
    //   id: "005.body",
    //   type: "text",
    //   active: true,
    //   locked: false,
    //   name: "Body",
    //   opacity: 1,
    //   position: "relative",
    //   style: {},
    //   width: "auto",
    //   height: "auto",
    //   text: Factory.createPropertyAccessExpression(["props", "body"]),
    //   zIndex: 0,
    // },
    // "005.media": {
    //   id: "005.media",
    //   active: true,
    // },
  },
} satisfies grida.program.document.template.TemplateDocumentDefinition;
