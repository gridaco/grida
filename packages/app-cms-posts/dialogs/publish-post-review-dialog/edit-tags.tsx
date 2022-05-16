import React from "react";
import styled from "@emotion/styled";
import { TagsInput } from "@ui/tags-input";

export function EditTagsSegment({
  tags,
  onChange,
}: {
  tags: Array<string>;
  onChange: (tags: Array<string>) => void;
}) {
  return (
    <TagsEditContainer>
      <AddTagsForReadersUpTo5>Add tags for search</AddTagsForReadersUpTo5>
      <TagsInput
        initialTags={tags.map((tag) => ({ id: tag, text: tag }))}
        onChange={(t) => {
          onChange(t.map((t) => t.text));
        }}
        style={{
          alignSelf: "stretch",
          flexShrink: 0,
          fontSize: 14,
          padding: 8,
          borderRadius: 4,
          backgroundColor: "rgba(0, 0, 0, 0.02)",
        }}
      />
    </TagsEditContainer>
  );
}

const TagsEditContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  align-self: stretch;
  box-sizing: border-box;
  flex-shrink: 0;
`;

const AddTagsForReadersUpTo5 = styled.span`
  color: rgb(26, 26, 26);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
  flex-shrink: 0;
`;
