"use client";

import { generate } from "@/app/(dev)/canvas/actions";
import { useDocument, useEventTarget } from "@/grida-react-canvas";
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
  CircleIcon,
  CursorArrowIcon,
  HandIcon,
  FrameIcon,
  ImageIcon,
  MixIcon,
  TextIcon,
  CaretDownIcon,
} from "@radix-ui/react-icons";
import { PopoverClose } from "@radix-ui/react-popover";
import { useLocalStorage } from "@uidotdev/usehooks";
import { readStreamableValue } from "ai/rsc";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CANVAS_PLAYGROUND_LOCALSTORAGE_PREFERENCES_BASE_AI_PROMPT_KEY } from "./k";
import { PenToolIcon } from "lucide-react";
import {
  cursormode_to_toolbar_value,
  toolbar_value_to_cursormode,
  ToolbarToolType,
} from "@/grida-react-canvas/toolbar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

  const value = cursormode_to_toolbar_value(cursor_mode);

  return (
    <div className="rounded-full flex gap-4 border bg-background shadow px-4 py-2 pointer-events-auto select-none">
      <ToggleGroup
        onValueChange={(v) => {
          setCursorMode(
            v
              ? toolbar_value_to_cursormode(v as ToolbarToolType)
              : { type: "cursor" }
          );
        }}
        value={value}
        defaultValue="cursor"
        type="single"
      >
        <ToolsGroup
          value={value}
          options={[
            { value: "cursor", label: "Cursor", shortcut: "V" },
            { value: "hand", label: "Hand tool", shortcut: "H" },
          ]}
          onValueChange={(v) => {
            setCursorMode(toolbar_value_to_cursormode(v as ToolbarToolType));
          }}
        />
        <VerticalDivider />
        <ToggleGroupItem value={"container" satisfies ToolbarToolType}>
          <FrameIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value={"text" satisfies ToolbarToolType}>
          <ToolIcon type="text" />
        </ToggleGroupItem>
        <ToolsGroup
          value={value}
          options={[
            { value: "rectangle", label: "Rectangle", shortcut: "R" },
            { value: "ellipse", label: "Ellipse", shortcut: "O" },
            { value: "line", label: "Line", shortcut: "L" },
            { value: "image", label: "Image" },
          ]}
          onValueChange={(v) => {
            setCursorMode(toolbar_value_to_cursormode(v as ToolbarToolType));
          }}
        />
        <ToolsGroup
          value={value}
          options={[
            { value: "pencil", label: "Pencil tool", shortcut: "⇧+P" },
            { value: "path", label: "Path tool", shortcut: "P" },
          ]}
          onValueChange={(v) => {
            setCursorMode(toolbar_value_to_cursormode(v as ToolbarToolType));
          }}
        />

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

function ToolsGroup({
  value,
  options,
  onValueChange,
}: {
  value: ToolbarToolType;
  options: Array<{ value: ToolbarToolType; label: string; shortcut?: string }>;
  onValueChange?: (value: ToolbarToolType) => void;
}) {
  const [primary, setPrimary] = useState<ToolbarToolType>(
    options.find((o) => o.value === value)?.value ?? options[0].value
  );

  useEffect(() => {
    const v = options.find((o) => o.value === value)?.value;
    if (v) {
      setPrimary(v);
    }
  }, [value, options]);

  return (
    <>
      <ToggleGroupItem value={primary}>
        <ToolIcon type={primary} className="w-4 h-4" />
      </ToggleGroupItem>
      {options.length > 1 && (
        <DropdownMenu modal>
          <DropdownMenuTrigger>
            <CaretDownIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" sideOffset={16}>
            {options.map((option) => (
              <DropdownMenuItem
                onSelect={() => {
                  setPrimary(option.value);
                  onValueChange?.(option.value);
                }}
                asChild
              >
                <button className="w-full flex items-center gap-2">
                  <ToolIcon type={option.value} className="w-4 h-4" />
                  <span>{option.label}</span>
                  {option.shortcut && (
                    <DropdownMenuShortcut>
                      {option.shortcut}
                    </DropdownMenuShortcut>
                  )}
                </button>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}

function ToolIcon({
  type,
  ...props
}: { type: ToolbarToolType } & React.ComponentProps<typeof CursorArrowIcon>) {
  switch (type) {
    case "cursor":
      return <CursorArrowIcon {...props} />;
    case "hand":
      return <HandIcon {...props} />;
    case "container":
      return <FrameIcon {...props} />;
    case "text":
      return <TextIcon {...props} />;
    case "rectangle":
      return <BoxIcon {...props} />;
    case "ellipse":
      return <CircleIcon {...props} />;
    case "line":
      return <SlashIcon {...props} />;
    case "pencil":
      return <Pencil1Icon {...props} />;
    case "path":
      return <PenToolIcon {...props} />;
    case "image":
      return <ImageIcon {...props} />;
    default:
      return null;
  }
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
