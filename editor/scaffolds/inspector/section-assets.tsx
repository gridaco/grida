import React, { useEffect, useState } from "react";
import { InspectorSection } from "components/inspector";
import { useTargetContainer } from "hooks/use-target-node";
import { useFigmaImageService } from "scaffolds/editor";
import type { ImagePaint } from "@design-sdk/figma-types";
import styled from "@emotion/styled";
import {
  PropertyGroup,
  PropertyGroupHeader,
  PropertyLines,
} from "@editor-ui/property";

export function AssetsSection() {
  // if the node itself is exportable
  // if the node has a complex gradient which is more effective to use asset than style code
  // if the node has a image fill

  const service = useFigmaImageService();
  const [srcs, setSrcs] = useState<string[]>([]);
  const { target } = useTargetContainer();

  useEffect(() => {
    if (target) {
      const images = target.fills
        .filter(Boolean)
        .filter((f) => f.visible)
        .filter((f) => f.type === "IMAGE")
        .reverse()
        .map((f: ImagePaint) => {
          return f.imageHash;
        });

      service.fetch(images, { debounce: false, ensure: true }).then((data) => {
        setSrcs(Object.values(data));
      });
    }
  }, [target?.id]);

  if (srcs.length === 0) {
    return <></>;
  }

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Assets</h6>
      </PropertyGroupHeader>
      <PropertyLines>
        <Body>
          {srcs.map((src, i) => (
            <Preview key={i} src={src} />
          ))}
        </Body>
      </PropertyLines>
    </PropertyGroup>
  );
}

const Body = styled.div`
  display: flex;
  flex-direction: row;
  gap: 16px;
  flex-wrap: wrap;
`;

function Preview({ src }: { src: string }) {
  return (
    <PreviewContainer
      style={{
        background: "grey",
        height: 100,
        width: "fit-content",
      }}
    >
      <img src={src} />
    </PreviewContainer>
  );
}

const PreviewContainer = styled.div`
  border-radius: 2px;
  overflow: hidden;
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`;
