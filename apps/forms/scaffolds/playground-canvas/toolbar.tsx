"use client";

import { generate } from "@/app/(dev)/canvas/actions";
import { useDocument, useEventTarget, type CursorMode } from "@/grida-canvas";
import { OpenAILogo } from "@/components/logos/openai";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { grida } from "@/grida";
import { useMetaEnter } from "@/hooks/use-meta-enter";
import {
  SlashIcon,
  BoxIcon,
  Pencil1Icon,
  ChatBubbleIcon,
  CircleIcon,
  CursorArrowIcon,
  FrameIcon,
  ImageIcon,
  LightningBoltIcon,
  MagicWandIcon,
  MixIcon,
  PlusIcon,
  TextIcon,
} from "@radix-ui/react-icons";
import { PopoverClose } from "@radix-ui/react-popover";
import { useLocalStorage } from "@uidotdev/usehooks";
import { readStreamableValue } from "ai/rsc";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CANVAS_PLAYGROUND_LOCALSTORAGE_PREFERENCES_BASE_AI_PROMPT_KEY } from "./k";
import { PenToolIcon } from "lucide-react";

function useGenerate() {
  const streamGeneration = useCallback(
    (
      prompt: string,
      streamdelta: (delta: {} | undefined) => void,
      onComplete?: () => void
    ) => {
      generate(prompt)
        .then(async ({ output }) => {
          for await (const delta of readStreamableValue(output)) {
            streamdelta(delta);
          }
        })
        .finally(() => {
          onComplete?.();
        });
    },
    []
  );

  return streamGeneration;
}

function useTextRewriteDemo() {
  const { state, changeNodeText } = useDocument();
  const [delta, setDelta] = useState<{} | undefined>();
  const [loading, setLoading] = useState(false);
  const [aiSettings] = useLocalStorage<string | undefined>(
    CANVAS_PLAYGROUND_LOCALSTORAGE_PREFERENCES_BASE_AI_PROMPT_KEY,
    undefined
  );

  const generate = useGenerate();

  // TODO: check if text is child of a component or instance.

  const editableTextNodes: Array<grida.program.nodes.TextNode> = useMemo(() => {
    return Object.values(state.document.nodes).filter(
      (node) => node.type === "text" && node.locked === false
    ) as Array<grida.program.nodes.TextNode>;
  }, [state.document.nodes]);

  const action = useCallback(
    (userprompt: string) => {
      setLoading(true);
      const payload = editableTextNodes.map((node) => {
        return {
          id: node.id,
          text: node.text,
          maxLength: node.maxLength,
          usermetadata: node.userdata,
        };
      });

      const prompt = `You are an AI in a canvas editor.

Generate new text content for the following text nodes:

\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\`

${
  aiSettings
    ? `
------
Additional developers provided prompt:
\`\`\`
${aiSettings}
\`\`\`
`
    : ""
}

------
Additional user provided prompt:
\`\`\`
${userprompt}
\`\`\`

    `;

      generate(
        prompt,
        (d) => {
          setDelta(d);
          const { changes } = d as any;
          changes?.forEach((change: { id: string; text: string }) => {
            if (!(change.id && change.text)) return;
            changeNodeText(change.id, change.text);
          });
        },
        () => {
          setLoading(false);
        }
      );
    },
    [changeNodeText, generate, editableTextNodes]
  );

  return { action, delta, loading };
}

export function PlaygroundToolbar({
  onAddButtonClick,
}: {
  onAddButtonClick?: () => void;
}) {
  const { setCursorMode, cursor_mode } = useEventTarget();

  return (
    <div className="rounded-full flex gap-4 border bg-background shadow px-4 py-2 pointer-events-auto">
      <ToggleGroup
        onValueChange={(v) => {
          setCursorMode(
            v
              ? toolbar_value_to_cursormode(v as ToolbarToolType)
              : { type: "cursor" }
          );
        }}
        value={cursormode_to_toolbar_value(cursor_mode)}
        defaultValue="cursor"
        type="single"
      >
        <ToggleGroupItem value={"cursor" satisfies ToolbarToolType}>
          <CursorArrowIcon />
        </ToggleGroupItem>
        <VerticalDivider />
        <ToggleGroupItem value={"container" satisfies ToolbarToolType}>
          <FrameIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value={"text" satisfies ToolbarToolType}>
          <TextIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value={"rectangle" satisfies ToolbarToolType}>
          <BoxIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value={"ellipse" satisfies ToolbarToolType}>
          <CircleIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value={"line" satisfies ToolbarToolType}>
          <SlashIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value={"pencil" satisfies ToolbarToolType}>
          <Pencil1Icon />
        </ToggleGroupItem>
        <ToggleGroupItem value={"path" satisfies ToolbarToolType}>
          <PenToolIcon className="w-3.5 h-3.5" />
        </ToggleGroupItem>
        <ToggleGroupItem value={"image" satisfies ToolbarToolType}>
          <ImageIcon />
        </ToggleGroupItem>
        <VerticalDivider />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" className="px-3">
              <OpenAILogo className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            sideOffset={16}
            align="end"
            className="w-96"
          >
            <Generate />
          </PopoverContent>
        </Popover>
        <Button variant="ghost" className="px-3" onClick={onAddButtonClick}>
          <MixIcon />
        </Button>
      </ToggleGroup>
    </div>
  );
}

function Generate() {
  const [userprompt, setUserPrompt] = useState("");
  const { action: textRewrite, loading } = useTextRewriteDemo();
  const ref = useMetaEnter<HTMLTextAreaElement>({
    onSubmit: () => textRewrite(userprompt),
  });

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        readOnly={loading}
        autoFocus
        ref={ref}
        value={userprompt}
        onChange={(e) => setUserPrompt(e.target.value)}
        placeholder="Enter a prompt"
        className="min-h-20"
      />
      <div className="flex justify-end">
        <PopoverClose asChild>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => {
              textRewrite(userprompt);
            }}
          >
            Rewrite ⌘↵
          </Button>
        </PopoverClose>
      </div>
    </div>
  );
}

const VerticalDivider = () => <div className="w-1 h-4 border-r" />;

type ToolbarToolType =
  | "cursor"
  | "rectangle"
  | "ellipse"
  | "text"
  | "container"
  | "image"
  | "line"
  | "pencil"
  | "path";

function cursormode_to_toolbar_value(cm: CursorMode): ToolbarToolType {
  switch (cm.type) {
    case "cursor":
      return "cursor";
    case "insert":
      return cm.node;
    case "draw":
      return cm.tool;
    case "path":
      return "path";
  }
}

function toolbar_value_to_cursormode(tt: ToolbarToolType): CursorMode {
  switch (tt) {
    case "cursor":
      return { type: "cursor" };
    case "container":
    case "ellipse":
    case "image":
    case "rectangle":
    case "text":
      return { type: "insert", node: tt };
    case "line":
    case "pencil":
      return { type: "draw", tool: tt };
    case "path":
      return { type: "path" };
  }
}
