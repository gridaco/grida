import React from "react";
import styled from "@emotion/styled";
import { PostListItem } from "../components";
import { TableTabItem } from "@app/blocks/table-tab-item";
import { InBlockButton } from "@app/blocks";
import type { Post, Publication } from "../types";

/**
 * keep this name readable
 * this is used to build user message
 * > "There are currently no {t} posts in this publication.""
 */
type TabType = "draft" | "scheduled" | "published" | "unlisted";
const tabs: { id: TabType; label: string }[] = [
  {
    id: "draft",
    label: "Drafts and submissions",
  },
  {
    id: "scheduled",
    label: "Scheduled",
  },
  {
    id: "published",
    label: "Published",
  },
  {
    id: "unlisted",
    label: "Unlisted",
  },
];

export default function PostsPage({
  title = "Posts",
  publication,
  posts,
  onPostClick,
  onNewPostClick,
}: {
  title?: string;
  publication: Publication;
  posts: Post[];
  onPostClick?: (id: string) => void;
  onNewPostClick?: () => void;
}) {
  const [tab, setTab] = React.useState<TabType>("draft");

  const items = filterPostsBy(posts, tab);
  const { hosts, name: publicationName } = publication;

  return (
    <Container>
      <Toolbar>
        <Underline />
        <Tools>
          <Tabs>
            {tabs.map((t) => (
              <TableTabItem
                key={t.id}
                selected={tab === t.id}
                badge={filterPostsBy(posts, t.id).length.toString()}
                onClick={() => {
                  setTab(t.id);
                }}
              >
                {t.label}
              </TableTabItem>
            ))}
          </Tabs>
          <Actions>
            <Button onClick={onNewPostClick}>New Post</Button>
          </Actions>
        </Tools>
      </Toolbar>
      <Title>{title}</Title>
      <List>
        {items.length ? (
          items.map((post) => (
            <PostListItem
              key={post.id}
              title={post.title}
              summary={post.summary}
              author={post.author}
              publishedAt={post.postedAt}
              readingTime={post.readingTime ? post.readingTime + "s" : null}
              thumbnail={post.thumbnail}
              onClick={() => {
                onPostClick?.(post.id);
              }}
            />
          ))
        ) : (
          <Empty>There are currently no {tab} posts in this publication.</Empty>
        )}
      </List>
      {hosts?.map((h) => {
        const host = new URL(h.homepage);

        /* remove scheme - e.g. blog.grida.co/path */
        const display_host_name = `${host.host}${host.pathname}`;

        return (
          <BoringBlocksInBlockButton>
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
    </Container>
  );
}

const Empty = styled.div`
  padding: 80px 40px;
  text-align: center;
  opacity: 0.5;
`;

const filterPostsBy = (posts: Post[], type: TabType) => {
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

const Container = styled.div`
  margin: 100px 160px 40px 160px;
  box-sizing: border-box;
  background-color: white;
  position: relative;
  align-self: stretch;
  flex-shrink: 0;
  flex: 1;
`;

const Toolbar = styled.div`
  height: 50px;
  position: absolute;
  left: 0px;
  top: 147px;
  right: 0px;
`;

const Underline = styled.div`
  height: 1px;
  background-color: rgba(0, 0, 0, 0.1);
  position: absolute;
  left: 0px;
  right: 0px;
  bottom: 0px;
`;

const Tools = styled.div`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  align-items: center;
  flex: none;
  box-sizing: border-box;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const Tabs = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: flex-start;
  gap: 21px;
  align-self: stretch;
  box-sizing: border-box;
  flex-shrink: 0;
`;

const Actions = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  align-self: stretch;
  box-sizing: border-box;
  padding-left: 10px;
  flex-shrink: 0;
`;

const Button = styled.button`
  outline: none;
  border: none;
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 4px;
  border-radius: 4px;
  background-color: rgba(35, 77, 255, 0.9);
  box-sizing: border-box;
  padding: 8px 10px;
  color: white;
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Inter, sans-serif;
  font-weight: 500;
  text-align: center;

  :hover {
    opacity: 0.8;
  }

  :active {
    opacity: 0.9;
  }
`;

const Icon = styled.svg`
  width: 18px;
  height: 18px;
`;

const Title = styled.span`
  color: rgb(26, 26, 26);
  text-overflow: ellipsis;
  font-size: 48px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  text-align: left;
  width: 800px;
  position: absolute;
  left: 0px;
  top: 0px;
  align-self: stretch;
  flex-shrink: 0;
`;

const List = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: stretch;
  flex: none;
  gap: 24px;
  height: 598px;
  box-sizing: border-box;
  position: absolute;
  left: 0px;
  top: 235px;
  right: 0px;
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
  position: absolute;
  left: 0px;
  top: 78px;
`;
