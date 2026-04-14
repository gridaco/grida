import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { cn } from "@/components/lib/utils";

const MentionList = forwardRef(function MentionList(
  props: {
    items: { id: string; label: string }[];
    command: (item: { id: string; label: string }) => void;
  },
  ref
) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];

    if (item) {
      console.log("item", item);
      props.command(item);
    }
  };

  const upHandler = () => {
    setSelectedIndex(
      (selectedIndex + props.items.length - 1) % props.items.length
    );
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({
      // @ts-expect-error - Event parameter type mismatch
      event,
    }) => {
      if (event.key === "ArrowUp") {
        upHandler();
        return true;
      }

      if (event.key === "ArrowDown") {
        downHandler();
        return true;
      }

      if (event.key === "Enter") {
        enterHandler();
        return true;
      }

      return false;
    },
  }));

  return (
    <div className="relative bg-background shadow-sm rounded-sm overflow-hidden p-1">
      {props.items.length ? (
        props.items.map((item, index: number) => (
          <button
            className={cn(
              "bg-transparent rounded-xs m-0 py-1 px-2 text-left w-full",
              index === selectedIndex ? "border" : ""
            )}
            key={index}
            onClick={() => selectItem(index)}
          >
            {item.label}
          </button>
        ))
      ) : (
        <div className="bg-transparent rounded-xs m-0 py-1 px-2 text-left w-full">
          No result
        </div>
      )}
    </div>
  );
});

export default MentionList;
