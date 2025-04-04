"use client";

import React from "react";
import { ScreenRoot } from "@/theme/templates/kit/components";
import Hello from "./_flows/hello";
import Main from "./_flows/main";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Platform } from "@/lib/platform";

export default function InvitationPage({
  data,
}: {
  data: Platform.WEST.Referral.InvitationPublicRead;
}) {
  const { is_claimed, referrer_name: _referrer_name } = data;
  const referrer_name = _referrer_name || "?";
  const is_first_time = !is_claimed;
  const [open, setOpen] = React.useState(is_first_time);

  return (
    <ScreenRoot>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.DialogContent className="fixed inset-0 p-0 border-none outline-none bg-background data-[state=closed]:animate-out data-[state=closed]:fade-out-0 z-10">
            <DialogPrimitive.Title className="sr-only">
              Overlay
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              UX Overlay
            </DialogPrimitive.Description>
            <Hello
              data={{
                referrer: referrer_name ?? "Unknown",
              }}
              onOpenChange={setOpen}
            />
          </DialogPrimitive.DialogContent>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <Main data={data} />
    </ScreenRoot>
  );
}
