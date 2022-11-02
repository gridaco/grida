import React from "react";
import styled from "@emotion/styled";
import type { User } from "@design-sdk/figma-remote-api";
import type {
  Comment,
  Reply,
  ReactionEmoji,
  Reactions,
} from "services/figma-comments-service";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { MessageInput } from "./message-input";
import { DotsVerticalIcon } from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuContent,
} from "@editor-ui/dropdown-menu";
import { Reaction } from "./comment-reaction";
import { emojimap } from "./k";

dayjs.extend(relativeTime);

type CommentProps = {
  onDelete?: (id: string) => void;
  onReaction?: (id: string, emoji: ReactionEmoji) => void;
  onCopyLink?: (id: string) => void;
};

type ThreadProps = CommentProps & {
  onReply?: (reply: string) => void;
};

type MeProps = {
  me?: { id: string; name: string; profile: string };
};

export function TopLevelComment({
  me,
  user,
  message,
  client_meta,
  order_id,
  created_at,
  resolved_at,
  replies,
  reactions,
  id,
  readonly,
  file_key,
  parent_id,
  ...props
}: Comment & { readonly?: boolean } & ThreadProps & MeProps) {
  const ReplyMessageBox = () => {
    if (readonly === false) {
      return (
        <MessageInput
          placeholder="Reply..."
          onSend={(text: string) => {
            (props as ThreadProps).onReply(text);
          }}
        />
      );
    }
    return <></>;
  };

  const ReadonlyFalseCommentMenus = () => {
    if (readonly === false) {
      const { onCopyLink, onDelete, onReaction } = props as ThreadProps;
      return (
        <div className="hover-menus">
          <CommentMenus
            disableDelete={me.id !== user.id}
            onCopyLinkClick={() => {
              onCopyLink(id);
            }}
            onDeleteClick={() => {
              onDelete(id);
            }}
            onReactionClick={(emoji) => {
              onReaction(id, emoji);
            }}
          />
        </div>
      );
    }
    return <></>;
  };

  const reactions_by_emoji = map_reactions_for_display(reactions, me.id);

  return (
    <TopLevelCommentContainer>
      <ReadonlyFalseCommentMenus />
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
        {reactions_by_emoji.map((r, i) => {
          return (
            <Reaction
              key={i}
              {...r}
              onClick={() => {
                props.onReaction(id, r.emoji);
              }}
            />
          );
        })}
      </ReactionsContainer>
      <RepliesContainer>
        {replies.map((r, i) => {
          return (
            <ThreadReplyComment
              key={i}
              {...r}
              me={me}
              onCopyLink={props.onCopyLink}
              onDelete={props.onDelete}
              onReaction={props.onReaction}
            />
          );
        })}
      </RepliesContainer>
      <ReplyMessageBox />
    </TopLevelCommentContainer>
  );
}

/**
 * map array of reactions by same emojis and count.
 */
const map_reactions_for_display = (
  reactions: Reactions,
  me: string
): Array<{ emoji: ReactionEmoji; users: User[]; selected: boolean }> => {
  return reactions.reduce((acc, r) => {
    const { user, emoji } = r;
    const i = acc.findIndex((r) => r.emoji === emoji);

    if (i > -1) {
      acc[i].users.push(user);
      acc[i].selected = acc[i].selected || user.id === me;
    } else {
      acc.push({
        emoji: emoji,
        users: [user],
        selected: user.id === me,
      });
    }
    return acc;
  }, []);
};

const ThreadUserDisplay = styled.div`
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
`;

const TopLevelCommentContainer = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 16px;
  border-radius: 4px;

  &:hover {
    background: rgba(0, 0, 0, 0.2);
  }

  border-top: 1px solid rgba(255, 255, 255, 0.1);

  .hover-menus {
    pointer-events: none;
    position: absolute;
    opacity: 0;
    margin: -12px 12px 0 0;
    top: 0;
    right: 0;
  }

  &:hover {
    .hover-menus {
      pointer-events: auto;
      opacity: 1;
    }
  }
`;

const quick_reactions = [":eyes:", ":+1:", ":fire:"] as const;

function CommentMenus({
  disableDelete,
  onReactionClick,
  onDeleteClick,
  onCopyLinkClick,
}: {
  disableDelete: boolean;
  onCopyLinkClick: () => void;
  onDeleteClick: () => void;
  onReactionClick: (emoji: ReactionEmoji) => void;
}) {
  return (
    <MenusContainer>
      {quick_reactions.map((r, i) => {
        return (
          <MenuItem
            key={i}
            onClick={() => {
              onReactionClick?.(r);
            }}
          >
            {emojimap[r]}
          </MenuItem>
        );
      })}
      <MenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <DotsVerticalIcon color="white" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {!disableDelete && (
              <DropdownMenuItem onClick={onDeleteClick}>
                <DropdownMenuLabel style={{ color: "red" }}>
                  Delete message
                </DropdownMenuLabel>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onCopyLinkClick}>
              <DropdownMenuLabel>Copy link</DropdownMenuLabel>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </MenuItem>
    </MenusContainer>
  );
}

const MenusContainer = styled.div`
  display: flex;
  gap: 4px;
  padding: 2px;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 4px;
  outline: 1px solid rgba(255, 255, 255, 0.1);
`;

const MenuItem = styled.span`
  cursor: pointer;
  display: flex;
  font-size: 12px;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  padding: 4px;
  :hover {
    background: rgba(255, 255, 255, 0.1);
  }

  button {
    background: transparent;
    outline: none;
    border: none;
  }
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
  gap: 4px;
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
  background-color: grey;

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

function ThreadReplyComment({
  id,
  me,
  user,
  message,
  created_at,
  reactions,
  readonly,
  order_id,
  ...props
}: Reply & CommentProps & { readonly?: boolean } & MeProps) {
  const NoReadonlyMenus = () => {
    if (!readonly) {
      const { onReaction, onDelete, onCopyLink } = props as CommentProps;
      return (
        <div className="reply-hover-menus">
          <CommentMenus
            disableDelete={user.id !== me.id}
            onCopyLinkClick={() => {
              onCopyLink(id);
            }}
            onDeleteClick={() => {
              onDelete(id);
            }}
            onReactionClick={(emoji: ReactionEmoji) => {
              onReaction(id, emoji);
            }}
          />
        </div>
      );
    }
    return <></>;
  };

  const reactions_by_emoji = map_reactions_for_display(reactions, me.id);

  return (
    <ReplyCommentContainer>
      <NoReadonlyMenus />
      <ReplyUserDisplay>
        <UserAvatar {...user} from="figma" size={16} />
        <UserLabel>{user.handle}</UserLabel>
        <span> </span>
        <DateMeta>{dayjs(created_at).fromNow()}</DateMeta>
      </ReplyUserDisplay>
      <Message>{message}</Message>
      <ReactionsContainer>
        {reactions_by_emoji.map((r, i) => {
          return (
            <Reaction
              key={i}
              {...r}
              onClick={() => {
                props.onReaction(id, r.emoji);
              }}
            />
          );
        })}
      </ReactionsContainer>
    </ReplyCommentContainer>
  );
}

const ReplyCommentContainer = styled.div`
  position: relative;
  border-radius: 2px;
  padding: 8px;
  &:hover {
    background: rgba(0, 0, 0, 0.2);
  }

  .reply-hover-menus {
    pointer-events: none;
    position: absolute;
    opacity: 0;
    top: 0;
    right: 0;
    margin: -12px -6px 0 0;
  }

  &:hover {
    .reply-hover-menus {
      pointer-events: auto;
      opacity: 1;
    }
  }
`;

const ReplyUserDisplay = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
`;
