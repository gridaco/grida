import React, { useEffect, useState } from "react";

import { Client, Comment, User } from "@design-sdk/figma-remote-api";
import { useEditorState } from "core/states";
import { useFigmaAccessToken } from "hooks/use-figma-access-token";
import styled from "@emotion/styled";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { InspectorSection } from "components/inspector";

dayjs.extend(relativeTime);

export function Conversations() {
  const [state] = useEditorState();
  const auth = useFigmaAccessToken();
  const filekey = state.design?.key;
  const [comments, setComments] = useState<ReadonlyArray<Comment>>([]);

  useEffect(() => {
    if (filekey && (auth.personalAccessToken || auth.accessToken)) {
      const client = Client({
        personalAccessToken: auth.personalAccessToken,
        accessToken: auth.accessToken.token,
      });

      client.comments(filekey).then((d) => {
        const comments = d.data.comments;
        setComments(comments);
      });
    }
  }, [filekey, auth]);

  const toplevelcomments = comments.filter((c) => !!!c.parent_id);

  return (
    <>
      <InspectorSection label="Comments">
        <CommentsListContainer>
          {toplevelcomments.map((c) => {
            return <TopLevelComment key={c.id} {...c} />;
          })}
        </CommentsListContainer>
      </InspectorSection>
    </>
  );
}

const CommentsListContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
`;

function TopLevelComment({
  user,
  message,
  client_meta,
  order_id,
  created_at,
  resolved_at,
  // reactions,
  id,
}: Comment) {
  return (
    <div>
      <UserAvatar {...user} from="figma" />
      <ThreadNumber>#{order_id}</ThreadNumber>
      <div>
        <UserLabel>{user.handle}</UserLabel>
        <span> </span>
        <DateMeta>{dayjs(created_at).fromNow()}</DateMeta>
      </div>
      <Message>{message}</Message>
    </div>
  );
}

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
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
`;

const Message = styled.p`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
`;

function UserAvatar({
  handle,
  img_url,
  from,
  id,
}: User & {
  from: "figma" | "grida";
}) {
  return (
    <AvatarContainer title={handle}>
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
