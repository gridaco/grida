import React from "react";

import { useEditorState } from "core/states";
import { useFigmaAccessToken } from "hooks/use-figma-access-token";
import styled from "@emotion/styled";

import { useFigmaComments } from "services/figma-comments-service";
import { TopLevelComment } from "./comment";

export function Conversations() {
  const [state] = useEditorState();
  const fat = useFigmaAccessToken();
  const filekey = state.design?.key;

  const [comments, dispatch] = useFigmaComments(filekey, {
    personalAccessToken: fat.personalAccessToken,
    accessToken: fat.accessToken.token,
  });

  return (
    <>
      <CommentsListContainer>
        {comments.map((c) => {
          return (
            <TopLevelComment
              key={c.id}
              {...c}
              readonly={false}
              onReply={(message) => {
                dispatch({ type: "post", message, comment_id: c.id });
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

  div:first-child {
    border-top: none;
  }
`;
