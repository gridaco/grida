import React from "react";
import type { EditorFlatFormBlock } from "../../editor/state";
import { DragHandleHorizontalIcon } from "@radix-ui/react-icons";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { SectionBlock } from "./section-block";
import { FieldBlock } from "./field-block";
import { HtmlBlock } from "./html-block";
import { ImageBlock } from "./image-block";
import { VideoBlock } from "./video-block";
import { DividerBlock } from "./divider-block";
import { HeaderBlock } from "./header-block";

export function BlocksCanvas({
  children,
  ...props
}: React.PropsWithChildren<React.HtmlHTMLAttributes<HTMLDivElement>>) {
  const { setNodeRef } = useDroppable({
    id: "root",
  });

  return (
    <div ref={setNodeRef} {...props}>
      {children}
    </div>
  );
}

export function Block(props: EditorFlatFormBlock) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging,
    isSorting,
    isOver,
    transition,
  } = useSortable({
    id: props.id,
    disabled: props.type === "section",
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 1 : 0,
    transition,
  };

  function renderBlock() {
    switch (props.type) {
      case "section":
        return <SectionBlock {...props} />;
      case "field":
        return <FieldBlock {...props} />;
      case "html":
        return <HtmlBlock {...props} />;
      case "image":
        return <ImageBlock {...props} />;
      case "video":
        return <VideoBlock {...props} />;
      case "divider":
        return <DividerBlock {...props} />;
      case "header":
        return <HeaderBlock {...props} />;
      default:
        return <div>Unsupported block type: {props.type}</div>;
    }
  }

  return (
    <>
      {/* debug display */}
      {/* <div className="text-xs border p-1">
        <div className="flex flex-col gap-3">
          <span>id: {props.id}</span>
          <span>parent: {props.parent_id}</span>
          <span>index: {props.local_index}</span>
        </div>
      </div> */}
      <div
        data-folder={props.type === "section"}
        ref={setNodeRef}
        style={style}
        className="relative data-[folder='true']:mt-16 data-[folder='true']:mb-4"
      >
        <button
          style={{
            display: props.type === "section" ? "none" : "block",
          }}
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          className="absolute -left-8 top-1 bg-white rounded border shadow p-1"
        >
          <DragHandleHorizontalIcon />
        </button>
        {renderBlock()}
      </div>
    </>
  );
}
