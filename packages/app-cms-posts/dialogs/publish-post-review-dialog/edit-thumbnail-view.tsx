import React from "react";
import styled from "@emotion/styled";

export function ThumbnailView({
  src,
  label,
  onClick,
  loading,
}: {
  src?: string;
  label?: string;
  onClick?: () => void;
  loading?: boolean;
  //
}) {
  return (
    <Container loading={loading}>
      {src && <Src src={src} />}
      {label && (
        <ChangePreviewButton onClick={onClick}>{label}</ChangePreviewButton>
      )}
    </Container>
  );
}

const Container = styled.div<{ loading: boolean }>`
  min-height: 180px;
  max-width: 400px;
  min-width: 200px;
  overflow: hidden;
  background-color: rgba(0, 0, 0, 0.02);
  position: relative;
  align-self: stretch;
  flex-shrink: 0;
  border: 1px solid rgba(0, 0, 0, 0.02);
  border-radius: 2px;
  opacity: ${(props) => (props.loading ? 0.5 : 1)};
  pointer-events: ${(props) => (props.loading ? "none" : "auto")};

  transition: opacity 0.3s ease-in-out;
`;

const Src = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  position: absolute;
  inset: 0;
  user-select: none;
  pointer-events: none;
`;

const ChangePreviewButton = styled.button`
  /* center */
  margin: 0;
  position: absolute;
  top: 50%;
  left: 50%;
  -ms-transform: translate(-50%, -50%);
  transform: translate(-50%, -50%);
  /* center */

  background-color: rgba(0, 0, 0, 0.7);
  border: solid 1px black;
  border-radius: 100px;
  padding: 8px 12px;
  color: white;
  font-size: 14px;
  font-family: Inter, sans-serif;
  font-weight: 400;
  outline: none;
  user-select: none;
  cursor: pointer;

  :hover {
    opacity: 0.8;
  }

  :disabled {
    opacity: 0.5;
  }

  :active {
    opacity: 1;
  }

  :focus {
  }
`;
