import React from "react";
import styled from "@emotion/styled";
import assert from "assert";

export type AuxilaryGridDropGuideLeftOrRightSpecification = {
  left?: boolean;
  right?: boolean;
};
type AuxilaryGridDropGuide = AuxilaryGridDropGuideLeftOrRightSpecification & {
  onClick?: () => void;
  over?: boolean;
};

/**
 * This is a guide placed between items
 *
 * Functions
 * 1. Highlight on drop
 * 2. Highlight on hover (if new section can be created)
 */
export const AuxilaryDashbaordGridPlacementGuide = React.forwardRef(function (
  { left, right, over, onClick }: AuxilaryGridDropGuide,
  ref: React.Ref<HTMLDivElement>
) {
  assert(left !== right, 'You can only have one of "left" or "right"');

  return (
    <Guide
      ref={ref}
      onClick={onClick}
      data-over={over}
      data-left={left}
      data-right={right}
    />
  );
});

const GUIDE_MARGIN = 4;
const GUIDE_ACCESSIBLE_WIDTH = 32;

const Guide = styled.div`
  --guide-margin-vertical: 24px;
  --color-highlight: rgb(0, 179, 255);

  position: absolute;
  width: ${GUIDE_ACCESSIBLE_WIDTH}px;
  top: var(--guide-margin-vertical);
  bottom: var(--guide-margin-vertical);

  &[data-left="true"] {
    left: ${-(GUIDE_MARGIN + GUIDE_ACCESSIBLE_WIDTH)}px;
  }

  &[data-right="true"] {
    right: ${-(GUIDE_MARGIN + GUIDE_ACCESSIBLE_WIDTH)}px;
  }

  ::after {
    content: "";
    position: absolute;
    opacity: 0;
    top: 0;
    /* center under parent */
    left: 50%;

    width: 2px;
    height: 100%;
    background: var(--color-highlight);

    transition: opacity 0.2s ease-in-out;
  }

  &[data-over="true"] {
    ::after {
      opacity: 1;
    }
  }

  &:hover {
    ::after {
      opacity: 1;
    }
  }
`;
