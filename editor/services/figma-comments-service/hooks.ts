import { useState, useMemo, useEffect } from "react";
import { FigmaCommentsStore } from "./figma-comments-store";
import { Client, Comment as RawComment } from "@design-sdk/figma-remote-api";
import type { Comment } from "./types";

export function useFigmaComments(
  filekey: string,
  auth: {
    personalAccessToken?: string;
    accessToken?: string;
  }
) {
  const [raws, setRaws] = useState<RawComment[]>([]);
  const [comments, setComments] = useState<ReadonlyArray<Comment>>([]);

  const oncommentsload = (comments: Array<RawComment>) => {
    const threads = comments.filter((c) => !!!c.parent_id);
    const replies = comments.filter((c) => !!c.parent_id);

    const tree = threads.reduce((acc, thread) => {
      acc.push(<Comment>{
        ...thread,
        replies: replies
          .filter((reply) => reply.parent_id === thread.id)
          .sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
          ),
      });
      return acc;
    }, []);

    // sort by order_id
    const sorted = tree.sort((a, b) => {
      return b.order_id - a.order_id;
    });

    setRaws(comments);
    setComments(sorted);
  };

  const store = useMemo(
    () => (filekey ? new FigmaCommentsStore(filekey) : null),
    [filekey]
  );

  useEffect(() => {
    // load from store
    if (store) {
      store.getAll().then((comments) => {
        oncommentsload(Array.from(comments));
      });
    }
  }, [store]);

  useEffect(() => {
    // load from api
    if (filekey && (auth.personalAccessToken || auth.accessToken)) {
      const client = Client({
        personalAccessToken: auth.personalAccessToken,
        accessToken: auth.accessToken,
      });

      client.comments(filekey).then((d) => {
        const comments = d.data.comments;
        oncommentsload(Array.from(comments));

        // update records after clearing all.
        store.clear();
        comments.map((c) => {
          store.upsert(c);
        });
      });
    }
  }, [auth.accessToken, auth.personalAccessToken, filekey]);

  const dispatch = ({ type: action, ...p }: CommentActions) => {
    const client = Client({
      personalAccessToken: auth.personalAccessToken,
      accessToken: auth.accessToken,
    });

    switch (action) {
      case "post": {
        const params = p as PostCommentAction;
        client
          .postComment(filekey, {
            comment_id: params.comment_id,
            message: params.message,
          })
          .then((d) => {
            const reply = d.data;
            // update records
            store.upsert(reply);
            // update state
            oncommentsload(Array.from([...raws, reply]));
          });
        break;
      }
      case "delete": {
        const { comment_id } = p as DeleteCommentAction;
        oncommentsload(raws.filter((c) => c.id !== comment_id));
        client.deleteComment(filekey, comment_id).then((d) => {
          const reply = d.data;
          // update records
          store.delete({ id: comment_id });
          // update state
        });
        break;
      }
      case "react": {
        const { comment_id, me, emoji } = p as ToggleReactionAction;
        const comment = raws.find((c) => c.id === comment_id);
        // check if user already has a reaction to the comment (with same emoji)
        if (comment) {
          const reaction = comment.reactions.find(
            (r) => r.user.id === me && r.emoji === emoji
          );
          if (reaction) {
            // remove reaction
            client
              .deleteCommentReaction(filekey, comment_id, { emoji })
              .then(() => {
                // update records
                store.upsert(updated);
              });

            // update comment with updated reaction
            const updated = {
              ...comment,
              reactions: comment.reactions.filter(
                (r) => !(r.user.id == me && r.emoji == emoji)
              ),
            };

            // update state (syncronously)
            oncommentsload(
              raws.map((c) => {
                if (c.id === comment_id) {
                  return updated;
                }
                return c;
              })
            );
          } else {
            // add reaction
            client
              .postCommentReaction(filekey, comment_id, { emoji })
              .then(() => {
                // update records
                store.upsert(updated);
              });

            // update comment with updated reaction
            const updated = {
              ...comment,
              reactions: [
                ...comment.reactions,
                {
                  user: {
                    id: me,
                    handle: "",
                    img_url: "",
                  },
                  emoji,
                  created_at: new Date(),
                },
              ],
            };

            // update state (syncronously)
            oncommentsload(
              raws.map((c) => {
                if (c.id === comment_id) {
                  return updated;
                }
                return c;
              })
            );
          }
        }
        // client.postCommentReaction
      }
    }
  };

  return [comments, dispatch] as const;
}

type PostCommentAction = {
  type: "post";
  message: string;
  comment_id: string;
  me: string;
};
type DeleteCommentAction = { type: "delete"; comment_id: string; me: string };
type ToggleReactionAction = {
  type: "react";
  comment_id: string;
  emoji: string;
  me: string;
};
type CommentActions =
  | PostCommentAction
  | DeleteCommentAction
  | ToggleReactionAction;
