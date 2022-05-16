import React, { useState, useEffect } from "react";
import Dialog from "@material-ui/core/Dialog";

import { BoringScaffold } from "@grida.co/app/boring-scaffold";
import { PublishPostReviewDialogBody } from "../dialogs";
import { PostsClient } from "../api";
import { BoringDocumentsStore } from "@boring.so/store";
import { BoringContent, BoringTitle } from "@boring.so/document-model";
import type { OnContentChange } from "@boringso/react-core";
import { RightActionBar } from "../components/app-bar";
import type { Post } from "../types";

const store = new BoringDocumentsStore();

type PostEditPageProps = { id: string } | { draft: true };

export default function PostEditPage({ id }: { id: string }) {
  const [publishDialog, setPublishDialog] = React.useState(false); // controls review dialog

  const client = new PostsClient("627c481391a5de075f80a177");
  const [data, setData] = useState<Post>();
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<"saving" | "saved" | "error">(undefined);

  useEffect(() => {
    client.get(id).then((post) => {
      setData(post);
      setLoaded(true);
    });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    // load from store
    store.get(id).then((doc) => {
      if (doc) {
        setData({
          id,
          ...doc,
          title: doc.title.raw,
          body: doc.content.raw,
          isDraft: true,
        });
      }
    });
  }, [id]);

  useEffect(() => {
    if (!data) return;

    store.put({
      id: id,
      title: new BoringTitle(data.title),
      content: data.body.html
        ? new BoringContent(data.body.html)
        : new BoringContent(""),
    });
  }, [data]);

  const onTitleChange = debounce((t) => {
    setSaving("saving");
    setData((d) => ({ ...d, title: t }));
    client
      .updateTitle(id, t)
      .then(() => {
        setSaving("saved");
      })
      .catch((e) => {
        setSaving("error");
      });
  }, 1000);

  const onContentChange = debounce((t) => {
    setSaving("saving");
    setData((d) => ({ ...d, body: { html: t } }));
    client
      .updateBody(id, t)
      .then(() => {
        setSaving("saved");
      })
      .catch((e) => {
        setSaving("error");
      });
  }, 3000);

  const onSummaryChange = debounce((t) => {
    setSaving("saving");
    setData((d) => ({ ...d, summary: t }));
    client
      .updateSummary(id, { summary: t })
      .then(() => {
        setSaving("saved");
      })
      .catch((e) => {
        setSaving("error");
      });
  }, 1000);

  const canPublish: boolean =
    data && !!data.title.length && !!data.body.html?.length;

  return (
    <>
      <Dialog
        maxWidth="xl"
        open={publishDialog}
        onClose={() => {
          setPublishDialog(false);
        }}
      >
        {data && (
          <PublishPostReviewDialogBody
            title={data.title}
            summary={data.summary}
            tags={data.tags}
            onPublish={(p) => {
              // 1. update with value (TODO:)
              client.publish(id).then(({ id }) => {
                // 2. then => publish
                setPublishDialog(false);
                open("https://grida.co/blogs/" + id);
              });
            }}
            onTitleChange={onTitleChange}
            onSummaryChange={onSummaryChange}
            onSchedule={(p) => {
              // TODO:
              // 1. update with value
              // 2. them => schedule
              setPublishDialog(false);
            }}
            onCancel={() => {
              setPublishDialog(false);
            }}
            onTagsEdit={(tags: string[]) => {
              // TODO:
            }}
            publication={{
              name: "Grida",
            }}
          />
        )}
      </Dialog>
      <RightActionBar
        mode={data?.postedAt ? "update" : "post"}
        saving={saving}
        disabled={!canPublish}
        onPreviewClick={() => {
          open("https://grida.co/blogs" + data.id);
        }}
        onPublishClick={() => {
          setPublishDialog(true);
        }}
      />
      <Editor
        id={id}
        store={store}
        onTitleChange={onTitleChange}
        onContentChange={onContentChange}
        readonly={!loaded}
      />
    </>
  );
}

function Editor({
  id,
  store,
  onTitleChange,
  onContentChange,
  readonly,
}: {
  id: string;
  store;
  onContentChange: OnContentChange;
  onTitleChange: (t: string) => void;
  readonly: boolean;
}) {
  return (
    <BoringScaffold
      readonly={readonly}
      initial={id}
      onContentChange={onContentChange}
      onTitleChange={onTitleChange}
    />
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
