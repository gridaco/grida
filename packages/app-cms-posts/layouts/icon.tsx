import React from "react";
import styled from "@emotion/styled";

export function IconLayout({ src }: { src?: string }) {
  return (
    <Container>
      {
        //
        src ? <IconImage src={src} /> : <></>
      }
    </Container>
  );
}

const Container = styled.div`
  position: relative;
  max-width: 150px;
  max-height: 150px;
  overflow: hidden;
`;

const IconImage = styled.img`
  user-select: none;
  pointer-events: none;
  width: 100%;
`;
