import React from "react";
import styled from "@emotion/styled";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  DotsVerticalIcon,
} from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@editor-ui/dropdown-menu";
import { IconButton } from "@code-editor/ui";
import Highlighter from "react-highlight-words";
import * as Collapsible from "@radix-ui/react-collapsible";

export type SectionHeaderAction = {
  label: string;
  handler: () => void;
};

export function SectionHeader({
  label,
  expanded = true,
  q,
  id,
  actions = [],
}: {
  expanded?: boolean;
  label: string;
  q?: string;
  id: string;
  actions?: SectionHeaderAction[];
}) {
  const iconprops = {
    color: "white",
  };

  const ToggleIcon = expanded ? ChevronDownIcon : ChevronRightIcon;

  return (
    <SectionHeaderContainer id={id}>
      <Collapsible.Trigger asChild>
        <div className="leading">
          <div className="toggle">
            <ToggleIcon />
          </div>
          <Highlighter
            className="label"
            highlightClassName="label"
            searchWords={q ? [q] : []}
            textToHighlight={label}
            autoEscape // required to escape regex special characters, like, `+`, `(`, `)`, etc.
          />
          <div style={{ flex: 1 }} />
        </div>
      </Collapsible.Trigger>
      <div className="actions">
        {actions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton>
                <DotsVerticalIcon />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {actions.map((action, i) => (
                <DropdownMenuItem
                  key={i}
                  onSelect={(e) => {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    action.handler();
                  }}
                >
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </SectionHeaderContainer>
  );
}

const SectionHeaderContainer = styled.div`
  display: flex;
  align-items: center;
  flex-direction: row;
  margin-bottom: 16px;
  border-radius: 4px;
  cursor: pointer;

  background: transparent;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .leading {
    padding: 16px;
    display: flex;
    flex-direction: row;
    align-items: center;
    flex: 1;
  }

  .toggle {
    margin-right: 16px;
    color: white;
  }

  .actions {
    padding: 16px;
    margin-left: auto;
  }

  .label {
    user-select: none;
    display: inline-block;
    opacity: 0.8;
    color: white;
    font-size: 18px;
    font-weight: 500;
    mark {
      background: white;
      color: black;
    }
  }
`;
