"use client";

import React, { useMemo, useTransition } from "react";
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
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { useImageModelConfig } from "@/lib/ai/hooks";
import { generateAiImage } from "@/lib/ai/actions/image-generate";
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
import { cn } from "@/components/lib/utils";
import { ToolbarPosition } from "@/grida-canvas-react-starter-kit/starterkit-toolbar";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import ai from "@/lib/ai";
import { Badge } from "@/components/ui/badge";
import {
  useContinueWithAuth,
  AuthProvider,
} from "@/host/auth/use-continue-with-auth";
import { useEditor } from "@/grida-canvas-react";

export default function ImagePlayground() {
  const instance = useEditor();

  return (
    <main className="w-screen h-screen overflow-hidden select-none">
      <AuthProvider>
        <StandaloneDocumentEditor editor={instance}>
          <CanvasConsumer />
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

function CanvasConsumer() {
  const { withAuth, session } = useContinueWithAuth();
  const credits = useAiCredits();
  const editor = useCurrentEditor();
  const model = useImageModelConfig("openai/gpt-image-1-mini");
  const [loading, startGenerate] = useTransition();

  const onCommit = (value: { text: string }) => {
    const id = editor.commands.insertNode({
      type: "image",
      name: value.text,
      layout_target_width: model.width,
      layout_target_height: model.height,
      fit: "cover",
    });
    startGenerate(async () => {
      try {
        const env = await generateAiImage({
          model: model.modelId,
          width: model.width,
          height: model.height,
          aspect_ratio: model.aspect_ratio,
          prompt: value.text,
        });
        const data = credits.consume(env, { next: "/playground/image" });
        if (!data) {
          // gate / redirect handled by credits.consume; remove orphan node
          editor.commands.delete([id]);
          return;
        }
        editor.commands.changeNodePropertySrc(id, data.publicUrl);
      } catch (e) {
        console.error(e);
        editor.commands.delete([id]);
      }
    });
  };

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
                      onCommit={withAuth(onCommit)}
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
  const shell = (content: React.ReactNode) => (
    <div
      className={cn(
        "px-2 py-1 bg-secondary rounded-md flex gap-1 items-center pointer-events-auto",
        className
      )}
    >
      <span className="text-sm font-mono">{content}</span>
    </div>
  );
  // BYOK: no balance to show — own key pays.
  if (credits.mode === "byok") {
    return shell("BYOK");
  }
  return (
    <Tooltip>
      <TooltipTrigger>{shell(credits.formatted ?? "—")}</TooltipTrigger>
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
  credits,
}: {
  model: ReturnType<typeof useImageModelConfig>;
  loading: boolean;
  onCommit: (value: {
    text: string;
  }) => Promise<void> | Promise<false> | void | false;
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
    </div>
  );
}

function Hotkyes() {
  useEditorHotKeys();

  return <></>;
}
