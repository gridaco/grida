"use client";

import React from "react";
import {
  ScreenMobileFrame,
  ScreenRoot,
  ScreenScrollable,
} from "@/theme/templates/kit/components";
import { mock } from "../../../data";
import { notFound } from "next/navigation";
import Hello from "./hello";
import Main from "./main";

type Params = {
  cid: string;
};

export default function Join({ params }: { params: Params }) {
  const [stage, setStage] = React.useState(0);

  const d = mock.find((c) => c.cid === params.cid);
  if (!d) {
    return notFound();
  }

  return (
    <ScreenRoot>
      <ScreenMobileFrame>
        <ScreenScrollable>
          {stage === 0 && <Hello data={d} onNext={() => setStage(1)} />}
          {stage === 1 && <Main />}
        </ScreenScrollable>
      </ScreenMobileFrame>
    </ScreenRoot>
  );
}
