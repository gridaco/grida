import React, { useState } from "react";
import type { User } from "@design-sdk/figma-remote-api";
import { useEditorState } from "core/states";
import { useFigmaAccessToken } from "hooks/use-figma-access-token";
import styled from "@emotion/styled";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  useFigmaComments,
  Comment,
  Reply,
} from "services/figma-comments-service";

dayjs.extend(relativeTime);

export function Conversations() {
  const [state] = useEditorState();
  const fat = useFigmaAccessToken();
  const filekey = state.design?.key;

  const comments = useFigmaComments(filekey, {
    personalAccessToken: fat.personalAccessToken,
    accessToken: fat.accessToken.token,
  });

  return (
    <>
      <CommentsListContainer>
        {comments.map((c) => {
          return <TopLevelComment key={c.id} {...c} />;
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

function TopLevelComment({
  user,
  message,
  client_meta,
  order_id,
  created_at,
  resolved_at,
  replies,
  reactions,
  id,
}: Comment) {
  const [hover, setHover] = useState(false);
  return (
    <TopLevelCommentContainer
      data-hover={hover}
      onMouseEnter={() => {
        setHover(true);
      }}
      onMouseLeave={() => {
        setHover(false);
      }}
    >
      <ThreadNumber>#{order_id}</ThreadNumber>
      <ThreadUserDisplay>
        <UserAvatar {...user} from="figma" size={30} />
        <div>
          <UserLabel>{user.handle}</UserLabel>
          <span> </span>
          <DateMeta>{dayjs(created_at).fromNow()}</DateMeta>
        </div>
      </ThreadUserDisplay>
      <Message>{message}</Message>
      <ReactionsContainer>
        {reactions.map((r, i) => {
          return <Reaction key={i} emoji={r.emoji as any} user={r.user} />;
        })}
      </ReactionsContainer>
      <RepliesContainer>
        {replies.map((r, i) => {
          return <ReplyComment key={i} {...r} />;
        })}
      </RepliesContainer>
    </TopLevelCommentContainer>
  );
}

const ThreadUserDisplay = styled.div`
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
`;

const TopLevelCommentContainer = styled.div`
  display: flex;
  flex-direction: column;
  padding: 16px;
  border-radius: 4px;
  &[data-hover="true"] {
    background: rgba(0, 0, 0, 0.2);
  }

  border-top: 1px solid rgba(255, 255, 255, 0.1);
`;

const UserLabel = styled.label`
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
`;

const DateMeta = styled.label`
  font-size: 12px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.5);
`;

const ThreadNumber = styled.label`
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
`;

const Message = styled.p`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
`;

const RepliesContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
`;

function UserAvatar({
  handle,
  img_url,
  from,
  id,
  size,
}: User & {
  size?: number;
  from: "figma" | "grida";
}) {
  return (
    <AvatarContainer
      title={handle}
      style={{
        width: size,
        height: size,
      }}
    >
      <img src={img_url} />
    </AvatarContainer>
  );
}

const AvatarContainer = styled.div`
  border-radius: 50%;
  overflow: hidden;
  width: 32px;
  height: 32px;

  img {
    width: 100%;
    height: 100%;
  }
`;

const ReactionsContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  margin-bottom: 16px;
`;

function Reaction({
  user,
  emoji,
}: {
  user: User;
  emoji:
    | ":eyes:"
    | ":heart_eyes:"
    | ":heavy_plus_sign:"
    | ":+1:"
    | ":-1:"
    | ":joy:"
    | ":fire:";
}) {
  return <Emoji title={user.handle}>{emojimap[emoji]}</Emoji>;
}

const Emoji = styled.span`
  cursor: default;
  font-size: 16px;
  border-radius: 50%;
  padding: 4px;
  width: 21px;
  height: 21px;
  background: rgba(255, 255, 255, 0.1);
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const emojimap = {
  ":eyes:": "👀",
  ":heart_eyes:": "😍",
  ":heavy_plus_sign:": "➕",
  ":+1:": "👍",
  ":-1:": "👎",
  ":joy:": "😂",
  ":fire:": "🔥",
};

function ReplyComment({ user, message, created_at }: Reply) {
  const [hover, setHover] = useState(false);
  return (
    <ReplyCommentContainer
      data-hover={hover}
      onMouseEnter={() => {
        setHover(true);
      }}
      onMouseLeave={() => {
        setHover(false);
      }}
    >
      <ReplyUserDisplay>
        <UserAvatar {...user} from="figma" size={16} />
        <UserLabel>{user.handle}</UserLabel>
        <span> </span>
        <DateMeta>{dayjs(created_at).fromNow()}</DateMeta>
      </ReplyUserDisplay>
      <Message>{message}</Message>
    </ReplyCommentContainer>
  );
}

const ReplyCommentContainer = styled.div`
  &[data-hover="true"] {
    background: rgba(0, 0, 0, 0.2);
  }
`;

const ReplyUserDisplay = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
`;
