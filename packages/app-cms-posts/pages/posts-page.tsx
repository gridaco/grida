import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { PostListItem, PostsTableToolBar } from "../components";
import { InBlockButton } from "@app/blocks";
import { PostsAppThemeProvider } from "../theme";
import type { Post, Publication } from "../types";
import type { Theme as PostCmsAppTheme } from "../theme";
import type { PostStatusType } from "../types";
import {
  CoverLayout,
  TitleLayout,
  IconLayout,
  ContentsLayout,
} from "../layouts";

const selected_tab_store = {
  get: (): PostStatusType => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(
        "@app/posts-cms/pages/posts#tab-selected"
      ) as PostStatusType;
    }
  },
  set: (tab: PostStatusType) => {
    localStorage.setItem("@app/posts-cms/pages/posts#tab-selected", tab);
  },
};

export default function PostsPage({
  title = "Posts",
  publication,
  posts,
  onPostClick,
  onNewPostClick,
  theme,
}: {
  title?: string;
  publication: Publication;
  posts: Post[];
  onPostClick?: (id: string) => void;
  onNewPostClick?: () => void;
  theme?: PostCmsAppTheme;
}) {
  const { hosts } = publication;

  const [tab, setTab] = useState<PostStatusType>();

  useEffect(() => {
    setTab(selected_tab_store.get() || "draft");
  }, []);

  const items = filterPostsBy(posts, tab);

  const onTabSelect = (tab: PostStatusType) => {
    setTab(tab);
    selected_tab_store.set(tab);
  };

  return (
    <PostsAppThemeProvider theme={theme}>
      <Container>
        <CoverLayout src={publication.cover} />
        <TitleAndIconContainer>
          <IconLayout src={publication.logo} />
          <TitleLayout>{title}</TitleLayout>
          {hosts?.map((h) => {
            const host = new URL(h.homepage);
            /* remove scheme - e.g. blog.grida.co/path */
            const display_host_name = `${host.host}${host.pathname}`;
            return (
              <BoringBlocksInBlockButton key={h.homepage + h.pattern}>
                <InBlockButton
                  onClick={() => {
                    open(host);
                  }}
                >
                  {display_host_name}
                </InBlockButton>
              </BoringBlocksInBlockButton>
            );
          })}
        </TitleAndIconContainer>
        <ContentsLayout>
          <PostsTableToolBar
            tab={tab}
            onNewPostClick={onNewPostClick}
            onSelect={onTabSelect}
            getBadge={(id) => {
              const l = filterPostsBy(posts, id).length;
              if (l) {
                return l.toString();
              }
            }}
          />
          <div style={{ marginTop: 40 }} />
          <List>
            {items.length ? (
              items.map((post) => (
                <PostListItem
                  key={post.id}
                  title={post.title}
                  summary={post.summary}
                  author={post.author}
                  publishedAt={post.postedAt}
                  isDraft={post.isDraft}
                  createdAt={post.createdAt}
                  readingTime={post.readingTime}
                  thumbnail={post.thumbnail}
                  onClick={() => {
                    onPostClick?.(post.id);
                  }}
                />
              ))
            ) : (
              <EmptyStateContainer>
                There are currently no {tab ? `${tab} ` : ""}posts in this
                publication.
              </EmptyStateContainer>
            )}
          </List>
        </ContentsLayout>
      </Container>
    </PostsAppThemeProvider>
  );
}

const Container = styled.div`
  margin: 0px 160px 40px 160px;
  box-sizing: border-box;
  position: relative;
  align-self: stretch;
  flex-shrink: 0;
  flex: 1;

  @media (max-width: 1080px) {
    margin: 0px 40px 40px 40px;
  }
`;

const TitleAndIconContainer = styled.div`
  position: relative;
  z-index: 3;
  transform: translateY(-150px);
  height: 0px;
`;

const EmptyStateContainer = styled.div`
  padding: 80px 40px;
  text-align: center;
  opacity: 0.5;
`;

const filterPostsBy = (posts: Post[], type: PostStatusType) => {
  return posts.filter((p) => {
    switch (type) {
      case "draft": {
        return p.isDraft;
      }
      case "published": {
        return !p.isDraft;
      }
      case "scheduled": {
        return !!p.scheduledAt;
      }
      case "unlisted":
        return !p.isDraft && !!!p.postedAt;
    }
  });
};

const List = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: stretch;
  flex: none;
  gap: 24px;
  box-sizing: border-box;
`;

const BoringBlocksInBlockButton = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: flex-start;
  flex: none;
  width: 124px;
  height: 33px;
  box-sizing: border-box;
`;
