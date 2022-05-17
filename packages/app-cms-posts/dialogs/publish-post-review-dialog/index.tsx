import React, { useState } from "react";
import styled from "@emotion/styled";
import { EditSummarySegment } from "./edit-summary";
import { EditThumbnailSegment } from "./edit-thumbnail";
import { EditTagsSegment } from "./edit-tags";
import { RoundPrimaryButton } from "../../components";
import { StyledDatePicker } from "@ui/date-picker";

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
          <PreviewText>Preview</PreviewText>
          <PreviewContainer>
            <EditThumbnailSegment
              onFileUpload={() => {
                // TODO:
              }}
            />
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
          <TagsAndPublishContainer>
            <EditTagsSegment
              tags={initialTags}
              onChange={(tags) => {
                setTags(tags);
              }}
            />
            {isScheduling && (
              <div>
                <StyledDatePicker
                  showTimeSelect
                  minDate={new Date()}
                  selected={scheduledAt}
                  onChange={(date) => {
                    setScheduledAt(date);
                  }}
                  value={scheduledAt}
                />
              </div>
            )}
            <Actions>
              {isScheduling ? (
                <RoundPrimaryButton
                  disabled={!!!scheduledAt}
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
                </RoundPrimaryButton>
              ) : (
                <RoundPrimaryButton
                  onClick={() => {
                    onPublish({
                      visibility: "public",
                      title: title,
                      summary: summary,
                    });
                  }}
                >
                  Publish now
                </RoundPrimaryButton>
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
  cursor: default;
  justify-content: flex-start;
  flex-direction: column;
  align-items: flex-start;
  flex: none;
  border-radius: 4px;
  background-color: white;
  box-sizing: border-box;
  padding: 80px 120px;
  margin: auto;
  max-width: 1080px;
  min-width: 70vw;
  min-height: 70vh;
  width: 100%;

  @media (max-width: 1080px) {
    padding: 40px 80px;
    align-items: stretch;
  }
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

const Heading = styled.h2`
  color: rgb(26, 26, 26);
  text-overflow: ellipsis;
  font-size: 30px;
  font-weight: 700;
  text-align: left;
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

  @media (max-width: 1080px) {
    flex-direction: column;
  }
`;

const Left = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: flex-start;
  flex: 1;
  gap: 12px;
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
  box-sizing: border-box;
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

const ScheduleForLater = styled.span`
  cursor: pointer;
  color: rgba(0, 0, 0, 0.6);
  text-overflow: ellipsis;
  font-size: 13px;
  font-family: Inter, sans-serif;
  font-weight: 400;
  text-align: left;

  :hover {
    color: rgba(0, 0, 0, 0.8);
  }

  transition: color 0.1s ease-in-out;
`;
