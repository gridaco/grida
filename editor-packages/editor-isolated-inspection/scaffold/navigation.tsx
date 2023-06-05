import React, { useCallback, useMemo } from "react";
import styled from "@emotion/styled";
import { useEditorState } from "editor/core/states";
import { useDispatch } from "editor/core/dispatch";
import { CaretLeftIcon, CaretRightIcon } from "@radix-ui/react-icons";
import { IconButton } from "@code-editor/ui";
import { findUnder, findShifted } from "../utils/find-under";

export function Navigation() {
  const [state] = useEditorState();
  const dispatch = useDispatch();
  const { design, selectedNodes, canvas: canvasMeta, isolation } = state;

  const id = isolation.node;
  const scene = useMemo(() => findUnder(id, design), [id, design]);

  const previousitem = useMemo(() => findShifted(id, design, -1), [id, design]);
  const nextitem = useMemo(() => findShifted(id, design, 1), [id, design]);

  const onPreviousClick = useCallback(() => {
    dispatch({
      type: "design/enter-isolation",
      node: previousitem.id,
    });
  }, [dispatch, previousitem]);
  const onNextClick = useCallback(() => {
    dispatch({
      type: "design/enter-isolation",
      node: nextitem.id,
    });
  }, [dispatch, nextitem]);

  return (
    <div data-wtf="editor-isolated-inspection-navigation">
      <NavigationPositioner>
        <NavigationBar>
          <IconButton
            outline="none"
            onClick={onPreviousClick}
            disabled={!!!previousitem}
          >
            <CaretLeftIcon />
          </IconButton>
          <span className="label">{scene.name}</span>
          <IconButton
            outline="none"
            onClick={onNextClick}
            disabled={!!!nextitem}
          >
            <CaretRightIcon />
          </IconButton>
        </NavigationBar>
      </NavigationPositioner>
    </div>
  );
}

const NavigationPositioner = styled.div`
  pointer-events: none;
  z-index: 9;

  position: absolute;
  top: 0;
  left: 0;
  right: 0;

  display: flex;
  align-items: center;
  justify-content: center;
`;

const NavigationBar = styled.div`
  pointer-events: all;
  margin: 24px;

  display: flex;
  align-items: center;

  color: white;
  border-radius: 4px;
  background-color: rgba(0, 0, 0, 0.9);
  padding: 4px;
  gap: 4px;

  .label {
    padding: 0 8px;
    font-size: 0.8em;
    text-align: center;
    min-width: 160px;
    max-width: 320px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;
