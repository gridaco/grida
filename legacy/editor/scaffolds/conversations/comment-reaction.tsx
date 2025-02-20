import React from "react";
import styled from "@emotion/styled";
import type { User } from "@design-sdk/figma-remote-api";
import type { ReactionEmoji } from "services/figma-comments-service";
import { emojimap } from "./k";

export function Reaction({
  users,
  emoji,
  selected,
  onClick,
}: {
  selected?: boolean;
  users: Array<User>;
  emoji: ReactionEmoji;
  onClick?: () => void;
}) {
  return (
    <Emoji data-selected={selected} onClick={onClick}>
      {emojimap[emoji]}
      <label>{users.length}</label>
    </Emoji>
  );
}

const Emoji = styled.span`
  cursor: default;
  font-size: 16px;
  border-radius: 16px;
  padding: 4px 6px;
  height: 21px;
  background: rgba(255, 255, 255, 0.1);
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;

  &[data-selected="true"] {
    background: rgba(0, 0, 0, 0.8);
    outline: 1px solid rgba(255, 255, 255, 0.5);
  }

  label {
    opacity: 0.8;
    font-size: 10px;
    color: white;
    margin-left: 4px;
  }
`;
