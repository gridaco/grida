import React from "react";
import { TagInputStyleClassesProps, type Tag as TagType } from "./tag-input";
import { Tag, TagProps } from "./tag";
import { cn } from "@/utils/cn";

export type TagListProps = {
  tags: TagType[];
  customTagRenderer?: (tag: TagType, isActiveTag: boolean) => React.ReactNode;
  direction?: TagProps["direction"];
  onSortEnd: (oldIndex: number, newIndex: number) => void;
  className?: string;
  inlineTags?: boolean;
  activeTagIndex?: number | null;
  setActiveTagIndex?: (index: number | null) => void;
  classStyleProps: {
    tagListClasses: TagInputStyleClassesProps["tagList"];
    tagClasses: TagInputStyleClassesProps["tag"];
  };
  disabled?: boolean;
} & Omit<TagProps, "tagObj">;

export const TagList: React.FC<TagListProps> = ({
  tags,
  customTagRenderer,
  direction,
  draggable,
  onSortEnd,
  className,
  inlineTags,
  activeTagIndex,
  setActiveTagIndex,
  classStyleProps,
  disabled,
  ...tagListProps
}) => {
  const [draggedTagId, setDraggedTagId] = React.useState<string | null>(null);

  const handleMouseDown = (id: string) => {
    setDraggedTagId(id);
  };

  const handleMouseUp = () => {
    setDraggedTagId(null);
  };

  return (
    <>
      {!inlineTags ? (
        <div
          className={cn(
            "rounded-md w-full",
            // className,
            {
              "flex flex-wrap gap-2": direction === "row",
              "flex flex-col gap-2": direction === "column",
            },
            classStyleProps?.tagListClasses?.container
          )}
        >
          {tags.map((tagObj, index) =>
            customTagRenderer ? (
              customTagRenderer(tagObj, index === activeTagIndex)
            ) : (
              <Tag
                key={tagObj.id}
                tagObj={tagObj}
                isActiveTag={index === activeTagIndex}
                direction={direction}
                draggable={draggable}
                tagClasses={classStyleProps?.tagClasses}
                {...tagListProps}
                disabled={disabled}
              />
            )
          )}
        </div>
      ) : (
        <>
          {tags.map((tagObj, index) =>
            customTagRenderer ? (
              customTagRenderer(tagObj, index === activeTagIndex)
            ) : (
              <Tag
                key={tagObj.id}
                tagObj={tagObj}
                isActiveTag={index === activeTagIndex}
                direction={direction}
                draggable={draggable}
                tagClasses={classStyleProps?.tagClasses}
                {...tagListProps}
                disabled={disabled}
              />
            )
          )}
        </>
      )}
    </>
  );
};
