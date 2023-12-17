import React from "react";
import styled from "@emotion/styled";
import Highlighter from "react-highlight-words";

const DASHBOARD_ITEM_CARD_CLASSNAME = "dashboard-item-card";
export const DASHBOARD_ITEM_CARD_SELECTOR = "." + DASHBOARD_ITEM_CARD_CLASSNAME;
export const DASHBOARD_ITEM_PATH_ATTRIBUTE = "data-path";

export interface DashboardItemCardProps {
  id?: string;
  path: string;
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
    id,
    onClick,
    onDoubleClick,
    path,
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
  const _p = {
    // the data-path works as a unique identifier of the item for drag selection ev listeners
    id: id,
    className: DASHBOARD_ITEM_CARD_CLASSNAME,
    [DASHBOARD_ITEM_PATH_ATTRIBUTE]: path,
  };

  return (
    <Card
      ref={ref}
      {..._p}
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
  --color-highlight: rgb(0, 179, 255);
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

  .scale-on-over {
    overflow: hidden;
    will-change: transform;
    transition: all 0.2s ease-in-out;
  }

  &[data-selected="true"] {
    outline: 4px solid var(--color-highlight);

    #overlay {
      display: block;
    }
  }

  &[data-over="true"] {
    outline: 4px solid var(--color-highlight);

    #view {
      opacity: 0.5;
    }

    .scale-on-over {
      border-radius: 5px;
      transform: scale(0.85);
    }
  }

  transition: all 0.2s ease-in-out;
`;
