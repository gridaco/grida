"use client";

import React, { useEffect, useMemo, useReducer, useState } from "react";
import {
  StandaloneSceneContent,
  useDocument,
  useEventTarget,
} from "@/grida-react-canvas";
import {
  StandaloneRootNodeContent,
  StandaloneSceneBackground,
  type StandaloneDocumentContentProps,
} from "@/grida-react-canvas/renderer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PlayIcon } from "@radix-ui/react-icons";
import toast from "react-hot-toast";
import { useHotkeys } from "react-hotkeys-hook";
import { document } from "@/grida-react-canvas/document-query";
import { useCurrentScene } from "@/grida-react-canvas/provider";
import Resizable from "./resizable";

const Context = React.createContext<{
  open: boolean;
  close: () => void;
  setOpen: (open: boolean) => void;
  preview: (node_id?: string) => void;
} | null>(null);

export function PreviewProvider({
  templates,
  children,
}: React.PropsWithChildren<StandaloneDocumentContentProps>) {
  const { state } = useDocument();
  const scene = useCurrentScene();
  const [open, setOpen] = useState(false);
  const [id, setId] = useState<string>();

  const close = () => {
    setOpen(false);
  };

  const getPreviewNode = (node_id?: string) => {
    function tryGetTopPreviewNode(node_id: string) {
      const topid = document.getTopId(state.document_ctx, node_id);
      if (!topid) return null;
      const top = state.document.nodes[topid];
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
      for (const node_id in scene.children) {
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

  return (
    <Context.Provider value={{ open, setOpen, close, preview }}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-screen h-screen flex flex-col p-0 gap-0">
          <DialogHeader className="p-4">
            <DialogTitle>Preivew</DialogTitle>
          </DialogHeader>
          <div className="relative w-full h-full">
            <StandaloneSceneBackground className="w-full h-full">
              <Resizable initial={{ width: 1200, height: 960 }}>
                {id && (
                  <StandaloneRootNodeContent
                    node_id={id}
                    templates={templates}
                  />
                )}
              </Resizable>
            </StandaloneSceneBackground>
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
