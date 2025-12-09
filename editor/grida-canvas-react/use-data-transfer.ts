"use client";

import React, { useCallback } from "react";
import { io } from "@grida/io";
import cg from "@grida/cg";
import { useCurrentEditor, useEditorState } from "./use-editor";
import type { Editor } from "@/grida-canvas/editor";
import assert from "assert";
import cmath from "@grida/cmath";
import kolor from "@grida/color";
import { toast } from "sonner";
import { iofigma } from "@grida/io-figma";
import { nanoid } from "nanoid";

/**
 * Hook that provides file insertion utilities for the Grida canvas editor.
 *
 * This hook handles inserting images (PNG, JPEG, GIF, WebP) and SVG files into the canvas.
 * Images are inserted as rectangle nodes with image fills, while SVG files are converted
 * to vector nodes.
 *
 * @returns An object containing file insertion functions:
 * - `insertImage`: Inserts an image file as a rectangle node with image fill
 * - `insertSVG`: Inserts an SVG string as a vector node
 * - `insertFromFile`: Automatically routes file insertion based on file type
 *
 * @example
 * ```tsx
 * function FileImporter() {
 *   const { insertFromFile } = useInsertFile();
 *
 *   const handleFileSelect = (file: File) => {
 *     const [valid, type] = io.clipboard.filetype(file);
 *     if (valid) {
 *       insertFromFile(type, file, { clientX: 100, clientY: 100 });
 *     }
 *   };
 *
 *   return <input type="file" onChange={(e) => handleFileSelect(e.target.files[0])} />;
 * }
 * ```
 */
export function useInsertFile() {
  const instance = useCurrentEditor();

  const insertImage = useCallback(
    async (
      name: string,
      file: File,
      position?: {
        clientX: number;
        clientY: number;
      }
    ) => {
      const [x, y] = instance.camera.clientPointToCanvasPoint(
        position ? [position.clientX, position.clientY] : [0, 0]
      );

      const bytes = await file.arrayBuffer();
      const image = await instance.createImage(new Uint8Array(bytes));

      // Create rectangle node with image paint instead of image node
      const node = instance.commands.createRectangleNode();
      node.$.position = "absolute";
      node.$.name = name;
      node.$.left = x;
      node.$.top = y;
      node.$.width = image.width;
      node.$.height = image.height;
      node.$.fill_paints = [
        {
          type: "image",
          src: image.url,
          fit: "cover",
          transform: cmath.transform.identity,
          filters: cg.def.IMAGE_FILTERS,
          blend_mode: cg.def.BLENDMODE,
          opacity: 1,
          active: true,
        } satisfies cg.ImagePaint,
      ];
    },
    [instance]
  );

  const insertSVG = useCallback(
    async (
      name: string,
      svg: string,
      position?: {
        clientX: number;
        clientY: number;
      }
    ) => {
      const node = await instance.commands.createNodeFromSvg(svg);

      const center_dx =
        typeof node.$.width === "number" && node.$.width > 0
          ? node.$.width / 2
          : 0;

      const center_dy =
        typeof node.$.height === "number" && node.$.height > 0
          ? node.$.height / 2
          : 0;

      const [x, y] = instance.camera.clientPointToCanvasPoint(
        cmath.vector2.sub(
          position ? [position.clientX, position.clientY] : [0, 0],
          [center_dx, center_dy]
        )
      );

      node.$.name = name;
      node.$.left = x;
      node.$.top = y;
    },
    [instance]
  );

  const insertFromFile = useCallback(
    (
      type: io.clipboard.ValidFileType,
      file: File,
      position?: {
        clientX: number;
        clientY: number;
      }
    ) => {
      if (type === "image/svg+xml") {
        const reader = new FileReader();
        reader.onload = (e) => {
          const svgContent = e.target?.result as string;
          const name = file.name.split(".svg")[0];
          insertSVG(name, svgContent, position);
        };
        reader.readAsText(file);
        return;
      } else if (
        type === "image/png" ||
        type === "image/jpeg" ||
        type === "image/gif" ||
        type === "image/webp"
      ) {
        const name = file.name.split(".")[0];
        insertImage(name, file, position);
        return;
      }
    },
    [insertImage, insertSVG]
  );

  return { insertImage, insertSVG, insertFromFile };
}

/**
 * Attempts to parse and insert Figma clipboard payload into the editor
 *
 * @param editor - The editor instance to insert nodes into
 * @param payload - Raw HTML string from Figma clipboard
 * @returns Result object with success status, inserted node count, or error
 */
async function tryInsertFromFigmaClipboardPayload(
  editor: Editor,
  payload: string
): Promise<
  | { success: true; insertedNodeCount: number }
  | { success: false; error: string }
> {
  try {
    // Parse Figma clipboard HTML to extract NodeChanges
    const { readHTMLMessage } = await import("@grida/io-figma");
    const parsed = readHTMLMessage(payload);
    const nodeChanges = parsed.message.nodeChanges || [];

    // 1. Convert Kiwi NodeChanges to Figma REST API or IR nodes (flat array)
    const flatFigmaNodes = nodeChanges
      .map((nc) => iofigma.kiwi.factory.node(nc, parsed.message))
      .filter((node) => node !== undefined);

    if (flatFigmaNodes.length === 0) {
      return {
        success: false,
        error: `No supported Figma nodes found. Found ${nodeChanges.length} node(s), but none could be converted.`,
      };
    }

    // 2. Build parent-child tree from flat nodes using parentIndex from Kiwi
    // Map GUID to nodes for quick lookup
    const guidToNode = new Map<
      string,
      NonNullable<ReturnType<typeof iofigma.kiwi.factory.node>>
    >();
    const guidToKiwi = new Map<string, (typeof nodeChanges)[number]>();

    nodeChanges.forEach((nc) => {
      if (nc.guid) {
        guidToKiwi.set(iofigma.kiwi.guid(nc.guid), nc);
      }
    });

    flatFigmaNodes.forEach((node) => {
      guidToNode.set(node.id, node);
    });

    // Build children arrays by reading parentIndex from original Kiwi data
    flatFigmaNodes.forEach((node) => {
      const kiwi = guidToKiwi.get(node.id);
      if (kiwi?.parentIndex?.guid) {
        const parentGuid = iofigma.kiwi.guid(kiwi.parentIndex.guid);
        const parentNode = guidToNode.get(parentGuid);

        if (parentNode && "children" in parentNode) {
          if (!parentNode.children) {
            parentNode.children = [];
          }
          // Type assertion: IR nodes (X_VECTOR, etc.) will be handled by restful.factory.document
          (parentNode.children as any[]).push(node);
        }
      }
    });

    // 3. Find root nodes (nodes without parent or whose parent is CANVAS/DOCUMENT)
    const rootNodes = flatFigmaNodes.filter((node) => {
      const kiwi = guidToKiwi.get(node.id);
      if (!kiwi?.parentIndex?.guid) return true;

      const parentGuid = iofigma.kiwi.guid(kiwi.parentIndex.guid);
      const parentKiwi = guidToKiwi.get(parentGuid);

      // Root if parent is CANVAS or DOCUMENT
      return (
        !parentKiwi ||
        parentKiwi.type === "CANVAS" ||
        parentKiwi.type === "DOCUMENT"
      );
    });

    if (rootNodes.length === 0) {
      return {
        success: false,
        error: `No root nodes found. All ${flatFigmaNodes.length} node(s) appear to be nested within containers.`,
      };
    }

    // 4. Convert Figma REST API nodes to Grida nodes and insert
    // Generate unique IDs for each paste operation to avoid conflicts
    // Note: We use nanoid here since editor.idgen is not publicly accessible
    // The IDs will be unique and won't conflict with existing nodes
    const context: iofigma.restful.factory.FactoryContext = {
      node_id_generator: () => nanoid(),
      gradient_id_generator: () => nanoid(),
    };

    // Convert each root node to Grida document (will recursively process children)
    rootNodes.forEach((figmaNode) => {
      const gridaDoc = iofigma.restful.factory.document(
        figmaNode,
        {}, // images map (empty for clipboard paste)
        context
      );

      // 5. Insert into canvas
      editor.insert({ document: gridaDoc });
    });

    return { success: true, insertedNodeCount: rootNodes.length };
  } catch (error) {
    console.error("Failed to parse Figma clipboard:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Hook that provides data transfer event handlers for the Grida canvas editor.
 *
 * This hook handles drag and drop operations and clipboard paste events for various
 * content types including images, SVG files, SVG text, and text. It creates appropriate
 * canvas nodes (rectangles with image fills, text nodes, or SVG nodes) based on the
 * dropped or pasted content.
 *
 * @returns An object containing event handlers and utility functions:
 * - `onpaste`: Handles clipboard paste events (ClipboardEvent) for text, images, SVG files, and SVG text
 * - `onpaste_external_event`: Handles external clipboard paste (Clipboard API) for context menus and other external triggers
 * - `ondragover`: Prevents default drag behavior to allow drops
 * - `ondrop`: Handles file drops and creates appropriate canvas nodes
 * - `insertText`: Utility function to insert text nodes at specified positions
 *
 * @example
 * ```tsx
 * function CanvasEditor() {
 *   const { onpaste, onpaste_external_event, ondragover, ondrop, insertText } = useDataTransferEventTarget();
 *
 *   return (
 *     <div
 *       onPaste={onpaste}
 *       onDragOver={ondragover}
 *       onDrop={ondrop}
 *     >
 *       content
 *     </div>
 *   );
 * }
 * ```
 *
 * @remarks
 * - For image files (PNG, JPEG, GIF, WebP), creates rectangle nodes with image fills
 * - For SVG files and SVG text, creates vector nodes from SVG content
 * - For plain text content, creates text nodes with default styling
 * - Handles both drag-and-drop and clipboard paste operations
 * - Supports Grida-specific clipboard formats for internal data transfer
 * - Supports Figma clipboard format for cross-tool compatibility
 */
export function useDataTransferEventTarget() {
  const instance = useCurrentEditor();
  const current_clipboard = useEditorState(instance, (s) => s.user_clipboard);
  const { insertFromFile, insertSVG } = useInsertFile();

  const insertText = useCallback(
    (
      text: string,
      position?: {
        clientX: number;
        clientY: number;
      }
    ) => {
      const [x, y] = instance.camera.clientPointToCanvasPoint(
        position ? [position.clientX, position.clientY] : [0, 0]
      );

      const node = instance.commands.createTextNode(text);
      node.$.name = text;
      node.$.text = text;
      node.$.left = x;
      node.$.top = y;
      node.$.fill = {
        type: "solid",
        color: kolor.colorformats.RGBA32F.BLACK,
        active: true,
      } satisfies cg.Paint;
    },
    [instance]
  );

  const handleFigmaClipboard = useCallback(
    async (payload: string) => {
      const insertPromise = (async () => {
        // Wait a tiny bit to let the toast render with css animation starts (prevent UI freeze while importing)
        await new Promise((resolve) => setTimeout(resolve, 10));

        const result = await tryInsertFromFigmaClipboardPayload(
          instance,
          payload
        );

        if (!result.success) {
          throw new Error(result.error);
        }

        return result.insertedNodeCount;
      })();

      toast.promise(insertPromise, {
        loading: "Pasting from Figma...",
        success: (count) => `Pasted ${count} root node(s) from Figma`,
        error: (err) => err.message || "Failed to paste from Figma",
      });
    },
    [instance]
  );

  /**
   * Core paste logic that handles decoded clipboard items.
   * This function implements the paste priority order:
   * 1. Grida vector network (grida:vn:)
   * 2. Grida clipboard payload
   * 3. Figma clipboard
   * 4. SVG text, images, or plain text
   * 5. Fallback to local clipboard
   */
  const handlePasteFromItems = useCallback(
    async (
      items: io.clipboard.DecodedItem[],
      options?: {
        position?: { clientX: number; clientY: number };
        current_clipboard?: io.clipboard.ClipboardPayload | undefined;
      }
    ): Promise<boolean> => {
      const position = options?.position || {
        clientX: window.innerWidth / 2,
        clientY: window.innerHeight / 2,
      };
      const current_clipboard_ref =
        options?.current_clipboard || current_clipboard;

      // Check for vector network payload (grida:vn:)
      const vector_payload = items.find(
        (item) => item.type === "text" && item.text.startsWith("grida:vn:")
      );
      if (vector_payload) {
        try {
          assert(vector_payload.type === "text");
          const net = JSON.parse(
            atob(vector_payload.text.slice("grida:vn:".length))
          );
          instance.commands.pasteVector(net);
          return true;
        } catch {}
      }

      // 1. Check for Grida clipboard payload
      const grida_payload = items.find((item) => item.type === "clipboard");
      if (grida_payload) {
        if (grida_payload.type === "clipboard") {
          if (
            current_clipboard_ref?.payload_id ===
            grida_payload.clipboard.payload_id
          ) {
            instance.commands.paste();
            return true;
          } else if (grida_payload.clipboard.type === "prototypes") {
            instance.commands.pastePayload(grida_payload.clipboard);
            return true;
          } else {
            instance.commands.paste();
            return true;
          }
        }
      }

      // 2. Check for Figma clipboard
      const figma_payload = items.find(
        (item) => item.type === "canbe-figma-clipboard"
      );
      if (figma_payload) {
        if (figma_payload.type === "canbe-figma-clipboard") {
          await handleFigmaClipboard(figma_payload.html);
          return true;
        }
      }

      // 3. Handle SVG text, images, or plain text
      for (const item of items) {
        try {
          switch (item.type) {
            case "svg-text": {
              insertSVG("SVG", item.svg, position);
              return true;
            }
            case "text": {
              insertText(item.text, position);
              return true;
            }
            case "image/gif":
            case "image/jpeg":
            case "image/png":
            case "image/svg+xml": {
              insertFromFile(item.type, item.file, position);
              return true;
            }
          }
        } catch {}
      }

      // 4. No valid payload found, return false to allow fallback
      return false;
    },
    [
      instance,
      insertFromFile,
      insertSVG,
      insertText,
      current_clipboard,
      handleFigmaClipboard,
    ]
  );

  /**
   * pasting from os clipboard (or fallbacks to local clipboard)
   *
   * 1. if the payload contains valid grida payload, insert it (or if identical to local clipboard, paste it)
   * 2. if the payload contains figma clipboard, convert and insert it
   * 3. if the payload contains svg-text, text/plain, image/png, image/jpeg, image/gif, image/svg+xml, insert it
   * 4. if the payload contains no valid payload, fallback to local clipboard, and paste it
   *
   */
  const onpaste = useCallback(
    async (event: ClipboardEvent) => {
      if (event.defaultPrevented) return;
      // cancel if on contenteditable / form element
      if (
        event.target instanceof HTMLElement &&
        (event.target as HTMLElement).isContentEditable
      )
        return;
      if (event.target instanceof HTMLInputElement) return;
      if (event.target instanceof HTMLTextAreaElement) return;

      if (!event.clipboardData) {
        instance.commands.paste();
        event.preventDefault();
        return;
      }

      // NOTE: the read of the clipboard data should be non-blocking. (in safari, this will fail without any error)
      const items = (
        await Promise.all(
          Array.from(event.clipboardData.items).map(async (item) => {
            try {
              const payload = await io.clipboard.decode(item);
              return payload;
            } catch {
              return null;
            }
          })
        )
      ).filter((item): item is io.clipboard.DecodedItem => item !== null);

      const handled = await handlePasteFromItems(items, {
        position: {
          clientX: window.innerWidth / 2,
          clientY: window.innerHeight / 2,
        },
        current_clipboard,
      });

      if (handled) {
        event.preventDefault();
      } else {
        // Fallback to local clipboard if no valid payload found
        instance.commands.paste();
        event.preventDefault();
      }
    },
    [instance, handlePasteFromItems, current_clipboard]
  );

  /**
   * External paste handler for Clipboard API (navigator.clipboard.read())
   * Used by context menus and other external triggers
   */
  const onpaste_external_event = useCallback(async () => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      if (clipboardItems.length > 0) {
        // Convert ClipboardItem[] to DecodedItem[] using IO module
        const decodedItems =
          await io.clipboard.decodeFromClipboardItems(clipboardItems);

        // Use unified paste logic
        const handled = await handlePasteFromItems(decodedItems, {
          position: {
            clientX: window.innerWidth / 2,
            clientY: window.innerHeight / 2,
          },
          current_clipboard,
        });

        if (!handled) {
          // Fallback to local clipboard if no valid payload found
          instance.commands.paste();
        }
      } else {
        // No clipboard items, fallback to local clipboard
        instance.commands.paste();
      }
    } catch (e) {
      // Clipboard API may fail (permissions, etc.), fallback to local clipboard
      instance.commands.paste();
    }
  }, [instance, handlePasteFromItems, current_clipboard]);

  const ondragover = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const ondrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const knwondata = event.dataTransfer.getData("x-grida-data-transfer");
      if (knwondata) {
        const data = JSON.parse(knwondata);
        switch (data.type) {
          case "svg":
            const { name, src } = data;
            const task = fetch(src, {
              cache: "no-store",
            }).then((res) =>
              res.text().then((text) => {
                insertSVG(name, text, event);
              })
            );

            toast.promise(task, {
              loading: "Loading...",
              success: "Inserted",
              error: "Failed to insert SVG",
            });
            break;
          default:
            // unknown
            break;
        }
        //
        return;
      }
      const files = event.dataTransfer.files;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Check for .fig files and show helpful message
        if (file.name.toLowerCase().endsWith(".fig")) {
          toast.info("Use [File] > [Import Figma] to import .fig files");
          continue;
        }

        const [valid, type] = io.clipboard.filetype(file);
        if (valid) {
          insertFromFile(type, file, event);
        } else {
          toast.error(`file type '${type}' is not supported`);
        }
      }
    },
    [insertFromFile, insertSVG]
  );
  //

  return {
    onpaste,
    onpaste_external_event,
    ondragover,
    ondrop,
    insertText,
  };
}
