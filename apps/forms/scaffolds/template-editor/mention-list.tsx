import clsx from "clsx";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";

const MentionList = forwardRef(function MentionList(props: any, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];

    if (item) {
      console.log("item", item);
      props.command({ id: item });
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
      // @ts-ignore
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
    <div className="relative bg-background shadow-sm rounded overflow-hidden p-1">
      {props.items.length ? (
        props.items.map((item: any, index: number) => (
          <button
            className={clsx(
              "bg-transparent rounded-sm m-0 py-1 px-2 text-left w-full",
              index === selectedIndex ? "border" : ""
            )}
            key={index}
            onClick={() => selectItem(index)}
          >
            {item}
          </button>
        ))
      ) : (
        <div className="bg-transparent rounded-sm m-0 py-1 px-2 text-left w-full">
          No result
        </div>
      )}
    </div>
  );
});

export default MentionList;
