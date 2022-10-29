import { useState, useMemo, useEffect } from "react";
import { FigmaCommentsStore } from "./figma-comments-store";
import { Client, Comment } from "@design-sdk/figma-remote-api";

export function useComments(
  filekey: string,
  auth: {
    personalAccessToken?: string;
    accessToken?: string;
  }
) {
  const [comments, setComments] = useState<ReadonlyArray<Comment>>([]);

  const store = useMemo(
    () => (filekey ? new FigmaCommentsStore(filekey) : null),
    [filekey]
  );

  useEffect(() => {
    // load from store
    if (store) {
      store.getAll().then((comments) => {
        setComments(comments);
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
        setComments(d.data.comments);

        // update records - todo: delete removed records (not in the response)
        d.data.comments.map((c) => store.upsert(c));
      });
    }
  }, [auth, filekey]);

  return comments;
}
