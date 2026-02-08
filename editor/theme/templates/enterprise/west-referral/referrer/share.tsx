"use client";

import * as React from "react";
import type { WebSharePayload } from "@/components/dialogs/share-dialog";
import { ShareDrawerDialog } from "@/components/dialogs/share-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerTitle,
  DrawerContent,
  DrawerFooter,
} from "@/components/ui2/drawer";
import { TemplateData } from "../templates";

const dictionary = {
  en: {
    confirm: "I have read and agree to the terms and conditions",
    continue: "Continue",
  },
  ko: {
    confirm: "위 내용을 확인하였습니다",
    continue: "계속",
  },
};

/**
 * Referral-specific share dialog with a two-step flow:
 *
 * 1. **Consent drawer** – shows article HTML, checkbox, and a confirm CTA.
 * 2. On confirm → calls `onPrepare` (async, e.g. create invitation link).
 * 3. **Share drawer** – universal `ShareDrawerDialog` with the prepared payload.
 */
export default function ShareDialog({
  data,
  onPrepare,
  locale,
  ...props
}: React.ComponentProps<typeof Drawer> & {
  data: TemplateData.West_Referrral__Duo_001["components"]["referrer-share"];
  locale: TemplateData.West_Referrral__Duo_001["locale"];
  onPrepare?: () => Promise<WebSharePayload>;
}) {
  const [confirmed, setConfirmed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [prepared, setPrepared] = React.useState<WebSharePayload | null>(null);
  const [shareOpen, setShareOpen] = React.useState(false);

  const t = dictionary[locale];
  const consentOpen = (props as { open?: boolean }).open;

  // Reset everything when the consent drawer opens fresh.
  React.useEffect(() => {
    if (!consentOpen) return;
    setConfirmed(false);
    setBusy(false);
    setPrepared(null);
    setShareOpen(false);
  }, [consentOpen]);

  const onContinueClick = async () => {
    setBusy(true);
    try {
      const next = await onPrepare?.();
      if (next) {
        setPrepared(next);
        // Close consent drawer, open share drawer.
        props.onOpenChange?.(false);
        setShareOpen(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Step 1: consent drawer */}
      <Drawer {...props} data-testid="west-referral-referrer-share-dialog">
        <DrawerTitle className="sr-only">Share</DrawerTitle>
        <DrawerContent>
          <div className="mx-auto w-full">
            <article
              className="p-4 prose prose-sm dark:prose-invert"
              dangerouslySetInnerHTML={{
                __html: data?.article?.html ?? "",
              }}
            />
            <section className="p-4">
              <div className="flex flex-col gap-4">
                <label className="flex items-center gap-2">
                  <Checkbox
                    id="confirm-check"
                    onCheckedChange={(checked) => setConfirmed(!!checked)}
                  />
                  <span className="text-sm text-muted-foreground">
                    {data?.consent ?? t.confirm}
                  </span>
                </label>
              </div>
            </section>
            <DrawerFooter className="pt-2">
              <Button onClick={onContinueClick} disabled={!confirmed || busy}>
                {busy && <Spinner className="me-2" />}
                {data?.cta ?? t.continue}
              </Button>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Step 2: universal share drawer */}
      <ShareDrawerDialog
        open={shareOpen}
        onOpenChange={(next) => {
          setShareOpen(next);
          if (!next) setPrepared(null);
        }}
        locale={locale}
        payload={prepared}
        testId="west-referral-referrer-share-actions-drawer"
      />
    </>
  );
}
