"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { PolestarTypeLogo } from "@/components/logos";
import {
  ScreenMobileFrame,
  ScreenRoot,
  ScreenScrollable,
} from "@/theme/templates/kit/components";
import Verify from "./step-verify";

export default function Portal() {
  return (
    <ScreenRoot>
      <ScreenMobileFrame>
        <ScreenScrollable>
          <main className="flex w-full h-full flex-col items-center justify-center p-4 bg-gray-100">
            <div className="w-full max-w-md bg-white rounded-lg shadow-md pb-6 space-y-6">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://www.polestar.com/dato-assets/11286/1725964311-pak_home_image-card_pc.jpeg?q=35&dpr=2&w=542"
                  alt="Polestar 4"
                  className="object-cover aspect-square select-none pointer-events-none rounded-t-lg"
                />
                <PolestarTypeLogo className="absolute top-7 left-1/2 transform -translate-x-1/2 h-[20px] w-auto" />
              </div>
              <div className="flex flex-col gap-3">
                <h1 className="text-xl font-semibold text-center text-gray-800">
                  폴스타 추천 이벤트
                </h1>

                <p className="text-center text-sm text-gray-600">
                  폴스타 오너님을 위한 특별한 추천 이벤트에 참여하세요. <br />{" "}
                  친구나 가족에게 폴스타를 소개하고 특별한 혜택을 받으세요.
                </p>
              </div>
              <div className="flex w-full mx-auto items-center justify-center">
                <Dialog>
                  <DialogTrigger>
                    <Button className=" rounded-none shadow-none">
                      인증 및 링크 받기
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="min-h-screen max-w-none">
                    <Verify />
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </main>
        </ScreenScrollable>
      </ScreenMobileFrame>
    </ScreenRoot>
  );
}
