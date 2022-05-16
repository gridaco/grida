import React, { useState, useEffect } from "react";
import Dialog from "@material-ui/core/Dialog";

import { BoringScaffold } from "@grida.co/app/boring-scaffold";
import { PublishPostReviewDialogBody } from "../dialogs";
import { PostsClient } from "../api";
import { BoringDocumentsStore } from "@boring.so/store";
import { BoringContent, BoringTitle } from "@boring.so/document-model";
import type { OnContentChange } from "@boringso/react-core";
import { RightActionBar } from "../components/app-bar";

interface Post {
  id: string;
  title: string;
  summary?: string;
  body: any;
}
const store = new BoringDocumentsStore();

type PostEditPageProps = { id: string } | { draft: true };

export default function PostEditPage({ id }: { id: string }) {
  const [publishDialog, setPublishDialog] = React.useState(false); // controls review dialog

  const client = new PostsClient("627c481391a5de075f80a177");
  const [data, setData] = useState<Post>();
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<"saving" | "saved" | "error">(undefined);

  console.log("saving", saving);

  useEffect(() => {
    client.get(id).then((post) => {
      console.log(post);
      setData(post);
    });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    // load from store
    store.get(id).then((doc) => {
      if (doc) {
        setData({
          id,
          title: doc.title.raw,
          body: doc.content.raw,
        });
        setLoaded(true);
      }
    });
  }, [id]);

  useEffect(() => {
    if (!data) return;

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
    setSaving("saving");
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
    client
      .updateSummary(id, { summary: t })
      .then(() => {
        setSaving("saved");
      })
      .catch((e) => {
        setSaving("error");
      });
  }, 1000);

  return (
    <>
      <Dialog
        maxWidth="xl"
        open={publishDialog}
        onClose={() => {
          setPublishDialog(false);
        }}
      >
        <PublishPostReviewDialogBody
          title="Hi"
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
      </Dialog>
      <RightActionBar
        saving={saving}
        onCancelClick={() => {}}
        onPublishClick={() => {
          setPublishDialog(true);
        }}
      />
      <Editor
        id={id}
        store={store}
        onTitleChange={onTitleChange}
        onContentChange={onContentChange}
      />
    </>
  );
}

function Editor({
  id,
  store,
  onTitleChange,
  onContentChange,
}: {
  id: string;
  store;
  onContentChange: OnContentChange;
  onTitleChange: (t: string) => void;
}) {
  return (
    <BoringScaffold
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
