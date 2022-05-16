import React from "react";
import styled from "@emotion/styled";
import dayjs from "dayjs";

export function PostListItem({
  title,
  summary,
  author,
  publishedAt,
  thumbnail,
  readingTime,
  onClick,
}: {
  title: string;
  summary: string;
  author?: string;
  publishedAt?: Date | string;
  thumbnail?: string;
  readingTime?: string;
  onClick?: () => void;
}) {
  return (
    <Container onClick={onClick}>
      <TextContents>
        <Title>{title ?? "Untitled story"}</Title>
        {summary && <Summary>{summary}</Summary>}
        <MetaContainer>
          {author && <Author>@{author}</Author>}
          <PublishedAt>
            Published on {dayjs(publishedAt).format("MM/DD/YYYY")}
          </PublishedAt>
          <ReadingTime>{readingTime}</ReadingTime>
        </MetaContainer>
      </TextContents>
      {thumbnail && <Thumbnail src={thumbnail} />}
    </Container>
  );
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
  color: rgb(55, 53, 48);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  text-align: left;
  align-self: stretch;
  flex-shrink: 0;
`;

const Summary = styled.span`
  color: rgba(55, 53, 48, 0.9);
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
`;
