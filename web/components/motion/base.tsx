import React from "react";

// tripple click or above
const TRIGGER_NEXT_MUTIPLE_CLICKS = 3;

export interface MotionItemProps {
  onTriggerNext: () => void;
}

interface MotionItemContainerProps extends MotionItemProps {
  children: JSX.Element;
}

export function MotionItemContainer(props: MotionItemContainerProps) {
  const triggerNext = () => {
    props.onTriggerNext();
  };
  return (
    <div
      className="no-drag cursor"
      onClick={e => {
        if (e.detail >= TRIGGER_NEXT_MUTIPLE_CLICKS) {
          triggerNext();
        }
      }}
    >
      {props.children}
    </div>
  );
}
