"use client";
import React from "react";
import Portal from "./_flows/page";
import { ScreenWindowRoot } from "@/theme/templates/kit/components";

export default function Home() {
  return (
    <ScreenWindowRoot>
      <Portal />
    </ScreenWindowRoot>
  );
}
