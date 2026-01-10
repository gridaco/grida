import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerTitle,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
} from "@/components/ui2/drawer";
import { TemplateData } from "../templates";

const dictionary = {
  en: {
    confirm: "I have read and agree to the terms and conditions",
    cancel: "Cancel",
  },
  ko: {
    confirm: "위 내용을 확인하였습니다",
    cancel: "취소",
  },
};

export default function ShareDialog({
  data,
  onConfirm,
  locale,
  ...props
}: React.ComponentProps<typeof Drawer> & {
  data: TemplateData.West_Referrral__Duo_001["components"]["referrer-share"];
  locale: TemplateData.West_Referrral__Duo_001["locale"];
  onConfirm?: () => Promise<void>;
}) {
  const [confirmed, setConfirmed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const t = dictionary[locale];
  const onConfirmClick = async () => {
    setBusy(true);
    onConfirm?.().finally(() => {
      setBusy(false);
    });
  };

  return (
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
            <Button onClick={onConfirmClick} disabled={!confirmed || busy}>
              {busy && <Spinner className="me-2" />}
              {data?.cta ?? "Share"}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline">{t.cancel}</Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
