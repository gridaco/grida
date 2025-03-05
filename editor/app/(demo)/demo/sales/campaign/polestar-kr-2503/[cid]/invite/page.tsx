"use client";

import React from "react";
import { ScreenWindowRoot } from "@/theme/templates/kit/components";
import TMP_Invite from "./component";

export default function Page({
  params,
}: {
  params: {
    cid: string;
  };
}) {
  return (
    <ScreenWindowRoot>
      <TMP_Invite params={params} />
    </ScreenWindowRoot>
  );
}
