import React from "react";
import styled from "@emotion/styled";
import Highlighter from "react-highlight-words";

export interface DashboardItemCardProps {
  selected?: boolean;
  onClick?: (e) => void;
  onDoubleClick?: () => void;
  q?: string;
  style?: React.CSSProperties;
  /**
   * an explicit field to set the view as accepting drag state view.
   */
  isOver?: boolean;
  preview: React.ReactNode;
  label: string;
  icon?: React.ReactNode;
}

export const DashboardItemCard = React.forwardRef(function (
  {
    onClick,
    onDoubleClick,
    selected,
    isOver,
    style = {},
    label,
    q,
    icon,
    preview,
  }: DashboardItemCardProps,
  ref: React.Ref<HTMLDivElement>
) {
  return (
    <Card
      ref={ref}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      data-selected={selected}
      data-over={isOver}
      style={{
        ...style,
      }}
    >
      <PreviewContainer data-selected={selected} data-over={isOver}>
        <span id="overlay" />
        {preview}
      </PreviewContainer>
      <footer>
        <label>
          {!!icon && icon}
          <Highlighter
            className="name"
            highlightClassName="name"
            searchWords={q ? [q] : []}
            textToHighlight={label}
            autoEscape // required to escape regex special characters, like, `+`, `(`, `)`, etc.
          />
        </label>
      </footer>
    </Card>
  );
});

const Card = styled.div`
  display: flex;
  flex-direction: column;
  flex: 0;

  label {
    padding: 16px 0;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }

  .name {
    opacity: 0.6;
    font-size: 12px;
    font-weight: 500;
    color: white;
    mark {
      background: white;
      color: black;
    }

    transition: all 0.2s ease-in-out;
  }

  &:hover,
  &[data-selected="true"],
  &[data-over="true"] {
    .name {
      opacity: 1;
    }
  }
`;

const PreviewContainer = styled.div`
  outline: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 2px;
  overflow: hidden;
  overflow: hidden;
  box-sizing: border-box;

  #overlay {
    display: none;
    z-index: 99;
    position: absolute;
    width: inherit;
    height: inherit;
    background: rgba(0, 0, 255, 0.1);
  }

  #view {
    pointer-events: none;
    user-select: none;
    transform-origin: top left;
    transition: all 0.2s ease-in-out;
  }

  &[data-selected="true"] {
    outline: 4px solid rgb(0, 179, 255);

    #overlay {
      display: block;
    }
  }

  &[data-over="true"] {
    outline: 4px solid rgb(0, 179, 255);

    #view {
      opacity: 0.5;
    }
  }

  transition: all 0.2s ease-in-out;
`;
