import { useCallback, useState } from "react";
import type {
  NativeChatArtifactSaveResult,
  NativeChatImageArtifact,
  NativeChatTurnSummary,
} from "@grida/desktop-bridge";
import type { NativeChatController } from "@/lib/agent-chat/native-chat-controller";
import { FullscreenImagePreview } from "@/kits/image-preview";

/** Images the latest turn produced, shown inline after its answer. */
export function NativeTurnArtifacts({
  summary,
  controller,
}: {
  summary: NativeChatTurnSummary;
  controller: NativeChatController;
}) {
  if (!summary.artifacts?.length) return null;
  return (
    <ul className="space-y-1 text-xs">
      {summary.artifacts.map((artifact) => (
        <li key={artifact.id}>
          <CropPreview
            artifact={artifact}
            controller={controller}
            turnId={summary.turnId}
          />
        </li>
      ))}
    </ul>
  );
}

function CropPreview({
  artifact,
  controller,
  turnId,
}: {
  artifact: NativeChatImageArtifact;
  controller: NativeChatController;
  turnId: string;
}) {
  const load = useCallback(
    () => controller.readTurnArtifact(turnId, artifact.id),
    [controller, turnId, artifact.id]
  );
  const [saveStatus, setSaveStatus] = useState<
    NativeChatArtifactSaveResult | "saving" | "unavailable" | null
  >(null);
  const save = async () => {
    setSaveStatus("saving");
    try {
      setSaveStatus(await controller.saveTurnArtifact(turnId, artifact.id));
    } catch {
      setSaveStatus("unavailable");
    }
  };
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <FullscreenImagePreview
        loadImage={load}
        alt={artifact.label}
        downloadName="cropped.png"
        className="cursor-pointer underline underline-offset-2"
      >
        Preview cropped PNG ({artifact.width} × {artifact.height})
      </FullscreenImagePreview>
      {controller.canSaveTurnArtifact && (
        <button
          type="button"
          className="cursor-pointer underline underline-offset-2 disabled:opacity-50"
          disabled={saveStatus === "saving"}
          onClick={() => void save()}
        >
          {saveStatus === "failed" ? "Retry save" : "Save PNG as…"}
        </button>
      )}
      {saveStatus === "saving" && <span role="status">Saving…</span>}
      {saveStatus === "saved" && <span role="status">Saved a copy.</span>}
      {saveStatus === "failed" && (
        <span role="status">
          Couldn’t save a copy. The crop is still in this chat. Choose a new
          file to retry.
        </span>
      )}
      {saveStatus === "unavailable" && (
        <span role="status">This crop is unavailable to save.</span>
      )}
    </div>
  );
}
