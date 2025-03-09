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
import data from "./data.json";
import { ACME } from "@/components/logos/acme";

export default function Portal() {
  return (
    <ScreenRoot>
      <ScreenMobileFrame>
        <ScreenScrollable>
          <main className="flex w-full h-full flex-col items-center justify-center p-4 bg-gray-100 dark:bg-gray-800">
            <div className="w-full max-w-md bg-background rounded-lg shadow-md pb-6 space-y-6">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.media.src}
                  alt={data.media.alt}
                  className="object-cover aspect-square select-none pointer-events-none rounded-t-lg"
                />
                <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-center">
                  {/* <PolestarTypeLogo className="absolute top-7 left-1/2 transform -translate-x-1/2 h-[20px] w-auto" /> */}
                  <ACME />
                </div>
              </div>
              <div className="flex flex-col gap-3 px-4">
                <h1 className="text-xl font-semibold text-center">
                  {data.title}
                </h1>

                <p className="text-center text-sm text-muted-foreground">
                  {data.description}
                </p>
              </div>
              <div className="flex w-full mx-auto items-center justify-center">
                <Dialog>
                  <DialogTrigger>
                    <Button>{data.trigger.label}</Button>
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
