"use client";

import React, { useState } from "react";
import {
  useDocumentState,
  StandaloneRootNodeContent,
  StandaloneSceneBackground,
  type StandaloneDocumentContentProps,
} from "@/grida-canvas-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui-editor/dialog";
import { Button } from "@/components/ui/button";
import {
  Cross2Icon,
  EnterFullScreenIcon,
  PlayIcon,
} from "@radix-ui/react-icons";
import { toast } from "sonner";
import { useHotkeys } from "react-hotkeys-hook";
import { useCurrentSceneState } from "@/grida-canvas-react/provider";
import Resizable from "./resizable";
import ErrorBoundary from "@/grida-canvas-hosted/playground/error-boundary";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/lib/utils";
import { WorkbenchUI } from "@/components/workbench";
import { dq } from "@/grida-canvas/query";

const min = { width: 100, height: 100 };

const Context = React.createContext<{
  open: boolean;
  close: () => void;
  setOpen: (open: boolean) => void;
  preview: (node_id?: string) => void;
  mode: "framed" | "fullscreen";
  setMode: (mode: "framed" | "fullscreen") => void;
} | null>(null);

/**
 * @deprecated needs re-design
 */
export function PreviewProvider({
  children,
}: React.PropsWithChildren<StandaloneDocumentContentProps>) {
  // FIXME: use selector state - very expensive
  const { document, document_ctx } = useDocumentState();
  const scene = useCurrentSceneState();
  const [mode, setMode] = useState<"framed" | "fullscreen">("framed");
  const [open, setOpen] = useState(false);
  const [id, setId] = useState<string>();
  const [size, setSize] = useState({ width: 1200, height: 960 });

  const close = () => {
    setOpen(false);
  };

  const getPreviewNode = (node_id?: string) => {
    function tryGetTopPreviewNode(node_id: string) {
      const topid = dq.getTopIdWithinScene(document_ctx, node_id, scene.id);
      if (!topid) return null;
      const top = document.nodes[topid];
      if (!top) return null;
      if (
        !(
          top.type === "container" ||
          top.type === "component" ||
          top.type === "instance" ||
          top.type === "template_instance"
        )
      )
        return null;
      return top;
    }

    if (node_id) {
      // get the top node with given id (if not valid, return null)
      return tryGetTopPreviewNode(node_id);
    } else {
      // (1) get the first valid node from selection
      // (2) get the first valid node from scene
      // (3) if none, return null

      // (1)
      for (const node_id of scene.selection) {
        const top = tryGetTopPreviewNode(node_id);
        if (top) {
          return top;
        }
      }

      // (2)
      for (const node_id in scene.children_refs) {
        const top = tryGetTopPreviewNode(node_id);
        if (top) {
          return top;
        }
      }

      return null;
    }
  };

  const preview = (node_id?: string) => {
    const node = getPreviewNode(node_id);
    if (!node) {
      toast.error("Nothing to preview");
    } else {
      setId(node.id);
      setOpen(true);
    }
  };

  useHotkeys("shift+space", () => {
    preview();
  });

  const toggleMode = () => {
    setMode((prev) => (prev === "framed" ? "fullscreen" : "framed"));
  };

  return (
    <Context.Provider value={{ mode, open, setOpen, close, preview, setMode }}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          hideCloseButton
          fullScreen
          className="flex flex-col p-0 gap-0"
        >
          <DialogTitle className="sr-only">Preivew</DialogTitle>
          {mode === "framed" && (
            <DialogHeader className="p-4 flex flex-row items-center justify-between border-b">
              <div className="flex-1 flex items-center gap-2">
                <DialogClose asChild>
                  <Button title="Close (esc)" variant="ghost" size="icon">
                    <Cross2Icon />
                  </Button>
                </DialogClose>
                <Button variant="ghost" size="sm" onClick={toggleMode}>
                  <EnterFullScreenIcon className="me-2" />
                  Full Screen
                </Button>
              </div>
              <div className="flex-1 flex items-center justify-center">
                <div className="max-w-xs flex items-center gap-2">
                  <label className="flex items-center gap-1">
                    <span className="text-muted-foreground text-xs">W</span>
                    <Input
                      type="number"
                      placeholder="width"
                      min={min.width}
                      step={1}
                      className={cn(
                        WorkbenchUI.inputVariants({ size: "xs" }),
                        "max-w-20"
                      )}
                      value={size.width}
                      onChange={(e) =>
                        setSize((prev) => ({
                          ...prev,
                          width: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-muted-foreground text-xs">H</span>
                    <Input
                      type="number"
                      placeholder="height"
                      min={min.height}
                      step={1}
                      className={cn(
                        WorkbenchUI.inputVariants({ size: "xs" }),
                        "max-w-20"
                      )}
                      value={size.height}
                      onChange={(e) =>
                        setSize((prev) => ({
                          ...prev,
                          height: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
              <div className="flex-1" />
            </DialogHeader>
          )}

          {mode === "fullscreen" && (
            <div className="absolute top-4 left-4 z-50">
              <Button
                variant="outline"
                size="sm"
                className="text-muted-foreground"
                onClick={toggleMode}
              >
                Show UI
              </Button>
            </div>
          )}

          <div className="relative w-full h-full">
            <ErrorBoundary>
              <StandaloneSceneBackground className="w-full h-full">
                <Resizable
                  value={size}
                  onValueChange={setSize}
                  min={min}
                  fullscreen={mode === "fullscreen"}
                >
                  {id && <StandaloneRootNodeContent node_id={id} />}
                </Resizable>
              </StandaloneSceneBackground>
            </ErrorBoundary>
          </div>
        </DialogContent>
      </Dialog>
      {children}
    </Context.Provider>
  );
}

export function usePreview() {
  const context = React.useContext(Context);
  if (!context) {
    throw new Error("usePreview must be used within a PreviewProvider");
  }

  return {
    preview: context.preview,
  };
}

export function PreviewButton() {
  const { preview } = usePreview();

  const onPreviewClick = () => {
    preview();
  };

  return (
    <Button variant="ghost" size="icon" onClick={onPreviewClick}>
      <PlayIcon />
    </Button>
  );
}
