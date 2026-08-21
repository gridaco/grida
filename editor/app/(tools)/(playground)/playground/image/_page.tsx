"use client";

import React, { useMemo, useState } from "react";
import {
  ChatBoxFooter,
  ChatBox,
  ChatBoxSubmit,
  ChatBoxTextArea,
} from "@/components/chat";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@app/ui/components/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@app/ui/components/select";
import { useImageModelConfig } from "@/lib/ai/hooks";
import {
  generateAiImage,
  type GenerateAiImageInput,
} from "@/lib/ai/actions/image-generate";
import { useAiCredits } from "@/lib/ai/credits";
import {
  Selection,
  Zoom,
} from "@/scaffolds/sidecontrol/sidecontrol-node-selection";
import {
  ScenesGroup,
  NodeHierarchyGroup,
} from "@/grida-canvas-react-starter-kit/starterkit-hierarchy";
import {
  StandaloneDocumentEditor,
  StandaloneSceneContent,
  ViewportRoot,
  EditorSurface,
  AutoInitialFitTransformer,
  useCurrentEditor,
  useEditorState,
} from "@/grida-canvas-react";
import { FontFamilyListProvider } from "@/scaffolds/sidecontrol/controls/font-family";
import { useEditorHotKeys } from "@/grida-canvas-react/viewport/hotkeys";
import { EditorSurfaceDropzone } from "@/grida-canvas-react/viewport/surface-dropzone";
import { EditorSurfaceContextMenu } from "@/grida-canvas-react/viewport/surface-context-menu";
import { EditorSurfaceClipboardSyncProvider } from "@/grida-canvas-react/viewport/surface";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@app/ui/lib/utils";
import { ToolbarPosition } from "@/grida-canvas-react-starter-kit/starterkit-toolbar";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@app/ui/components/sidebar";
import ai from "@/lib/ai";
import { Badge } from "@app/ui/components/badge";
import { Button } from "@app/ui/components/button";
import {
  useContinueWithAuth,
  AuthProvider,
} from "@/host/auth/use-continue-with-auth";
import { useEditor } from "@/grida-canvas-react";
import type { models } from "@grida/ai-models";
// GRIDA-EE: entitlement — retain and remedy hosted-AI refusals.
import { AiRunGate, useAiRunGate } from "@/kits/ai-run-gate-hosted";
import { resolveSessionAiRunRemedy } from "@/kits/ai-run-gate-hosted/server";

const DEFAULT_MODEL_ID = "openai/gpt-image-1-mini" as const;

export default function ImagePlayground({
  initialModelId = DEFAULT_MODEL_ID,
}: {
  initialModelId?: models.image.ImageModelId;
}) {
  const instance = useEditor();

  return (
    <main className="w-screen h-screen overflow-hidden select-none">
      <AuthProvider>
        <StandaloneDocumentEditor editor={instance}>
          <CanvasConsumer initialModelId={initialModelId} />
        </StandaloneDocumentEditor>
      </AuthProvider>
    </main>
  );

  // return (
  //   <div className="relative w-full min-h-screen h-screen overflow-hidden">
  //     <main className="w-full h-full flex flex-col container max-w-xl mx-auto p-4">
  //       <div className="flex-1 flex flex-col items-center justify-center">
  //         {(loading || image) && (
  //           <GenerationImageFrame
  //             key={key}
  //             start={start}
  //             end={end}
  //             width={model.width}
  //             height={model.height}
  //             image={image}
  //             className="w-full overflow-scroll shadow-lg"
  //           />
  //         )}
  //       </div>
  //     </main>
  //   </div>
  // );
}

function CanvasConsumer({
  initialModelId,
}: {
  initialModelId: models.image.ImageModelId;
}) {
  const { withAuth, session } = useContinueWithAuth();
  const credits = useAiCredits();
  const editor = useCurrentEditor();
  const model = useImageModelConfig(initialModelId);
  const [loading, setLoading] = useState(false);
  const gate = useAiRunGate<GenerateAiImageInput>(resolveSessionAiRunRemedy);

  const run = async (
    invocation: GenerateAiImageInput
  ): Promise<void | false> => {
    gate.clear();
    setLoading(true);
    const id = editor.commands.insertNode({
      type: "image",
      name: invocation.prompt,
      layout_target_width: invocation.width ?? 1024,
      layout_target_height: invocation.height ?? 1024,
      fit: "cover",
    });

    try {
      const env = await generateAiImage(invocation);
      if (!env.success) {
        editor.commands.delete([id]);
        return await gate.refuse(env, invocation);
      }

      const data = credits.consume(env);
      if (!data) {
        editor.commands.delete([id]);
        return gate.fail(invocation);
      }

      editor.commands.changeNodePropertySrc(id, data.publicUrl);
    } catch (error) {
      console.error(error);
      editor.commands.delete([id]);
      return gate.fail(invocation);
    } finally {
      setLoading(false);
    }
  };

  const runWithAuth = withAuth(run);
  const onCommit = (value: { text: string }) =>
    runWithAuth({
      model: model.modelId,
      width: model.width,
      height: model.height,
      aspect_ratio: model.aspect_ratio,
      prompt: value.text,
    });

  return (
    <>
      <Hotkyes />
      <SidebarLeft />
      <div className="fixed inset-0 flex w-full h-full">
        <EditorSurfaceClipboardSyncProvider>
          <EditorSurfaceDropzone>
            <EditorSurfaceContextMenu>
              <div className="w-full h-full flex flex-col relative bg-black/5">
                <ViewportRoot className="relative w-full h-full overflow-hidden">
                  <EditorSurface />
                  <AutoInitialFitTransformer>
                    <StandaloneSceneContent />
                  </AutoInitialFitTransformer>
                  <ToolbarPosition>
                    {/* <Toolbar /> */}
                    <Chat
                      model={model}
                      loading={loading}
                      onCommit={onCommit}
                      failure={gate.failure}
                      onRetry={() => {
                        if (gate.failure) {
                          runWithAuth(gate.failure.invocation);
                        }
                      }}
                      credits={session ? credits : null}
                    />
                  </ToolbarPosition>
                </ViewportRoot>
              </div>
            </EditorSurfaceContextMenu>
          </EditorSurfaceDropzone>
        </EditorSurfaceClipboardSyncProvider>
      </div>
      <SidebarRight />
    </>
  );
}

function SidebarLeft() {
  return (
    <Sidebar side="left" variant="floating">
      <SidebarContent>
        <ScenesGroup />
        <hr />
        <NodeHierarchyGroup />
      </SidebarContent>
    </Sidebar>
  );
}

function SidebarRight() {
  const editor = useCurrentEditor();
  const fonts = useEditorState(editor, (state) => state.webfontlist.items);

  return (
    <Sidebar side="right" variant="floating">
      <SidebarHeader className="border-b">
        <div className="flex items-center justify-end gap-2">
          <Zoom
            className={cn(
              WorkbenchUI.inputVariants({
                variant: "input",
                size: "xs",
              }),
              "w-auto"
            )}
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <FontFamilyListProvider fonts={fonts}>
          <Selection />
        </FontFamilyListProvider>
      </SidebarContent>
    </Sidebar>
  );
}

function BudgetBadge({
  credits,
  className,
}: {
  credits: ReturnType<typeof useAiCredits>;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger>
        <div
          className={cn(
            "px-2 py-1 bg-secondary rounded-md flex gap-1 items-center pointer-events-auto",
            className
          )}
        >
          <span className="text-sm font-mono">{credits.formatted ?? "—"}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        <div className="text-sm font-mono">
          {credits.formattedExact ?? "—"} balance
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function Chat({
  model,
  loading,
  onCommit,
  failure,
  onRetry,
  credits,
}: {
  model: ReturnType<typeof useImageModelConfig>;
  loading: boolean;
  onCommit: (value: { text: string }) => Promise<void | false> | void | false;
  failure: AiRunGate.Failure<GenerateAiImageInput> | null;
  onRetry: () => void;
  credits: ReturnType<typeof useAiCredits> | null;
}) {
  const sizeGroups = useMemo(() => {
    const groups = {
      square: [] as ai.image.SizeSpec[],
      horizontal: [] as ai.image.SizeSpec[],
      vertical: [] as ai.image.SizeSpec[],
    };
    (model.card?.sizes ?? []).forEach((s) => {
      const [w, h] = s;
      const key = w === h ? "square" : w > h ? "horizontal" : "vertical";
      groups[key].push(s);
    });
    return groups;
  }, [model.card]);

  return (
    <div className="min-w-96 flex flex-col gap-2 pointer-events-auto">
      <div className="flex items-center gap-2 rounded-lg p-1 border bg-muted">
        <Select
          value={model.aspect_ratio}
          onValueChange={(v) => model.setSize(v as ai.image.AspectRatioString)}
        >
          <SelectTrigger className="w-min border-none">
            <SelectValue placeholder="Select size" />
          </SelectTrigger>
          <SelectContent>
            {sizeGroups.square.length > 0 && (
              <SelectGroup>
                <SelectLabel>Square</SelectLabel>
                {sizeGroups.square.map(([, , r]) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {sizeGroups.horizontal.length > 0 && (
              <SelectGroup>
                <SelectLabel>Horizontal</SelectLabel>
                {sizeGroups.horizontal.map(([, , r]) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {sizeGroups.vertical.length > 0 && (
              <SelectGroup>
                <SelectLabel>Vertical</SelectLabel>
                {sizeGroups.vertical.map(([, , r]) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        <Select
          value={model.modelId}
          onValueChange={(v) => model.select(v as ai.image.ImageModelId)}
        >
          <SelectTrigger className="w-min border-none">
            <SelectValue>{model.card?.label ?? "Select model"}</SelectValue>
          </SelectTrigger>
          <SelectContent className="min-w-52">
            {model.models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <div className="w-full flex items-center justify-between gap-2">
                  {m.label}
                  <Badge variant="outline">~{m.speed_max}</Badge>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ChatBox disabled={loading} onValueCommit={onCommit}>
        <ChatBoxTextArea />
        <ChatBoxFooter>
          <div className="flex-1" />
          {credits && <BudgetBadge credits={credits} className="mr-2" />}
          <ChatBoxSubmit />
        </ChatBoxFooter>
      </ChatBox>
      {failure && (
        <div
          role="alert"
          className="rounded-lg border bg-background p-3 text-sm shadow-sm"
        >
          <p className="text-muted-foreground">{failure.message}</p>
          {(failure.action || failure.retryable) && (
            <div className="mt-3 flex items-center gap-2">
              {failure.action && (
                <Button asChild size="sm">
                  <a
                    href={failure.action.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {failure.action.label}
                  </a>
                </Button>
              )}
              {failure.retryable && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  onClick={onRetry}
                >
                  Retry
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Hotkyes() {
  useEditorHotKeys();

  return <></>;
}
