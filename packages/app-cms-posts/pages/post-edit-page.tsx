import React, { useState, useEffect } from "react";
import Dialog from "@material-ui/core/Dialog";

import { BoringScaffold } from "@grida.co/app/boring-scaffold";
import { PublishPostReviewDialogBody } from "../dialogs";
import { PostsClient } from "../api";
import { BoringDocumentsStore } from "@boring.so/store";
import { BoringContent, BoringTitle } from "@boring.so/document-model";
import type { OnContentChange } from "@boringso/react-core";
import { RightActionBar } from "../components/app-bar";
import type { Post, Publication, PublicationHost } from "../types";
import { PostsAppThemeProvider } from "../theme";
import type { Theme as PostCmsAppTheme } from "../theme";
import styled from "@emotion/styled";
import UrlPattern from "url-pattern";

const store = new BoringDocumentsStore();

type PostEditPageProps = { id: string } | { draft: true };

export default function PostEditPage({
  id,
  publication,
  theme,
}: {
  id: string;
  publication: Publication;
  theme?: PostCmsAppTheme;
}) {
  const [publishDialog, setPublishDialog] = React.useState(false); // controls review dialog

  const client = new PostsClient("627c481391a5de075f80a177");
  const [data, setData] = useState<Post>();
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<"saving" | "saved" | "error">(undefined);
  const { hosts } = publication;
  const primaryHost = hosts?.[0];
  const pattern = primaryHost
    ? new UrlPattern(primaryHost.pattern, {})
    : { stringify: (...args: any) => "" };

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

  const onUploadImage = async (d): Promise<string | false> => {
    console.log("have to upload this resouce", d);

    // return "https://wallpaperaccess.com/full/366398.jpg";
    return "https://mir-s3-cdn-cf.behance.net/project_modules/max_1200/5eeea355389655.59822ff824b72.gif";
    // return "https://grida.co/";
  };

  const canPublish: boolean =
    data && !!data.title.length && !!data.body.html?.length;

  return (
    <PostsAppThemeProvider theme={theme}>
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
                if (primaryHost) {
                  open(primaryHost.homepage + pattern.stringify(data));
                }
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
      <Container>
        <RightActionBar
          mode={data?.postedAt ? "update" : "post"}
          saving={saving}
          disabled={!canPublish}
          onPreviewClick={() => {
            open(primaryHost.homepage + pattern.stringify(data));
          }}
          onPublishClick={() => {
            setPublishDialog(true);
          }}
          theme={{
            primaryButton: {
              backgroundColor: theme.app_posts_cms.colors.button_primary,
            },
          }}
        />
        <Editor
          id={id}
          fileUploader={onUploadImage}
          store={store}
          onTitleChange={onTitleChange}
          onContentChange={onContentChange}
          readonly={!loaded}
          theme={theme?.app_posts_cms?.editor}
        />
      </Container>
    </PostsAppThemeProvider>
  );
}

const Container = styled.div`
  background-color: ${(props) =>
    /* @ts-ignore */
    props.theme.app_posts_cms.colors.root_background};
`;

function buildTargetUrl(
  host: PublicationHost,
  params: { [key: string]: string }
) {
  const { homepage, pattern } = host;
  // host.homepage +
  //
}

function Editor({
  id,
  store,
  onTitleChange,
  onContentChange,
  readonly,
  fileUploader,
  theme,
}: {
  id: string;
  store;
  onContentChange: OnContentChange;
  onTitleChange: (t: string) => void;
  readonly: boolean;
  fileUploader: (...d: File[]) => Promise<string | false>;
  theme?: PostCmsAppTheme["app_posts_cms"]["editor"];
}) {
  return (
    <BoringScaffold
      readonly={readonly}
      initial={id}
      onContentChange={onContentChange}
      onTitleChange={onTitleChange}
      titleStyle={{
        textAlign: theme.title_text_align,
      }}
      fileUploader={fileUploader}
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
