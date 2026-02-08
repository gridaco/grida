"use client";

import * as React from "react";
import { toast } from "sonner";
import { Copy, Mail, MessageSquareText, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Drawer, DrawerTitle, DrawerContent } from "@/components/ui/drawer";

export type WebSharePayload = {
  title?: string;
  text?: string;
  url?: string;
};

export type ShareDialogLocale = "en" | "ko";

type ShareDialogStrings = {
  share: string;
  message: string;
  email: string;
  more: string;
  copy: string;
  copy_done: string;
};

const STRINGS: Record<ShareDialogLocale, ShareDialogStrings> = {
  en: {
    share: "Share",
    message: "Message",
    email: "Email",
    more: "More…",
    copy: "Copy",
    copy_done: "Copied to clipboard",
  },
  ko: {
    share: "공유하기",
    message: "메시지",
    email: "이메일",
    more: "더보기…",
    copy: "복사",
    copy_done: "복사되었습니다",
  },
};

function buildShareText(payload: WebSharePayload): string {
  const parts = [payload.title, payload.text, payload.url]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  return parts.join("\n").trimEnd();
}

function buildSmsHref(body: string): string {
  // iOS prefers `sms:&body=...`, while other platforms commonly use `sms:?body=...`.
  const ua =
    typeof navigator !== "undefined" ? (navigator.userAgent ?? "") : "";
  const isIOS = /\b(iPad|iPhone|iPod)\b/i.test(ua);
  const encoded = encodeURIComponent(body);
  return isIOS ? `sms:&body=${encoded}` : `sms:?body=${encoded}`;
}

function buildMailtoHref({
  subject,
  body,
}: {
  subject?: string;
  body: string;
}): string {
  // Manually encode with encodeURIComponent so spaces become '%20' (not '+')
  // per RFC 6068.
  const pairs: string[] = [];
  if (subject) pairs.push(`subject=${encodeURIComponent(subject)}`);
  pairs.push(`body=${encodeURIComponent(body)}`);
  return `mailto:?${pairs.join("&")}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export type ShareDrawerAction = "sms" | "email" | "native" | "copy";

export function ShareDrawerDialog({
  open,
  onOpenChange,
  locale = "en",
  labels,
  payload,
  description,
  actions,
  toastOnCopy = true,
  closeOnCopy = true,
  onCopied,
  testId,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  locale?: ShareDialogLocale;
  labels?: Partial<ShareDialogStrings>;
  payload: WebSharePayload | null | undefined;
  description?: React.ReactNode;
  /**
   * Which share actions to show. Defaults to all.
   */
  actions?: ShareDrawerAction[];
  /**
   * Show a toast when copy succeeds. Defaults to true.
   */
  toastOnCopy?: boolean;
  /**
   * Close the drawer on successful copy. Defaults to true.
   */
  closeOnCopy?: boolean;
  /**
   * Callback invoked after successful copy.
   */
  onCopied?: (copiedText: string) => void;
  testId?: string;
}) {
  const t = React.useMemo(
    () => ({ ...STRINGS[locale], ...(labels ?? {}) }),
    [locale, labels]
  );

  const shareText = React.useMemo(() => {
    if (!payload) return "";
    return buildShareText(payload);
  }, [payload]);

  const enabledActions = React.useMemo<ShareDrawerAction[]>(
    () => actions ?? ["sms", "email", "native", "copy"],
    [actions]
  );
  const has = React.useCallback(
    (a: ShareDrawerAction) => enabledActions.includes(a),
    [enabledActions]
  );

  const onCopyClick = async () => {
    if (!shareText) return;
    const ok = await copyToClipboard(shareText);
    if (!ok) return;
    if (toastOnCopy) toast.success(t.copy_done);
    onCopied?.(shareText);
    if (closeOnCopy) onOpenChange?.(false);
  };

  const onNativeShareClick = async () => {
    if (!payload) return;
    if (typeof navigator.share !== "function") return;
    await navigator.share({
      title: payload.title?.trim(),
      text: payload.text?.trimEnd(),
      url: payload.url?.trim(),
    });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} data-testid={testId}>
      <DrawerTitle className="sr-only">Share</DrawerTitle>
      <DrawerContent>
        <div className="mx-auto w-full">
          {description && <div className="p-4">{description}</div>}

          <section className="p-4 space-y-4">
            <div className="text-sm font-medium">{t.share}</div>

            {(has("sms") || has("email") || has("native")) && (
              <div className="grid grid-cols-3 gap-3">
                {has("sms") && (
                  <div className="flex flex-col items-center gap-1">
                    <Button
                      asChild
                      type="button"
                      variant="secondary"
                      size="icon-lg"
                      disabled={!shareText}
                      className="rounded-full"
                    >
                      <a href={buildSmsHref(shareText)} aria-label={t.message}>
                        <MessageSquareText className="size-5" />
                      </a>
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {t.message}
                    </span>
                  </div>
                )}

                {has("email") && (
                  <div className="flex flex-col items-center gap-1">
                    <Button
                      asChild
                      type="button"
                      variant="secondary"
                      size="icon-lg"
                      disabled={!shareText}
                      className="rounded-full"
                    >
                      <a
                        href={buildMailtoHref({
                          subject: payload?.title?.trim(),
                          body: shareText,
                        })}
                        aria-label={t.email}
                      >
                        <Mail className="size-5" />
                      </a>
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {t.email}
                    </span>
                  </div>
                )}

                {has("native") && (
                  <div className="flex flex-col items-center gap-1">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-lg"
                      onClick={() => onNativeShareClick().catch(() => {})}
                      disabled={
                        !shareText || typeof navigator.share !== "function"
                      }
                      className="rounded-full"
                      aria-label={t.more}
                    >
                      <MoreHorizontal className="size-5" />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {t.more}
                    </span>
                  </div>
                )}
              </div>
            )}

            {has("copy") && (
              <>
                <Separator />
                <div>
                  <Item
                    asChild
                    variant="default"
                    size="sm"
                    className="w-full cursor-pointer select-none"
                  >
                    <button
                      type="button"
                      onClick={onCopyClick}
                      disabled={!shareText}
                      aria-disabled={!shareText}
                      className="w-full text-left"
                    >
                      <ItemMedia variant="icon">
                        <Copy className="size-4" />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>{t.copy}</ItemTitle>
                      </ItemContent>
                    </button>
                  </Item>
                </div>
              </>
            )}
          </section>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
