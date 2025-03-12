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
import * as DialogPrimitive from "@radix-ui/react-dialog";

type Params = {
  cid: string;
};

export default function Join({ params }: { params: Params }) {
  const [open, setOpen] = React.useState(true);
  const d = mock.find((c) => c.cid === params.cid);
  if (!d) {
    return notFound();
  }

  return (
    <ScreenRoot>
      <ScreenMobileFrame>
        <ScreenScrollable>
          <DialogPrimitive.Root defaultOpen={true}>
            <DialogPrimitive.Portal>
              <DialogPrimitive.DialogContent className="fixed inset-0 p-0 border-none bg-background data-[state=closed]:animate-out data-[state=closed]:fade-out-0">
                <DialogPrimitive.Title className="sr-only">
                  Title
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  Title
                </DialogPrimitive.Description>
                <Hello data={d} />
              </DialogPrimitive.DialogContent>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
          <Main />
        </ScreenScrollable>
      </ScreenMobileFrame>
    </ScreenRoot>
  );
}
