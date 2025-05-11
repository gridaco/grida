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
import { useCampaignMeta } from "@/theme/templates/kit/campaign";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "motion/react";
import _messages from "./messages.json";
import { Features } from "@/lib/features/scheduling";
import { useTranslation } from "react-i18next";
import { cn } from "@/components/lib/utils";
import { DataProvider, useData } from "../../kit/contexts/data.context";
import { useCTAContext } from "../../kit/contexts/cta.context";
import { FileIO } from "@/lib/file";
import type { grida } from "@/grida";
import { NodeElement } from "@/grida-react-canvas/nodes/node";
import { useComputed } from "@/grida-react-canvas/nodes/use-computed";
import { tokens } from "@grida/tokens";

type Messages = typeof _messages;

const userprops = {
  title: { type: "string", default: "[Your Title Goes Here.]" },
  body: {
    type: "richtext",
    default: {
      type: "richtext",
      html: "We are thrilled to announce the upcoming [Event Name], happening on [Date]. This is your chance to be part of an exclusive gathering of professionals, enthusiasts, and innovators in the [Industry/Field]. Whether you're looking to expand your network, gain valuable insights from industry leaders, or discover the latest trends and tools, [Event Name] offers something for everyone.<br/><br/>Over the course of [Number of Days] days, you will have the opportunity to attend workshops, keynotes, and panel discussions led by experts from around the world. Our carefully curated sessions will cover a wide range of topics, from [Topic 1] to [Topic 2], ensuring that there is something to match your interests and needs.<br/><br/><img src='https://images.unsplash.com/photo-1556505622-49ea9f8eaf76?q=80&w=3688&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D' alt='Event Image'/><br/>Don’t miss out on this unique opportunity to grow your skills, connect with peers, and take your career to the next level. Reserve your spot today!",
    },
  },
  media: { type: "array", items: { type: "image" }, default: [] },
} satisfies grida.program.document.template.TemplateDocumentDefinition["properties"];

type UserProps = grida.program.schema.TInferredPropTypes<typeof userprops>;

export default function _005() {
  return <Consumer />;
}

function Consumer() {
  const { t } = useTranslation<any>();
  const data = useData();

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
              <article className="py-10 px-4 prose prose-sm dark:prose-invert prose-img:w-screen">
                <NodeElement node_id="005.body" />
              </article>
            </div>
          </div>
          <CTAFooter />
        </ScreenScrollable>
      </ScreenMobileFrame>
    </ScreenRoot>
  );
}

function Media() {
  const props = useComputed({
    media: tokens.factory.createPropertyAccessExpression(["props", "media"]),
  });

  // TODO: fixme - wrong type
  const media = props.media as any as FileIO.GridaAsset[];
  // grida.program.objects.ImageSource[];

  return (
    <Carousel opts={{ loop: true }} plugins={[Autoplay()]}>
      <CarouselContent className="m-0">
        {media?.length > 0 &&
          media?.map((it, index) => {
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
        <div className="inline-flex items-center min-h-10 gap-2 bg-background border px-4 py-2 rounded-sm text-xs">
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
      rotation: 0,
      position: "relative",
      style: {},
      width: "auto",
      height: "auto",
      fontWeight: 400,
      fontSize: 24,
      textAlign: "left",
      textAlignVertical: "top",
      textDecoration: "none",
      text: tokens.factory.createPropertyAccessExpression(["props", "title"]),
      zIndex: 0,
    },
    "005.body": {
      id: "005.body",
      type: "richtext",
      active: true,
      locked: false,
      name: "Body",
      opacity: 1,
      rotation: 0,
      position: "relative",
      style: {},
      width: "auto",
      height: "auto",
      html: tokens.factory.createPropertyAccessExpression(["props", "body"]),
      zIndex: 0,
    },
    // "005.media": {
    //   id: "005.media",
    //   active: true,
    // },
  },
} satisfies grida.program.document.template.TemplateDocumentDefinition;
