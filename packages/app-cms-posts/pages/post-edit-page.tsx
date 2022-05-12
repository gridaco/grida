import React, { useState, useEffect } from "react";
import Dialog from "@material-ui/core/Dialog";

import { BoringScaffold } from "@grida.co/app/boring-scaffold";
import { PublishPostReviewDialogBody } from "../dialogs";
import { PostsClient } from "../api";
import { BoringDocumentsStore } from "@boring.so/store";
import { BoringContent, BoringTitle } from "@boring.so/document-model";

interface Post {
  id: string;
  title: string;
  summary?: string;
  body: any;
}

export default function PostEditPage({ id }: { id: string }) {
  const [review, setReview] = React.useState(false);
  const client = new PostsClient("627c481391a5de075f80a177");
  const store = new BoringDocumentsStore();
  const [data, setData] = useState<Post>();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    client.get(id).then((post) => {
      console.log(post);
      setData(post);
    });
  }, [id]);

  useEffect(() => {
    if (!data) return;
    console.log(data);
    store
      .put({
        id: id,
        title: new BoringTitle(data.title),
        content: data.body.html
          ? new BoringContent(data.body.html)
          : new BoringContent(""),
      })
      .then(() => {
        setLoaded(true);
      });
  }, [data]);

  const onTitleChange = debounce((t) => {
    client.updateTitle(id, t);
  }, 1000);

  const onContentChange = debounce((t) => {
    console.log(t);
    client.updateBody(id, t);
  }, 3000);

  const onSummaryChange = debounce((t) => {
    client.updateSummary(id, { summary: t });
  }, 1000);

  return (
    <div>
      <Dialog
        maxWidth="xl"
        open={review}
        onClose={() => {
          setReview(false);
        }}
      >
        <PublishPostReviewDialogBody
          title="Hi"
          onPublish={(p) => {
            // 1. update with value (TODO:)
            client.publish(id).then(() => {
              // 2. then => publish
              setReview(false);
            });
          }}
          onTitleChange={onTitleChange}
          onSummaryChange={onSummaryChange}
          onSchedule={(p) => {
            // TODO:
            // 1. update with value
            // 2. them => schedule
            setReview(false);
          }}
          onCancel={() => {
            setReview(false);
          }}
          onTagsEdit={(tags: string[]) => {
            // TODO:
          }}
          publication={{
            name: "Grida",
          }}
        />
      </Dialog>
      <button
        onClick={() => {
          setReview(true);
        }}
      >
        publish
      </button>
      {loaded && (
        <BoringScaffold
          initial={id}
          onContentChange={onContentChange}
          onTitleChange={onTitleChange}
        />
      )}
    </div>
  );
}

function debounce(func, timeout = 2000) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, timeout);
  };
}
