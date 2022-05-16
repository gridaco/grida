import React from "react";
import styled from "@emotion/styled";

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
        type="text"
        value={title}
        placeholder="Title"
        onChange={(e) => {
          const v = e.target.value;
          onTitleChange(v);
        }}
      />
      <SummaryAsInput
        type="text"
        value={summary}
        placeholder="Summary"
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

const TitleAsInput = styled.input`
  border: none;
  color: rgb(26, 26, 26);
  font-size: 18px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  text-align: start;
  align-self: stretch;
  flex-shrink: 0;
`;

const SummaryAsInput = styled.input`
  border: none;
  color: rgb(26, 26, 26);
  font-size: 13px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: start;
  align-self: stretch;
  flex-shrink: 0;
`;
