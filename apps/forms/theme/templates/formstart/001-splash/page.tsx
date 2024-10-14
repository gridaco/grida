"use client";

import Image from "next/image";
import { Header, HeaderLogo } from "../components/header";
import {
  ScreenDecorations,
  ScreenCameraCrossDecoration,
  LinearBoxScaleDecoration,
} from "../components/decorations";
import React, { useEffect, useState } from "react";
import data from "../data/02.dummy.json";
import { cn } from "@/utils";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import ReactPlayer from "react-player";

export default function StartPage_001_Slash() {
  return (
    <div className="h-dvh w-dvw overflow-hidden md:p-4">
      <main className="relative overflow-hidden md:container w-full h-full md:max-w-md mx-auto md:rounded-lg md:shadow-lg !p-0">
        <Header>
          <HeaderLogo
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
                <GradientBackgroundBlur className="rounded-xl border border-foreground/10 shadow-xl">
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
                </GradientBackgroundBlur>
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
            <ScreenCameraCrossDecoration className="p-4" crossSize={20} />
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
                src="/templates/sample-images/winter-dev-only.png"
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
      </main>
      <div className="fixed inset-0 w-full h-full -z-50 pointer-events-none select-none">
        <Image
          src="/templates/sample-images/winter-dev-only.png"
          alt=""
          width={1080}
          height={1920}
          className="h-full w-full object-cover blur-3xl"
        />
      </div>
    </div>
  );
}

function digit2(digit: number) {
  return digit.toString().padStart(2, "0");
}

function Timer({
  date,
  render,
}: {
  date: string | Date;
  render: ({
    ready,
    d,
    h,
    m,
    s,
  }: {
    ready: boolean;
    d: number;
    h: number;
    m: number;
    s: number;
  }) => React.ReactNode;
}) {
  const [remaining, setRemaining] = useState<number>(-1);

  const ready = remaining >= 0;

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(new Date(date).getTime() - new Date().getTime());
    }, 1000);
    return () => clearInterval(interval);
  }, [date]);

  const remainingSeconds = Math.max(remaining / 1000, 0); // Ensure non-negative time
  const d = Math.floor(remainingSeconds / 86400);
  const h = Math.floor((remainingSeconds % 86400) / 3600);
  const m = Math.floor((remainingSeconds % 3600) / 60);
  const s = Math.floor(remainingSeconds % 60);

  return render({ ready, d, h, m, s });
}

function ScreenBackground({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="relative inset-0 w-full h-full -z-40 select-none">
      {children}
    </div>
  );
}

function ScreenGrid({
  children,
  columns,
  rows,
}: React.PropsWithChildren<{
  columns: number;
  rows: number;
}>) {
  return (
    <div
      className="absolute inset-0 w-full h-full grid grid-cols-2 grid-rows-2"
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
    >
      {children}
    </div>
  );
}

function ScreenGridPosition({
  children,
  col,
  row,
}: React.PropsWithChildren<{
  col: number;
  row: number;
}>) {
  return (
    <div
      className={"absolute inset-0 w-full h-full"}
      style={{
        gridColumn: col,
        gridRow: row,
      }}
    >
      {children}
    </div>
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

function GradientBackgroundBlur({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div className="relative w-full h-full">
      <div
        className={cn(
          "-z-10 absolute inset-0 w-full h-full backdrop-blur-xl bg-gradient-to-b from-transparent to-background/40",
          className
        )}
      ></div>
      {children}
    </div>
  );
}
