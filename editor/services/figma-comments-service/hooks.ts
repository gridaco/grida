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

        // update records - todo: delete removed records (not in the response)
        comments.map((c) => {
          store.upsert(c);
        });
      });
    }
  }, [auth.accessToken, auth.personalAccessToken, filekey]);

  return comments;
}
