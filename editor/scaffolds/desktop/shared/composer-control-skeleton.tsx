import { Skeleton } from "@app/ui/components/skeleton";
import { cn } from "@app/ui/lib/utils";
import { composerToolbarButtonClassName } from "@/kits/composer";

export const composerAccessLabelClassName = "hidden @[26rem]:inline";
export const composerAccessReviewLabel = "Ask for approval";

export function ComposerControlSkeleton({
  kind,
}: {
  kind: "model" | "access";
}) {
  const model = kind === "model";
  return (
    <div
      role="status"
      aria-label={model ? "Loading models…" : "Checking access…"}
      className={cn(
        composerToolbarButtonClassName,
        "flex items-center px-1.5",
        model ? "w-32 min-w-16 shrink" : "shrink-0"
      )}
    >
      <Skeleton
        aria-hidden
        className={cn(
          "h-2.5 bg-foreground/10 motion-reduce:animate-none",
          model ? "min-w-0 flex-1" : "min-w-3.5"
        )}
      >
        {/* Reserve the text, icon and gap for the manual review label. */}
        {!model && (
          <span
            className={cn(
              "invisible whitespace-nowrap pl-4.5 text-xs font-medium",
              composerAccessLabelClassName
            )}
          >
            {composerAccessReviewLabel}
          </span>
        )}
      </Skeleton>
    </div>
  );
}
