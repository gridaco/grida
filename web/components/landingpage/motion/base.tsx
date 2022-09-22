import React from "react";
import styled from "@emotion/styled";

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
    <Postioner
      className="no-drag cursor"
      onClick={e => {
        if (e.detail >= TRIGGER_NEXT_MUTIPLE_CLICKS) {
          triggerNext();
        }
      }}
    >
      {props.children}
    </Postioner>
  );
}

const Postioner = styled.div`
  margin-right: auto;
`;
