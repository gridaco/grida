"use client";

import { Button } from "@/components/ui/button";
import React from "react";
import {
  ScreenBackground,
  ScreenCenter,
  ScreenRoot,
  TextAlign,
} from "@/theme/templates/kit/components";
import Image from "next/image";

export default function _003() {
  return (
    <ScreenRoot>
      <ScreenCenter>
        <section className="px-4 max-w-screen-sm">
          <TextAlign align="center">
            <div className="flex flex-col justify-center items-center gap-4">
              <h1 className="text-6xl font-bold">
                Help us build future of forms
              </h1>
              <p className="text-lg text-muted-foreground w-4/5">
                Your feedback will directly influence the prioritization of our
                upcoming features.
              </p>
            </div>
          </TextAlign>
          <div className="flex justify-center items-center p-4 py-10">
            <Button>Start Now</Button>
          </div>
        </section>
        <ScreenBackground overlay={{ opacity: 0.1 }}>
          <Image
            src="/images/abstract-placeholder.jpg"
            alt="background"
            width={1000}
            height={1000}
            className="w-full h-full object-cover"
          />
        </ScreenBackground>
      </ScreenCenter>
    </ScreenRoot>
  );
}
