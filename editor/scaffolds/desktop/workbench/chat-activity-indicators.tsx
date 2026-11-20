import { Badge } from "@app/ui/components/badge";
import { Spinner } from "@app/ui/components/spinner";
import type { ChatActivity } from "@/lib/agent-chat/native-chat-activity";

export function ChatActivityIndicators({ running, inputNeeded }: ChatActivity) {
  return (
    <>
      {running && <Spinner aria-label="Running" className="size-3.5" />}
      {inputNeeded && (
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          Input needed
        </Badge>
      )}
    </>
  );
}
