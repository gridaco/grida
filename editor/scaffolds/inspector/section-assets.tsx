import React, { useEffect, useState } from "react";
import { useTargetContainer } from "hooks/use-target-node";
import { useFigmaImageService } from "scaffolds/editor";
import { ImagePaint } from "@design-sdk/figma-types";
import {
  ReflectSceneNodeType,
  ReflectVectorNode,
  ReflectSceneNode,
} from "@design-sdk/figma-node";
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

  const { target } = useTargetContainer();

  if (!target) {
    return <></>;
  }

  const { type } = target;

  switch (type) {
    case ReflectSceneNodeType.vector:
      return <VectorNodeAssetView node={target} />;
    default: {
      return <ImageFillNodeAssetView node={target} />;
    }
  }
}

function VectorNodeAssetView({ node }: { node: ReflectVectorNode }) {
  // todo: support vector fetch
  const service = useFigmaImageService();
  return <></>;
}

/**
 * the exportable config is not mapped from api response, this will be available once that statement is resolved.
 */
function ExportableNodeAssetView() {
  //
}

function ImageFillNodeAssetView({ node: target }: { node: ReflectSceneNode }) {
  const service = useFigmaImageService();
  const [srcs, setSrcs] = useState<string[]>([]);

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
