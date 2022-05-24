import React from "react";
import styled from "@emotion/styled";
import { TableTabItem } from "@app/blocks/table-tab-item";
import type { PostStatusType } from "../types";

const tabs: { id: PostStatusType; label: string }[] = [
  {
    id: "draft",
    label: "Drafts and submissions",
  },
  // {
  //   id: "scheduled",
  //   label: "Scheduled",
  // },
  {
    id: "published",
    label: "Published",
  },
  {
    id: "unlisted",
    label: "Unlisted",
  },
];

export function PostsTableToolBar({
  tab,
  onSelect,
  getBadge,
  onNewPostClick,
}: {
  tab: PostStatusType;
  onSelect: (tab: PostStatusType) => void;
  getBadge: (tab: PostStatusType) => string;
  onNewPostClick?: () => void;
}) {
  return (
    <Toolbar>
      <Underline />
      <Tools>
        <Tabs>
          {tabs.map((t) => (
            <TableTabItem
              key={t.id}
              selected={tab === t.id}
              badge={getBadge(t.id)}
              onClick={() => {
                onSelect(t.id);
              }}
            >
              {t.label}
            </TableTabItem>
          ))}
        </Tabs>
        <Actions>
          <Button onClick={onNewPostClick}>New Post</Button>
        </Actions>
      </Tools>
    </Toolbar>
  );
}

const Toolbar = styled.div`
  height: 50px;
  position: relative;
`;

const Underline = styled.div`
  height: 1px;
  background-color: rgba(0, 0, 0, 0.1);
  position: absolute;
  left: 0px;
  right: 0px;
  bottom: 0px;
`;

const Tools = styled.div`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  align-items: center;
  flex: none;
  box-sizing: border-box;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const Tabs = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: flex-start;
  gap: 21px;
  align-self: stretch;
  box-sizing: border-box;
  flex-shrink: 1;
  overflow-x: scroll;
  ::-webkit-scrollbar {
    display: none;
  }
`;

const Actions = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  align-self: stretch;
  box-sizing: border-box;
  padding-left: 10px;
  flex-shrink: 0;
`;

const Button = styled.button`
  cursor: pointer;
  outline: none;
  border: none;
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 4px;
  border-radius: 4px;
  background-color: ${(props) =>
    // @ts-ignore
    props.theme.app_posts_cms.colors.button_primary};
  box-sizing: border-box;
  padding: 8px 10px;
  color: white;
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Inter, sans-serif;
  font-weight: 500;
  text-align: center;

  :hover {
    opacity: 0.8;
  }

  :active {
    opacity: 0.9;
  }

  transition: opacity 0.1s ease-in-out;
`;
