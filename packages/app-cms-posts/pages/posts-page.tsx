import React from "react";
import styled from "@emotion/styled";
import { PostListItem } from "../components";
import { TableTabItem } from "@app/blocks/table-tab-item";
import { InBlockButton } from "@app/blocks";

const dummy_posts = [
  {
    id: "1",
    title: "Introducing Grida Posts",
    summary:
      "Grida posts is a new way of managing your posts, blogs and newspresses. Write, publish customize your posts without leaving Grida. Comes with headless CMS and SDK for your custom needs",
    autor: "universe",
    publishedAt: "May 6",
    readingTime: "1 minute read",
    thumbnail: "grida://assets-reservation/images/I999:86124;999:86110",
  },
  {
    id: "2",
    title: "Our First Step Towards Interactive Coding on Figma",
    summary: "Figma + React + ESBuild = 🪄",
    autor: "universe",
    publishedAt: "May 6",
    readingTime: "1 minute read",
    thumbnail: "grida://assets-reservation/images/I999:86124;999:86110",
  },
  {
    id: "3",
    title:
      "Introducing Grida Embeddings - Figma designs made alive. (with production-ready code)",
    summary:
      "Introducing Grida Embeddings. Youtube, Google Maps and Live Camera in your Figma designs & prototypes (with-production ready code).",
    autor: "universe",
    publishedAt: "May 6",
    readingTime: "1 minute read",
    thumbnail: "grida://assets-reservation/images/I999:86124;999:86110",
  },
  {
    id: "4",
    title:
      "Figma Assistant by Grida — Supercharge your design & development workflow",
    summary:
      "A Opensource Design to code figma plugin. figma to flutter, figma to react. with linted design & clean code",
    autor: "universe",
    publishedAt: "May 6",
    readingTime: "1 minute read",
    thumbnail: "grida://assets-reservation/images/I999:86124;999:86110",
  },
];

const tabs = [
  {
    id: "drafts",
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
  posts,
  onPostClick,
  onNewPostClick,
}: {
  title?: string;
  posts: any[];
  onPostClick?: (id: string) => void;
  onNewPostClick?: () => void;
}) {
  const [tab, setTab] = React.useState("drafts");

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
                onClick={() => {
                  setTab(t.id);
                }}
              >
                {t.label}
              </TableTabItem>
            ))}
          </Tabs>
          <Actions>
            <Button onClick={onNewPostClick}>
              <Icons
                src="grida://assets-reservation/images/1009:87638"
                alt="icon"
              />
              <ButtonLabel>New Post</ButtonLabel>
            </Button>
          </Actions>
        </Tools>
      </Toolbar>
      <Title>{title}</Title>
      <List>
        {posts.map((post) => (
          <PostListItem
            key={post.id}
            title={post.title}
            summary={post.summary}
            autor={post.autor}
            publishedAt={post.postedAt}
            readingTime={post.readingTime}
            thumbnail={post.thumbnail}
            onClick={() => {
              onPostClick?.(post.id);
            }}
          />
        ))}
      </List>

      <BoringBlocksInBlockButton>
        <InBlockButton
          onClick={() => {
            open("https://grida.co/blog");
          }}
        >
          grida.co/blog
        </InBlockButton>
      </BoringBlocksInBlockButton>
    </Container>
  );
}

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
  background-color: rgb(196, 196, 196);
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

const Button = styled.div`
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
`;

const Icons = styled.img`
  width: 18px;
  height: 18px;
  object-fit: cover;
`;

const ButtonLabel = styled.span`
  color: white;
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Inter, sans-serif;
  font-weight: 500;
  text-align: center;
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
