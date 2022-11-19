import React from "react";
import styled from "@emotion/styled";
import { EditorTaskItem } from "./editor-task-item";
import { EditorProgressIndicatorButton } from "./editor-progress-indicator-trigger-button";
import { EditorProgressIndicatorPopoverContent } from "./editor-progress-indicator-popover-content";
import * as Popover from "@radix-ui/react-popover";
import { TaskQueue } from "core/states";
import { styled as s, keyframes } from "@stitches/react";

export function EditorProgressIndicator({ isBusy, tasks }: TaskQueue) {
  const TasksBody = () => {
    if (tasks.length === 0) {
      return <Empty>No background tasks</Empty>;
    }
    return (
      <>
        {tasks.map((task) => (
          <EditorTaskItem
            key={task.id}
            label={task.name}
            description={task.description}
            progress={task.progress}
            createdAt={task.createdAt}
          />
        ))}
      </>
    );
  };

  return (
    <Popover.Root>
      <StyledTrigger>
        <EditorProgressIndicatorButton isBusy={isBusy} />
      </StyledTrigger>
      <StyledContent
        side="bottom"
        sideOffset={4}
        collisionPadding={16}
        style={{
          marginTop: 8,
        }}
      >
        <EditorProgressIndicatorPopoverContent>
          <TasksBody />
        </EditorProgressIndicatorPopoverContent>
      </StyledContent>
    </Popover.Root>
  );
}

const StyledTrigger = styled(Popover.Trigger)`
  outline: none;
  border: none;
  background: none;
`;

const scaleIn = keyframes({
  "0%": { opacity: 0 },
  "100%": { opacity: 1 },
});

const StyledContent = s(Popover.Content, {
  animation: `${scaleIn} 0.1s ease-out`,
});

const Empty = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
`;
