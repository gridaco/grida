import { Button } from "@app/ui/components/button";
import { Input } from "@app/ui/components/input";
import type {
  NativeChatController,
  NativeChatView,
} from "@/lib/agent-chat/native-chat-controller";

export function NativeContextLimitPanel({
  controller,
  state,
}: {
  controller: NativeChatController;
  state: NativeChatView;
}) {
  const setting = state.contextLimit;
  const busy = state.contextLimitBusy;
  return (
    <section
      data-testid="workspace-context-limit"
      aria-label="Context input limit"
      className="flex flex-wrap items-center gap-2 border-y px-3 py-2 text-xs"
    >
      <p className="basis-full">
        <strong>Maximum context input</strong>
        {setting &&
          ` · ${setting.limit === null ? "Automatic" : `${setting.limit} tokens`}`}
      </p>
      <p className="basis-full text-muted-foreground">
        Applies to future accepted messages in this workspace.
        {setting &&
          !setting.exactCounting &&
          " The selected provider cannot verify a custom limit."}
        {setting?.source === "pending" &&
          " The stored setting changed and has not been applied."}
        {setting?.source === "invalid" &&
          " The stored setting is invalid. The current value is still active."}
      </p>
      {setting && setting.source !== "invalid" && (
        <>
          {setting.exactCounting && (
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void controller.saveContextLimit();
              }}
            >
              <Input
                aria-label="Maximum context input tokens"
                inputMode="numeric"
                className="h-7 w-32 text-xs md:text-xs"
                value={state.contextLimitDraft}
                maxLength={16}
                disabled={busy}
                onChange={(event) =>
                  controller.changeContextLimitDraft(event.currentTarget.value)
                }
              />
              <Button type="submit" size="xs" disabled={busy}>
                Save limit
              </Button>
            </form>
          )}
          {(setting.limit !== null || setting.source === "pending") && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={busy}
              onClick={() => void controller.saveContextLimit(true)}
            >
              Use Automatic
            </Button>
          )}
        </>
      )}
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={busy}
        onClick={() => void controller.refreshContextLimit()}
      >
        Refresh setting
      </Button>
      {state.contextLimitError && (
        <p role="alert" className="basis-full text-destructive">
          {state.contextLimitError}
        </p>
      )}
      {controller.canReviewConfiguration && !state.reviewConfiguration && (
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => controller.setConfigurationReview(true)}
        >
          Review settings permission on next Act send
        </Button>
      )}
    </section>
  );
}
