"use client";

import React, { useEffect, useState } from "react";
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
} from "@/theme/templates/kit/components";
import data from "../data/02.dummy.json";
import { cn } from "@/utils";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import ReactPlayer from "react-player";

export default function StartPage_001_Slash() {
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
                      <h2 className="w-2/3">{data.title}</h2>
                      <p className="w-full max-w-sm">{data.excerpt}</p>
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
                        className="border-foreground bg-transparent"
                      >
                        <span>REGISTER</span>
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
            <ReactPlayer
              url="https://www.youtube.com/watch?v=MODJZjOUwNA&ab_channel=aespa"
              width="100%"
              height="100%"
              playing={true}
              muted={true}
              loop={true}
              style={{
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
    <div className={cn("p-4 flex flex-col gap-4 rounded-sm", className)}>
      {children}
    </div>
  );
}
