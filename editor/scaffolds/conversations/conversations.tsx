import React from "react";

import { useEditorState, useWorkspaceState } from "core/states";
import styled from "@emotion/styled";

import { useFigmaComments } from "services/figma-comments-service";
import { TopLevelComment } from "./comment";
import { copy } from "utils/clipboard";

export function Conversations() {
  const wssate = useWorkspaceState();
  const [state] = useEditorState();
  const filekey = state.design?.key;

  const [comments, dispatch] = useFigmaComments(
    filekey,
    wssate.figmaAuthentication
  );

  const me = wssate.figmaUser;

  return (
    <>
      <CommentsListContainer>
        {comments.map((c, i) => {
          return (
            <TopLevelComment
              me={me}
              key={i}
              {...c}
              readonly={false}
              onReply={(message) => {
                dispatch({
                  type: "post",
                  message,
                  comment_id: c.id,
                  me: me.id,
                });
              }}
              onCopyLink={(id) => {
                const url = `https://www.figma.com/file/${filekey}?#${id}`;
                copy(url, { notify: true });
              }}
              onDelete={(id) => {
                dispatch({ type: "delete", comment_id: id, me: me.id });
              }}
              onReaction={(id, emoji) => {
                dispatch({ type: "react", comment_id: id, emoji, me: me.id });
              }}
            />
          );
        })}
      </CommentsListContainer>
    </>
  );
}

const CommentsListContainer = styled.div`
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;

  div:first-of-type {
    border-top: none;
  }
`;
