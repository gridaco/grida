import { cn } from "@app/ui/lib/utils";
import { ToolOutput } from "@app/ui/ai-elements/tool";
import type { ToolCallEntry } from "@/lib/agent-chat";
import { SurfaceToolCall } from "./surface-tool";

export function isSurfaceToolEntry(entry: ToolCallEntry): boolean {
  return SurfaceToolCall.from(entry) !== null;
}

export function hasOpenTabsResult(entry: ToolCallEntry): boolean {
  return (
    entry.state === "output-available" &&
    SurfaceToolCall.from(entry)?.data.kind === "list"
  );
}

export function SurfaceToolContent({ entry }: { entry: ToolCallEntry }) {
  const call = SurfaceToolCall.from(entry);
  if (!call) return null;

  if (entry.state === "output-error" || entry.state === "output-denied") {
    return <ToolOutput output={undefined} errorText={entry.errorText} />;
  }

  if (call.data.kind === "open") {
    return (
      <div className="mt-1 space-y-1">
        {call.data.path && (
          <div
            className="truncate font-mono text-[11px] text-muted-foreground"
            title={call.data.path}
          >
            {call.data.path}
          </div>
        )}
        {call.data.requested === false && (
          <p className="text-[11px] text-muted-foreground">
            Tabs aren&apos;t available here.
          </p>
        )}
      </div>
    );
  }

  if (
    entry.state === "input-streaming" ||
    entry.state === "input-available" ||
    entry.state === "approval-requested" ||
    entry.state === "approval-responded"
  ) {
    return (
      <p className="mt-1 text-[11px] text-muted-foreground">
        Checking open tabs…
      </p>
    );
  }

  if (call.data.interactive === false) {
    return (
      <p className="mt-1 text-[11px] text-muted-foreground">
        Tabs aren&apos;t available here.
      </p>
    );
  }

  if (call.data.open.length === 0) {
    return (
      <p className="mt-1 text-[11px] text-muted-foreground">No tabs open.</p>
    );
  }

  const { active, open } = call.data;
  return (
    <div className="mt-1 max-h-36 space-y-0.5 overflow-y-auto pr-1">
      {open.map((path) => {
        const isActive = path === active;
        return (
          <div
            key={path}
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-sm px-1.5 py-1 text-[11px]",
              isActive ? "bg-muted text-foreground" : "text-muted-foreground"
            )}
          >
            <span className="min-w-0 flex-1 truncate font-mono" title={path}>
              {path}
            </span>
            {isActive && (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                Active
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
