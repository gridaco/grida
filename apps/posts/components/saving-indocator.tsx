import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";

export function SavingIndicator({
  status,
}: {
  status: "saving" | "saved" | "error";
  onRetryClick?: () => void;
  onClick?: () => void;
}) {
  useEffect(() => {
    // if saving or with error, ask user if sure to close the window.
    if (status === "saved") {
      return;
    }

    // Enable navigation prompt
    window.onbeforeunload = function () {
      return true;
    };

    return () => {
      // Remove navigation prompt
      window.onbeforeunload = null;
    };
  }, [status]);

  switch (status) {
    case "error": {
      return (
        <Container>
          {/* // <ProgressContainer */}
          {/* //   src="grida://assets-reservation/images/1010:88789" */}
          {/* //   alt="icon" */}
          {/* // /> */}
          <Label>Document has unsaved changes</Label>
        </Container>
      );
    }
    case "saved": {
      return <SavedIndicationWithTimer />;
    }
    case "saving": {
      return (
        <Container>
          {/* // <ProgressContainer */}
          {/* //   src="grida://assets-reservation/images/1010:88789" */}
          {/* //   alt="icon" */}
          {/* // /> */}
          <Label>Saving...</Label>
        </Container>
      );
    }
  }
}

function SavedIndicationWithTimer({
  delay = 2.5, // show for 2.5s
}: {
  delay?: number;
}) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    let timer1 = setTimeout(() => setShow(false), delay * 1000);
    return () => {
      clearTimeout(timer1);
    };
  }, []);

  return (
    <Container opacity={show ? 1 : 0}>
      <Label>Saved</Label>
    </Container>
  );
}

const Container = styled.div<{ opacity?: number }>`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 8px;
  border-radius: 4px;
  box-sizing: border-box;
  padding: 8px;
  opacity: ${(props) => props.opacity ?? 1};
  transition: opacity 0.2s ease-in-out;
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
