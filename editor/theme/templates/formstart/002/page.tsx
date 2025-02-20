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
  HeaderLogo,
  CardBackgroundGradient,
  ScreenGridArea,
} from "@/theme/templates/kit/components";
import data from "./messages.json";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { KakaoTalkLogo, PolestarTypeLogo } from "@/components/logos";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { ArrowRightIcon, GlobeIcon } from "@radix-ui/react-icons";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { PhoneIcon } from "lucide-react";
import Link from "next/link";
import type { grida } from "@/grida";

const userprops =
  {} satisfies grida.program.document.template.TemplateDocumentDefinition["properties"];

type UserProps = grida.program.schema.TInferredPropTypes<typeof userprops>;

// https://www.polestar.com/dato-assets/11286/1709559099-02-polestar-3-overview-stats-t.mp4

export default function _002() {
  return (
    <ScreenRoot>
      <ScreenMobileFrame>
        <Header>
          <HeaderLogo>
            <PolestarTypeLogo className="w-20" />
          </HeaderLogo>
        </Header>
        <ScreenGrid columns={8} rows={16}>
          <ScreenGridArea area={[12, 1, 17, 9]}>
            <motion.div
              initial={{ y: "200%", scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              transition={{
                duration: 1.2,
                delay: 0.5,
                ease: "easeInOut",
                // type: "spring",
              }}
              className="w-full h-full"
            >
              <CardBackgroundGradient className="border-foreground/10">
                <div className="flex flex-col gap-4 p-4">
                  <article className="prose prose-sm dark:prose-invert">
                    <h2 className="w-2/3">{data.title}</h2>
                    <p className="w-full max-w-sm">{data.subtitle}</p>
                  </article>
                  <div className="flex justify-between items-center gap-4">
                    <div>
                      <ModeratorDrawer>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-8 h-8">
                            <AvatarImage
                              src="/templates/sample-faces/anthony-le-lmdHAyY57KQ-unsplash.jpg"
                              className="object-cover"
                            />
                          </Avatar>
                          <span className="text-xs hover:underline">
                            정우주 / 폴스타 서울
                          </span>
                        </div>
                      </ModeratorDrawer>
                    </div>
                    <div className="flex flex-col justify-end items-center gap-2">
                      <Timer
                        date={"2024-12-15"}
                        render={({ ready, h, m, s }) => (
                          <>
                            <div
                              data-ready={ready}
                              className="flex gap-0.5 opacity-0 text-xs transition-opacity duration-1000 data-[ready=true]:opacity-100"
                            >
                              <span>{digit2(h)}</span>
                              <span>:</span>
                              <span>{digit2(m)}</span>
                              <span>:</span>
                              <span>{digit2(s)}</span>
                              <span>남음</span>
                            </div>
                          </>
                        )}
                      />
                      <Link href="https://app.grida.co/d/e/8516e066-f620-416d-955c-1ec9b3e4dc75">
                        <Button
                          variant="outline"
                          className="border-foreground bg-transparent rounded-none"
                        >
                          <span>시승 예약 하기</span>
                          <ArrowRightIcon className="ms-2 w-4 h-4 text-orange-400" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </CardBackgroundGradient>
            </motion.div>
          </ScreenGridArea>
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
                src="https://sdl-assets.ams3.cdn.digitaloceanspaces.com/sdl/2021/08/sdl-polestar-interior-steering-2000x1333.jpg"
                alt=""
                width={1080}
                height={1920}
                className="w-full h-full object-cover"
              />
            </motion.div>
            {/* https://www.polestar.com/dato-assets/11286/1709559099-02-polestar-3-overview-stats-t.mp4 */}
            <video
              src="https://www.polestar.com/dato-assets/11286/1717510114-ps3-homepage-video-d.mp4"
              width="100%"
              height="100%"
              muted
              loop
              playsInline
              autoPlay
              className="w-full h-full object-cover"
              style={{
                objectFit: "cover",
                position: "absolute",
                inset: 0,
                zIndex: -1,
              }}
            />
          </ScreenBackground>
        </motion.div>
      </ScreenMobileFrame>
      <ScreenRootBackground>
        <img
          src="https://sdl-assets.ams3.cdn.digitaloceanspaces.com/sdl/2021/08/sdl-polestar-interior-steering-2000x1333.jpg"
          alt=""
          width={1080}
          height={1920}
          className="h-full w-full object-cover blur-3xl"
        />
      </ScreenRootBackground>
    </ScreenRoot>
  );
}

function ModeratorDrawer({ children }: React.PropsWithChildren<{}>) {
  return (
    <Drawer>
      <DrawerTrigger>{children}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-start">
          <DrawerTitle>
            <span className="inline-flex align-middle me-2">
              <Avatar className="w-8 h-8">
                <AvatarImage
                  src="/templates/sample-faces/anthony-le-lmdHAyY57KQ-unsplash.jpg"
                  className="object-cover"
                />
              </Avatar>
            </span>
            안녕하세요 고객님, 폴스타 서울 정우주 입니다.
          </DrawerTitle>
          <DrawerDescription>
            고객님을 Polestar 3 를 시승회에 초대 드립니다. 궁굼한점이
            있으신가요? 아래 버튼을 눌러 문의 주세요.
          </DrawerDescription>
        </DrawerHeader>
        <div className="p-4 flex flex-col gap-2 text-muted-foreground">
          <li className="flex items-center gap-2">
            <PhoneIcon className="w-4 h-4" />
            <Link href={"tel:010-7146-1470"}>
              <span>010-7146-1470</span>
            </Link>
          </li>
          <li className="flex items-center gap-2">
            <KakaoTalkLogo className="w-4 h-4" />
            <Link href={"tel:010-7146-1470"}>
              <span>010-7146-1470</span>
            </Link>
          </li>
          <li className="flex items-center gap-2">
            <GlobeIcon className="w-4 h-4" />
            <Link href={"https://www.polestar.com"}>
              <span>www.polestar.com</span>
            </Link>
          </li>
        </div>
        <DrawerFooter>
          <Button>연락</Button>
          <DrawerClose>
            <Button className="w-full" variant="outline">
              취소
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

_002.definition = {
  type: "template",
  name: "002",
  properties: userprops,
  version: "1.0.0",
  default: {},
  nodes: {},
} satisfies grida.program.document.template.TemplateDocumentDefinition;
