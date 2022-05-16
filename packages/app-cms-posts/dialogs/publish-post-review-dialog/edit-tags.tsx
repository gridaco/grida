import React, { useState } from "react";
import styled from "@emotion/styled";
import { TagsInput } from "@ui/tags-input";

export function EditTagsSegment() {
  return (
    <TagsEditContainer>
      <AddTagsForReadersUpTo5>
        Add tags for readers (up to 5)
      </AddTagsForReadersUpTo5>
      {/* <Tags></Tags> */}
      <TagsInput />
    </TagsEditContainer>
  );
}

const Tags = styled.div`
  height: 71px;
  background-color: rgba(0, 0, 0, 0.02);
  align-self: stretch;
  flex-shrink: 0;
`;

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
