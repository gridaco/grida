import {
  useNode,
  useNodeAction,
  useTool,
  useTransform,
} from "@/grida-react-canvas/provider";
import { useEffect, useRef } from "react";
import { useSingleSelection } from "../surface-hooks";
import grida from "@grida/schema";
import { css } from "@/grida-canvas-utils/css";
import { cmath } from "@grida/cmath";

export function SurfaceTextEditor({ node_id }: { node_id: string }) {
  const inputref = useRef<HTMLTextAreaElement>(null);
  const change = useNodeAction(node_id)!;
  const { transform } = useTransform();
  const { tryExitContentEditMode } = useTool();
  const data = useSingleSelection(node_id);
  const node = useNode(node_id!);

  useEffect(() => {
    // select all text
    if (inputref.current) {
      inputref.current.select();
    }
  }, [inputref.current]);

  const stopPropagation = (e: React.BaseSyntheticEvent) => {
    e.stopPropagation();
  };

  if (!data) return <></>;

  return (
    <div
      id="richtext-editor-surface"
      className="fixed left-0 top-0 w-0 h-0 z-10"
    >
      <div
        style={{
          position: "absolute",
          ...data.style,
          willChange: "transform",
          overflow: "hidden",
          resize: "none",
          zIndex: 1,
        }}
      >
        <div
          style={{
            scale: cmath.transform.getScale(transform)[0],
            transformOrigin: "0 0",
          }}
        >
          <textarea
            ref={inputref}
            // TODO: only supports literal text value
            onPointerDown={stopPropagation}
            value={node.text as string}
            maxLength={node.maxLength}
            onBlur={tryExitContentEditMode}
            onKeyDown={(e) => {
              stopPropagation(e);
              if (e.key === "Escape") {
                inputref.current?.blur();
              }
            }}
            onChange={(e) => {
              change.text(e.target.value);
            }}
            className="m-0 p-0 border-none outline-none appearance-none bg-transparent h-full overflow-visible resize-none"
            style={{
              // width: "calc(100% + 1px)",
              ...css.toReactTextStyle(
                // TODO: use computed text node
                node as grida.program.nodes.TextNode as any as grida.program.nodes.ComputedTextNode
              ),
              opacity: node.opacity,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// USES CONTENTEDITABLE
// function SurfaceTextEditor({ node_id }: { node_id: string }) {
//   // TODO: this only supports literal text value

//   const ref = useRef<HTMLDivElement>(null);
//   const focused = useRef(false);
//   const change = useNodeAction(node_id)!;
//   const transform = useNodeSurfaceTransfrom(node_id);
//   const node = useNode(node_id!);
//   const { tryExitContentEditMode } = useEventTarget();

//   useEffect(() => {
//     if (focused.current) {
//       return;
//     }
//     const element = ref.current;
//     if (element) {
//       const selection = window.getSelection();
//       const range = document.createRange();
//       range.selectNodeContents(element);
//       selection?.removeAllRanges();
//       selection?.addRange(range);
//       focused.current = true;
//     }

//     return () => {
//       focused.current = false;
//     };
//   }, [ref.current, focused.current]);

//   const stopPropagation = (e: React.BaseSyntheticEvent) => {
//     e.stopPropagation();
//   };

//   const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
//     e.stopPropagation();
//     change.text(e.currentTarget.innerText);
//   };

//   return (
//     <div
//       id="richtext-editor-surface"
//       className="fixed left-0 top-0 w-0 h-0 z-10"
//     >
//       <div
//         style={{
//           position: "absolute",
//           ...transform,
//           willChange: "transform",
//           // overflow: "hidden",
//           resize: "none",
//           zIndex: 1,
//         }}
//       >
//         <div
//           ref={ref}
//           onPointerDown={stopPropagation}
//           autoFocus
//           onBlur={tryExitContentEditMode}
//           onKeyDown={(e) => {
//             stopPropagation(e);
//             if (e.key === "Escape") {
//               e.currentTarget.blur();
//             }
//           }}
//           contentEditable
//           suppressContentEditableWarning={true}
//           onInput={handleInput}
//           className="m-0 p-0 border-none outline-none appearance-none bg-transparent"
//           style={{
//             ...grida.program.css.toReactTextStyle(
//               node as grida.program.nodes.TextNode
//             ),
//           }}
//         >
//           {node.text as string}
//         </div>
//         {/* <textarea
//           ref={inputref}
//           // TODO: only supports literal text value
//           onPointerDown={stopPropagation}
//           value={node.text as string}
//           maxLength={node.maxLength}
//           onBlur={tryExitContentEditMode}
//           onKeyDown={(e) => {
//             stopPropagation(e);
//             if (e.key === "Escape") {
//               inputref.current?.blur();
//             }
//           }}
//           onChange={(e) => {
//             change.text(e.target.value);
//           }}
//           className="m-0 p-0 border-none outline-none appearance-none bg-transparent h-full overflow-visible resize-none"
//           style={{
//             width: "calc(100% + 1px)",
//             ...grida.program.css.toReactTextStyle(
//               node as grida.program.nodes.TextNode
//             ),
//           }}
//         /> */}
//       </div>
//     </div>
//   );
// }
