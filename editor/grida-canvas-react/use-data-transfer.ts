"use client";

import React, { useCallback } from "react";
import grida from "@grida/schema";
import { io } from "@grida/io";
import cg from "@grida/cg";
import { useCurrentEditor, useEditorState } from "./use-editor";
import assert from "assert";
import cmath from "@grida/cmath";
import { toast } from "sonner";

/**
 * Hook that provides data transfer event handlers for the Grida canvas editor.
 *
 * This hook handles drag and drop operations, clipboard paste events, and file insertion
 * for various content types including images, SVG files, and text. It creates appropriate
 * canvas nodes (rectangles with image fills, text nodes, or SVG nodes) based on the
 * dropped or pasted content.
 *
 * @returns An object containing event handlers and utility functions:
 * - `onpaste`: Handles clipboard paste events for text, images, and SVG content
 * - `ondragover`: Prevents default drag behavior to allow drops
 * - `ondrop`: Handles file drops and creates appropriate canvas nodes
 * - `insertText`: Utility function to insert text nodes at specified positions
 *
 * @example
 * ```tsx
 * function CanvasEditor() {
 *   const { onpaste, ondragover, ondrop, insertText } = useDataTransferEventTarget();
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
 * - For image files (PNG, JPEG, GIF), creates rectangle nodes with image fills
 * - For SVG files, creates vector nodes from SVG content
 * - For text content, creates text nodes with default styling
 * - Handles both drag-and-drop and clipboard paste operations
 * - Supports Grida-specific clipboard formats for internal data transfer
 */
export function useDataTransferEventTarget() {
  const instance = useCurrentEditor();
  const current_clipboard = useEditorState(instance, (s) => s.user_clipboard);

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
        color: { r: 0, g: 0, b: 0, a: 1 },
      } as cg.Paint;
    },
    [instance]
  );

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
      node.$.fills = [
        {
          type: "image",
          src: image.url,
          fit: "cover",
          transform: cmath.transform.identity,
          filters: cg.def.IMAGE_FILTERS,
          blendMode: cg.def.BLENDMODE,
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
        type === "image/gif"
      ) {
        const name = file.name.split(".")[0];
        insertImage(name, file, position);
        return;
      }
    },
    [insertImage, insertSVG]
  );

  /**
   * pasting from os clipboard (or fallbacks to local clipboard)
   *
   * 1. if the payload contains valid grida payload, insert it (or if identical to local clipboard, paste it)
   * 2. if the payload contains text/plain, image/png, image/jpeg, image/gif, image/svg+xml, insert it
   * 3. if the payload contains no valid payload, fallback to local clipboard, and paste it
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
        return;
      }

      let pasted_from_data_transfer = false;

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
      ).filter((item) => item !== null);

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
          pasted_from_data_transfer = true;
        } catch {}
      }

      if (pasted_from_data_transfer) {
        event.preventDefault();
      } else {
        const grida_payload = items.find((item) => item.type === "clipboard");

        // 1. if there is a grida html clipboard, use it and ignore all others.
        if (grida_payload) {
          if (
            current_clipboard?.payload_id === grida_payload.clipboard.payload_id
          ) {
            instance.commands.paste();
            pasted_from_data_transfer = true;
          } else if (grida_payload.clipboard.type === "prototypes") {
            instance.commands.pastePayload(grida_payload.clipboard);
            pasted_from_data_transfer = true;
          } else {
            instance.commands.paste();
            pasted_from_data_transfer = true;
          }
        }
        // 2. if the payload contains text/plain, image/png, image/jpeg, image/gif, image/svg+xml, insert it
        else {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            try {
              switch (item.type) {
                case "text": {
                  const { text } = item;
                  insertText(text, {
                    clientX: window.innerWidth / 2,
                    clientY: window.innerHeight / 2,
                  });
                  pasted_from_data_transfer = true;
                  break;
                }
                case "image/gif":
                case "image/jpeg":
                case "image/png":
                case "image/svg+xml": {
                  const { type, file } = item;
                  insertFromFile(type, file, {
                    clientX: window.innerWidth / 2,
                    clientY: window.innerHeight / 2,
                  });
                  pasted_from_data_transfer = true;
                  break;
                }
              }
            } catch {}
          }
        }

        // 3. if the payload contains no valid payload, fallback to local clipboard, and paste it
        if (!pasted_from_data_transfer) {
          instance.commands.paste();
          event.preventDefault();
        }
      }
    },
    [instance, insertFromFile, insertText, current_clipboard]
  );

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
        const [valid, type] = io.clipboard.filetype(file);
        if (valid) {
          insertFromFile(type, file, event);
        } else {
          toast.error(`file type '${type}' is not supported`);
        }
      }
    },
    [insertFromFile]
  );
  //

  return { onpaste, ondragover, ondrop, insertText };
}
