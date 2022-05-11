import React from "react";
import styled from "@emotion/styled";

export function SavingIndicator({ status }: { status: "saving" | "saved" }) {
  const label = status === "saving" ? "Saving..." : "Saved";
  return (
    <Container>
      {status === "saving" ? (
        // {/* TODO: add progress */}
        <ProgressContainer
          src="grida://assets-reservation/images/1010:88789"
          alt="icon"
        />
      ) : (
        // {/* TODO: check icon */}
        <IconContainer
          src="grida://assets-reservation/images/1010:88717"
          alt="icon"
        />
      )}
      <Label>{label}</Label>
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 8px;
  border-radius: 4px;
  box-sizing: border-box;
  padding: 8px;
`;

const ProgressContainer = styled.img`
  width: 16px;
  height: 16px;
  object-fit: cover;
`;

const IconContainer = styled.img`
  width: 16px;
  height: 16px;
  object-fit: cover;
`;

const Label = styled.span`
  color: rgba(26, 26, 26, 0.7);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;
