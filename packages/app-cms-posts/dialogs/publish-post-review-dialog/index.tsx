import React, { useState } from "react";
import styled from "@emotion/styled";
import { EditSummarySegment } from "./edit-summary";
import { EditThumbnailSegment } from "./edit-thumbnail";
import { EditTagsSegment } from "./edit-tags";

type PostVisibility = "public" | "private" | "password_protected";

export function PublishPostReviewDialogBody({
  onPublish,
  onCancel,
  onTagsEdit,
  onSchedule,
  onTitleChange,
  onSummaryChange,
  title: initialTitle,
  summary: initialSummary = "",
  tags: initialTags = [],
  publication,
}: {
  onPublish: (p: {
    title: string;
    summary: string;
    visibility: PostVisibility;
  }) => void;
  onTitleChange: (t: string) => void;
  onSummaryChange: (t: string) => void;
  onSchedule: (p: {
    scheduledAt: Date;
    title: string;
    summary: string;
    visibility: PostVisibility;
  }) => void;
  onCancel: () => void;
  onTagsEdit: (tags: string[]) => void;
  title: string;
  summary?: string;
  tags?: string[];
  publication: {
    name: string;
  };
}) {
  const [isScheduling, setIsScheduling] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialSummary);
  const [tags, setTags] = useState(initialTags);
  const [scheduledAt, setScheduledAt] = useState(null);

  return (
    <Container>
      <Top>
        <Heading>Publish Post</Heading>
      </Top>
      <Body>
        <Left>
          <PreviewText>Post Preview</PreviewText>
          <PreviewContainer>
            <EditThumbnailSegment />
            <EditSummarySegment
              title={title}
              summary={summary}
              onTitleChange={(title) => {
                setTitle(title);
                onTitleChange(title);
              }}
              onSummaryChange={(summary) => {
                setSummary(summary);
                onSummaryChange(summary);
              }}
            />
          </PreviewContainer>
        </Left>
        <Right>
          <PublishingToGridaBlog>
            Publishing to :<strong>{publication.name}</strong>
          </PublishingToGridaBlog>
          <TagsAndPublishContainer>
            <EditTagsSegment
              tags={initialTags}
              onChange={(tags) => {
                setTags(tags);
              }}
            />
            {isScheduling && (
              <div>
                <input
                  type="date"
                  value={
                    scheduledAt
                      ? scheduledAt.toISOString().split("T")[0]
                      : undefined
                  }
                  onChange={(e) => {
                    setScheduledAt(new Date(e.target.value));
                  }}
                />
              </div>
            )}
            <Actions>
              {isScheduling ? (
                <PublishButton
                  onClick={() => {
                    onSchedule({
                      scheduledAt: scheduledAt,
                      visibility: "public",
                      title: title,
                      summary: summary,
                    });
                  }}
                >
                  Schedule to publish
                </PublishButton>
              ) : (
                <PublishButton
                  onClick={() => {
                    onPublish({
                      visibility: "public",
                      title: title,
                      summary: summary,
                    });
                  }}
                >
                  Publish now
                </PublishButton>
              )}
              <ScheduleForLater
                onClick={() => {
                  setIsScheduling(!isScheduling);
                }}
              >
                {isScheduling ? (
                  <>Cancel scheduling</>
                ) : (
                  <>Schedule for later</>
                )}
              </ScheduleForLater>
            </Actions>
          </TagsAndPublishContainer>
        </Right>
      </Body>
    </Container>
  );
}

const Container = styled.div`
  z-index: 1;
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: flex-start;
  flex: none;
  gap: 74px;
  border-radius: 4px;
  background-color: white;
  box-sizing: border-box;
  padding: 80px 120px;
  margin: auto;
  max-width: 1080px;
  width: 100%;
`;

const Top = styled.div`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  align-items: center;
  align-self: stretch;
  box-sizing: border-box;
  flex-shrink: 0;
`;

const Heading = styled.span`
  color: rgb(26, 26, 26);
  text-overflow: ellipsis;
  font-size: 48px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  text-align: left;
`;

const Icons = styled.img`
  width: 24px;
  height: 24px;
  object-fit: cover;
`;

const Body = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: flex-start;
  gap: 80px;
  align-self: stretch;
  box-sizing: border-box;
  flex-shrink: 0;
`;

const Left = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: flex-start;
  flex: 1;
  gap: 35px;
  width: 380px;
  box-sizing: border-box;
`;

const PreviewText = styled.span`
  color: rgb(26, 26, 26);
  text-overflow: ellipsis;
  font-size: 16px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  text-align: left;
`;

const PreviewContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: flex-start;
  gap: 18px;
  align-self: stretch;
  box-sizing: border-box;
  flex-shrink: 0;
`;

const Right = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: flex-start;
  flex: 1;
  gap: 36px;
  width: 380px;
  box-sizing: border-box;
`;

const PublishingToGridaBlog = styled.span`
  color: rgb(26, 26, 26);
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: normal;
  text-align: left;
  align-self: stretch;
  flex-shrink: 0;
`;

const TagsAndPublishContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: flex-start;
  gap: 26px;
  align-self: stretch;
  box-sizing: border-box;
  flex-shrink: 0;
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  gap: 24px;
  align-self: stretch;
  box-sizing: border-box;
  flex-shrink: 0;
`;

const PublishButton = styled.button`
  cursor: pointer;
  border: none;
  outline: none;
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  border-radius: 20px;
  height: 32px;
  background-color: rgb(35, 77, 255);
  box-sizing: border-box;
  padding: 0px 12px;
  color: white;
  text-overflow: ellipsis;
  font-size: 13px;
  font-family: Inter, sans-serif;
  font-weight: 400;
  text-align: left;

  :hover {
    opacity: 0.8;
  }

  :active {
    opacity: 0.9;
  }
`;

const ScheduleForLater = styled.span`
  cursor: pointer;
  color: rgba(0, 0, 0, 0.6);
  text-overflow: ellipsis;
  font-size: 13px;
  font-family: Inter, sans-serif;
  font-weight: 400;
  text-align: left;
`;
