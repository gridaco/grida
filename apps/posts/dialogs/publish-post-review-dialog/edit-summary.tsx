import React from "react";
import styled from "@emotion/styled";
import { css } from "@emotion/react";
import TextareaAutosize from "react-textarea-autosize";

export function EditSummarySegment({
  title,
  summary,
  onTitleChange,
  onSummaryChange,
}: {
  title;
  summary: string;
  onTitleChange: (title: string) => void;
  onSummaryChange: (summary: string) => void;
}) {
  return (
    <SummaryArea>
      <TitleAsInput
        value={title}
        placeholder="Title"
        maxRows={3}
        onChange={(e) => {
          const v = e.target.value;
          onTitleChange(v);
        }}
      />
      <SummaryAsInput
        value={summary}
        maxRows={3}
        placeholder="Please enter a summary. this will be displayed in the post preview."
        onChange={(e) => {
          const v = e.target.value;
          onSummaryChange(v);
        }}
      />
    </SummaryArea>
  );
}

const SummaryArea = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: flex-start;
  gap: 13px;
  align-self: stretch;
  box-sizing: border-box;
  flex-shrink: 0;
`;

const BaseInputStyle = css`
  border: none;
  outline: none;
  color: rgb(26, 26, 26);
  font-family: "Helvetica Neue", sans-serif;
  text-align: start;
  align-self: stretch;
  flex-shrink: 0;
  resize: none;
  text-overflow: ellipsis;

  ::placeholder {
    opacity: 0.5;
  }
`;

const TitleAsInput = styled(TextareaAutosize)`
  ${BaseInputStyle}
  font-size: 18px;
  font-weight: 700;
`;

const SummaryAsInput = styled(TextareaAutosize)`
  ${BaseInputStyle}
  font-size: 13px;
  font-weight: 400;
`;
