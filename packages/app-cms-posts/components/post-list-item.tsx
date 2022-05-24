import React from "react";
import styled from "@emotion/styled";
// import {MenuItem} from "@editor-ui/drop"
import dayjs from "dayjs";

export function PostListItem({
  title,
  summary,
  author,
  publishedAt,
  createdAt,
  thumbnail,
  readingTime,
  onClick,
  isDraft,
}: {
  title: string;
  summary: string;
  author?: string;
  publishedAt?: Date | string;
  createdAt?: Date | string;
  isDraft?: boolean;
  thumbnail?: string;
  readingTime?: number;
  onClick?: () => void;
}) {
  return (
    <Container onClick={onClick}>
      <TextContents>
        <Title>{title?.length ? title : "Untitled post"}</Title>
        {summary && <Summary>{summary}</Summary>}
        <MetaContainer>
          {author && <Author>@{author}</Author>}
          <PublishedAt>
            {isDraft ? (
              <>Created on {dayjs(createdAt).format("MMM DD, YYYY")}</>
            ) : (
              <>Published on {dayjs(publishedAt).format("MM/DD/YYYY")}</>
            )}
          </PublishedAt>
          {readingTime && (
            <ReadingTime>
              {readingtimeToMinutes(readingTime) + " minutes read"}
            </ReadingTime>
          )}
        </MetaContainer>
      </TextContents>
      {thumbnail && <Thumbnail src={thumbnail} />}
    </Container>
  );
}

function readingtimeToMinutes(readingTime: number) {
  // 0 min -> 1 min
  return Math.max(1, Math.floor(readingTime / 1000 / 60));
}

const Container = styled.div`
  cursor: pointer;
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: flex-start;
  flex: none;
  gap: 16px;
  min-height: 80px;
  box-sizing: border-box;
  color: rgb(55, 53, 48);
  border-bottom: 1px solid transparent;

  :hover {
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    color: black;
  }

  transition: border-bottom 0.3s ease-in-out, color 0.3s ease-in-out;
`;

const TextContents = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: flex-start;
  flex: 1;
  gap: 8px;
  box-sizing: border-box;
`;

const Title = styled.span`
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  text-align: left;
  align-self: stretch;
  flex-shrink: 0;
`;

const Summary = styled.span`
  opacity: 0.9;
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
  flex-shrink: 0;
`;

const MetaContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: flex-start;
  flex: none;
  gap: 20px;
  box-sizing: border-box;
`;

const Author = styled.span`
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 500;
  text-align: left;
`;

const PublishedAt = styled.span`
  color: rgba(55, 53, 48, 0.8);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 500;
  text-align: left;
`;

const ReadingTime = styled.span`
  color: rgba(55, 53, 48, 0.8);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 500;
  text-align: left;
`;

const Thumbnail = styled.img`
  width: 130px;
  height: 130px;
  object-fit: cover;
  margin-bottom: 4px;
  border-radius: 2px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.05);
`;
