import React from "react";
import styled from "@emotion/styled";

export function CoverLayout({ src }: { src?: string }) {
  return (
    <Container>
      {
        //
        src ? <CoverImage width={"100%"} height={"100%"} src={src} /> : <></>
      }
    </Container>
  );
}

const Container = styled.div`
  position: relative;
  display: flex;
  user-select: none;
  width: 100%;
  max-height: 360px;
  height: 100%;
  overflow: hidden;
  z-index: 2;
  flex-grow: 0;
  align-items: center;
  transition: height 0.3s ease-in-out;
`;

const CoverImage = styled.img`
  pointer-events: none;
  min-height: 200px;
  object-fit: cover;
`;
