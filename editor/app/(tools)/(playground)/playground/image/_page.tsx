"use client";

import React, { useState, useMemo, useReducer } from "react";
import {
  ChatBoxFooter,
  ChatBox,
  ChatBoxSubmit,
  ChatBoxTextArea,
} from "@/components/chat";
import { CommandIcon } from "lucide-react";
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
import { GenerationImageFrame } from "./_components/image-frame";
import {
  useImageModelConfig,
  useGenerateImage,
  useCredits,
} from "@/lib/ai/hooks";
import {
  Align,
  Selection,
  Zoom,
} from "@/scaffolds/sidecontrol/sidecontrol-node-selection";
import {
  NodeHierarchyGroup,
  ScenesGroup,
} from "@/scaffolds/sidebar/sidebar-node-hierarchy-list";
import {
  StandaloneDocumentEditor,
  StandaloneSceneContent,
  ViewportRoot,
  EditorSurface,
  standaloneDocumentReducer,
  useDocument,
} from "@/grida-react-canvas";
import { FontFamilyListProvider } from "@/scaffolds/sidecontrol/controls/font-family";
import { useEditorHotKeys } from "@/grida-react-canvas/viewport/hotkeys";
import { useGoogleFontsList } from "@/grida-react-canvas/components/google-fonts";
import { EditorSurfaceDropzone } from "@/grida-react-canvas/viewport/surface-dropzone";
import { EditorSurfaceContextMenu } from "@/grida-react-canvas/viewport/surface-context-menu";
import { EditorSurfaceClipboardSyncProvider } from "@/grida-react-canvas/viewport/surface";
import { AutoInitialFitTransformer } from "@/grida-react-canvas/renderer";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/components/lib/utils";
import { ToolbarPosition } from "@/grida-react-canvas-starter-kit/starterkit-toolbar";
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
import { editor } from "@/grida-canvas";

export default function ImagePlayground() {
  const [state, dispatch] = useReducer(
    standaloneDocumentReducer,
    editor.state.init({
      editable: true,
      document: {
        nodes: {},
        scenes: {
          main: {
            type: "scene",
            id: "main",
            name: "main",
            children: [],
            guides: [],
            constraints: {
              children: "multiple",
            },
          },
        },
      },
    })
  );

  return (
    <main className="w-screen h-screen overflow-hidden select-none">
      <AuthProvider>
        <StandaloneDocumentEditor editable initial={state} dispatch={dispatch}>
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
  const credits = useCredits();
  const editor = useDocument();
  const [prompt, setPrompt] = useState("");
  const model = useImageModelConfig("black-forest-labs/flux-schnell");
  const { generate, key, loading, image, start, end } = useGenerateImage();

  const onCommit = (value: { text: string }) => {
    const id = editor.createNodeId();
    editor.insertNode({
      _$id: id,
      type: "image",
      name: value.text,
      width: model.width,
      height: model.height,
      fit: "cover",
    });
    setPrompt(value.text);
    generate({
      model: model.modelId,
      width: model.width,
      height: model.height,
      aspect_ratio: model.aspect_ratio,
      prompt: value.text,
    })
      .then((image) => {
        editor.changeNodeSrc(id, image.src);
      })
      .finally(() => {
        credits.refresh();
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
  const fonts = useGoogleFontsList();

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
        <hr />
        <Align />
      </SidebarHeader>
      <SidebarContent>
        <FontFamilyListProvider fonts={fonts}>
          <Selection />
        </FontFamilyListProvider>
      </SidebarContent>
    </Sidebar>
  );
}

function Credits({
  credits,
  className,
}: {
  credits: ReturnType<typeof useCredits>;
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
          <CommandIcon className="size-3" />
          <span className="text-sm font-mono">
            {credits.remaining?.toString()}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        <div className="text-sm font-mono">
          {credits.remaining?.toString()} free credits remaining
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
  credits: ReturnType<typeof useCredits> | null;
}) {
  const sizeGroups = useMemo(() => {
    const groups = {
      square: [] as ai.image.SizeSpec[],
      horizontal: [] as ai.image.SizeSpec[],
      vertical: [] as ai.image.SizeSpec[],
    };
    (model.card?.sizes ?? []).forEach((s) => {
      const [w, h, r] = s;
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
                {sizeGroups.square.map(([w, h, r]) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {sizeGroups.horizontal.length > 0 && (
              <SelectGroup>
                <SelectLabel>Horizontal</SelectLabel>
                {sizeGroups.horizontal.map(([w, h, r]) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {sizeGroups.vertical.length > 0 && (
              <SelectGroup>
                <SelectLabel>Vertical</SelectLabel>
                {sizeGroups.vertical.map(([w, h, r]) => (
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
                  <Badge className="flex items-center gap-1" variant="outline">
                    <CommandIcon className="size-3" />
                    {m.avg_credit}
                  </Badge>
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
          {credits && <Credits credits={credits} className="mr-2" />}
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
