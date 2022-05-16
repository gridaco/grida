import React, { useState } from "react";
import styled from "@emotion/styled";

export function EditThumbnailSegment() {
  return (
    <ThumbnailEdit>
      <Src
        src="grida://assets-reservation/images/1010:91716"
        alt="image of Src"
      />
    </ThumbnailEdit>
  );
}

const ThumbnailEdit = styled.div`
  min-height: 180px;
  min-width: 400px;
  overflow: hidden;
  background-color: rgba(0, 0, 0, 0.02);
  position: relative;
  align-self: stretch;
  flex-shrink: 0;
`;

const Src = styled.img`
  object-fit: cover;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;
