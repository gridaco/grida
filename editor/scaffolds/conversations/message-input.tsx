import React from "react";
import styled from "@emotion/styled";
import { PaperPlaneIcon } from "@radix-ui/react-icons";
import TextareaAutosize from "react-textarea-autosize";

export function MessageInput({
  placeholder,
  onSend,
}: {
  placeholder?: string;
  onSend: (text: string) => void;
}) {
  const [text, setText] = React.useState("");

  const onkeydown = (e: React.KeyboardEvent) => {
    // ctr + enter or cmd + enter
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      onSend(text);
      setText("");
    }
  };

  return (
    <MessageInputContainer>
      <MessageInputField
        minRows={1}
        maxRows={5}
        placeholder={placeholder}
        value={text}
        onKeyDown={onkeydown}
        onChange={(e) => {
          setText(e.target.value);
        }}
      />
      <MessageInputButton
        onClick={() => {
          onSend(text);
          setText("");
        }}
      >
        <PaperPlaneIcon />
      </MessageInputButton>
    </MessageInputContainer>
  );
}

const MessageInputContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
`;

const MessageInputField = styled(TextareaAutosize)`
  flex: 1;
  border: none;
  outline: none;
  border-radius: 2px;
  color: white;
  font-size: 12px;
  padding: 12px;
  background-color: transparent;
  resize: none;
  font-family: Inter, sans-serif;

  &:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }
  &:focus {
    outline: 1px solid rgba(255, 255, 255, 0.2);
    background-color: rgba(255, 255, 255, 0.1);
  }
`;

const MessageInputButton = styled.button`
  border: none;
  outline: none;
  background-color: transparent;
  color: white;
  padding: 8px;
  cursor: pointer;

  svg {
    color: rgba(255, 255, 255, 0.5);
  }
  &:hover {
    svg {
      color: rgba(255, 255, 255, 0.8);
    }
  }
`;
