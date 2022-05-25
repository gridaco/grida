import React, { useState, useEffect } from "react";
import Dialog from "@material-ui/core/Dialog";
import { useRouter } from "next/router";
import { BoringScaffold } from "@grida.co/app/boring-scaffold";
import { PublishPostReviewDialogBody } from "../dialogs";
import { PostsClient } from "../api";
import { BoringDocumentsStore } from "@boring.so/store";
import { BoringContent, BoringTitle } from "@boring.so/document-model";
import type { OnContentChange } from "@boringso/react-core";
import { Appbar, RightActionBar } from "../components/app-bar";
import type { Post, Publication, PublicationHost } from "../types";
import { PostsAppThemeProvider } from "../theme";
import type { Theme as PostCmsAppTheme } from "../theme";
import styled from "@emotion/styled";
import { buildViewPostOnPublicationUrl } from "../urls";

function useBoringDocumentStore() {
  const [store, setStore] = useState<BoringDocumentsStore>();
  useEffect(() => {
    const store = new BoringDocumentsStore();
    setStore(store);
  }, []);

  return store;
}

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
  const router = useRouter();
  const [publishDialog, setPublishDialog] = React.useState(false); // controls review dialog

  const client = new PostsClient("627c481391a5de075f80a177");
  const store = useBoringDocumentStore();
  const [data, setData] = useState<Post>();
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<"saving" | "saved" | "error">(undefined);
  const { hosts } = publication;
  const primaryHost = hosts?.[0];

  useEffect(() => {
    client.get(id).then((post) => {
      setData(post);
      setLoaded(true);
    });
  }, [id]);

  useEffect(() => {
    if (!id || !store) return;
    // load from store
    store?.get(id).then((doc) => {
      if (doc) {
        setData({
          id,
          ...doc,
          title: doc.title.raw,
          body: doc.content.raw,
          isDraft: true,
          isListed: undefined,
        });
      }
    });
  }, [id, store]);

  useEffect(() => {
    if (!data) return;

    store?.put({
      id: id,
      title: new BoringTitle(data.title),
      content: data.body?.html
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

  const onDisplayTitleChange = debounce((t) => {
    setSaving("saving");
    setData((d) => ({ ...d, title: t }));
    client
      .updateSummary(id, { title: t })
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

  const uploadAsset = async (d: File): Promise<string | false> => {
    try {
      const uploaded = await client.uploadAsset(id, d);
      const asseturl = uploaded.assets[d.name];
      return asseturl;
    } catch (e) {
      return false;
    }
  };

  const canPublish: boolean =
    data && !!data.title?.length && !!data.body?.html?.length;

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
            summary={data.summary ?? makeSummaryFromBody(data.body)}
            tags={data.tags}
            thumbnail={data.thumbnail}
            onPublish={async (p) => {
              setData((d) => ({ ...d, ...p }));

              // updte
              await client.updateSummary(id, { ...p });

              // 1. update with value (TODO:)
              client.publish(id).then(({ id }) => {
                // 2. then => publish
                setPublishDialog(false);
                if (primaryHost) {
                  open(
                    buildViewPostOnPublicationUrl(primaryHost, { id }, false)
                  );
                }
              });

              return true;
            }}
            onDisplayTitleChange={onDisplayTitleChange}
            onSummaryChange={onSummaryChange}
            onSchedule={(p) => {
              // TODO:
              // 1. update with value
              // 2. them => schedule
              setPublishDialog(false);
            }}
            onThumbnailChange={(f) => {
              setSaving("saving");
              //
              client
                .putThumbnail(id, f)
                .then(() => {
                  setSaving("saved");
                  //
                })
                .catch((e) => {
                  setSaving("error");
                  //
                });
            }}
            onCancel={() => {
              setPublishDialog(false);
            }}
            onTagsEdit={(tags: string[]) => {
              setSaving("saving");
              client
                .updateTags(id, tags)
                .then(() => {
                  setSaving("saved");
                })
                .catch((e) => {
                  setSaving("error");
                });
            }}
            publication={{
              name: "Grida",
            }}
            disableSchedule
          />
        )}
      </Dialog>
      <Appbar
        logo={
          publication.logo ? <LogoContainer src={publication.logo} /> : null
        }
        onLogoClick={() => {
          router.push("/posts");
        }}
        mode={data?.postedAt ? "update" : "post"}
        saving={saving}
        disabledPublish={!canPublish}
        onPreviewClick={() => {
          open(buildViewPostOnPublicationUrl(primaryHost, { ...data }, true));
        }}
        onPublishClick={() => {
          setPublishDialog(true);
        }}
      />
      <EditorContainer>
        <Editor
          id={id}
          fileUploader={uploadAsset}
          store={store}
          onTitleChange={onTitleChange}
          onContentChange={onContentChange}
          readonly={!loaded}
          theme={theme?.app_posts_cms?.editor}
        />
      </EditorContainer>
    </PostsAppThemeProvider>
  );
}

/**
 * get the summary from the body html.
 *
 *
 * e.g. from
 * ```html
 * <p><b>SERVES: 1</b></p>
 * <p>Legend has it that the Ice Cream Float was invented on a particularly hot Philadelphia day by a soda vendor who had run out of ice. To cool his drinks</p>
 * ```
 *
 * => returns the second paragraph
 *
 *
 * @param body
 * @returns
 */
function makeSummaryFromBody(body: { html: string }): string {
  const { html } = body;

  if (!html) return undefined;

  // parse html, extract first paragraph
  const doc = new DOMParser().parseFromString(html, "text/html");
  const paragraphs = doc.querySelectorAll("p");
  if (paragraphs.length) {
    // list first 3 paragraphs, get the longest one.
    const longest = Array.from(paragraphs)
      .slice(0, 3)
      .reduce(
        (acc, p) => {
          const text = p.textContent;
          if (text.length > acc.length) {
            return text;
          }
          return acc;
        },
        //
        ""
      );
    return longest.substring(0, 200);
  } else {
    // extract any text from html doc
    return doc.textContent?.substring(0, 200) ?? "";
  }
}

const LogoContainer = styled.img`
  height: 100%;
  width: 100%;
  object-fit: contain;
`;

const EditorContainer = styled.div`
  margin: 80px 120px 100px;
  border-radius: 8px;
  box-shadow: 0px 4px 24px 4px rgba(0, 0, 0, 0.04);
  background-color: ${(props) =>
    /* @ts-ignore */
    props.theme.app_posts_cms.colors.root_background};

  @media (max-width: 1080px) {
    margin: 80px 40px 100px;
  }
  @media (max-width: 768px) {
    margin: 80px 20px 80px;
  }
`;

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
