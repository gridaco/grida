"use client";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import {
  CalendarBoxIcon,
  ScreenDecorations,
  ScreenGrid,
  ScreenGridArea,
  ScreenMobileFrame,
  ScreenRoot,
  ScreenScrollable,
  Timer,
} from "@/theme/templates/kit/components";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePreferredLanguage } from "@uidotdev/usehooks";
import { motion } from "framer-motion";
import { useMemo } from "react";

const medias = [
  {
    media: {
      src: "https://images.unsplash.com/photo-1559223607-a43c990c692c?q=80&w=2670&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
  },
  {
    media: {
      src: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=2670&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
  },
  {
    media: {
      src: "https://images.unsplash.com/photo-1559223694-98ed5e272fef?q=80&w=2670&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
  },
];

const close_at = new Date("2025-06-01T00:00:00Z");

interface CampaignMeta {
  max_form_responses_by_customer: number | null;
  is_max_form_responses_by_customer_enabled: boolean;
  max_form_responses_in_total: number | null;
  is_max_form_responses_in_total_enabled: boolean;
  is_force_closed: boolean;
  is_scheduling_enabled: boolean;
  scheduling_open_at: string | null;
  scheduling_close_at: string | null;
  scheduling_tz?: string;
}

interface TemplateProps {
  meta: CampaignMeta;
  data: {};
  messages: Record<string, string>;
  lang: string;
}

export default function _005() {
  return (
    <ScreenRoot>
      <ScreenMobileFrame>
        <ScreenScrollable>
          <div>
            <Media />
          </div>
          <div className="pt-5">
            <header className="px-4">
              <h1 className="text-2xl font-bold w-4/5">
                Your Campaign Title Goes Here.
              </h1>
            </header>
            <div className="py-10 flex justify-center items-center px-4">
              <NextEventState />
            </div>
            <article className="prose prose-sm dark:prose-invert">
              <div className="prose-img:p-0 prose-video:p-0 px-4">
                <p>
                  <i>[Your Campaign Content Body Goes Here.]</i>
                  <br />
                  Lorem ipsum dolor sit amet consectetur adipisicing elit.
                  Voluptates, doloremque.
                </p>
                <Image
                  src={medias[0].media.src}
                  alt=""
                  width={300}
                  height={300}
                  className="w-full h-full aspect-square object-cover"
                />
                <p>
                  Lorem ipsum dolor sit amet consectetur adipisicing elit.
                  Voluptates, doloremque.
                </p>
              </div>
            </article>
          </div>
          <CTAFooter />
        </ScreenScrollable>
      </ScreenMobileFrame>
    </ScreenRoot>
  );
}

function Media() {
  return (
    <Carousel opts={{ loop: true }} plugins={[Autoplay()]}>
      <CarouselContent className="m-0">
        {medias.map((it, index) => (
          <CarouselItem key={index} className="p-0">
            <Image
              src={it.media.src}
              alt=""
              width={300}
              height={300}
              className="w-full h-full aspect-square object-cover"
            />
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}

function CTAFooter() {
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
            <Timer
              date={close_at}
              render={({ ready, d, h, m, s }) => (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={ready ? { opacity: 1 } : {}}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span className="text-xs text-muted-foreground">
                    Closing in
                  </span>
                  <Badge
                    data-ready={ready}
                    variant="secondary"
                    className="uppercase whitespace-nowrap opacity-0 data-[ready=true]:opacity-100"
                  >
                    {d ? (
                      `${d}d `
                    ) : (
                      <>
                        {h && `${h}h `}
                        {m && `${m}m `}
                        {s && `${s}s`}
                      </>
                    )}
                  </Badge>
                </motion.div>
              )}
            />
          </div>
        </div>
        <div className="flex justify-end items-center">
          <Button>Register Now</Button>
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
function NextEventState() {
  const language = usePreferredLanguage();

  const cal_month = useMemo(
    () => close_at.toLocaleDateString(language, { month: "short" }),
    [close_at]
  );

  const cal_day = useMemo(
    () => close_at.toLocaleDateString(language, { day: "numeric" }),
    [close_at]
  );

  return (
    <div className="flex items-start gap-2">
      <CalendarBoxIcon month={cal_month} day={cal_day}></CalendarBoxIcon>
      <div className="inline-flex items-center min-h-10 gap-2 bg-background border px-4 py-2 rounded text-xs">
        Registration close at{" "}
        {close_at.toLocaleDateString(language, {
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
}
