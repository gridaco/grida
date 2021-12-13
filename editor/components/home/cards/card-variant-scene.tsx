import React, { useEffect, useState } from "react";
import { BaseHomeSceneCard } from "./base-home-scene-card";
import { fetch } from "@design-sdk/figma-remote";
import { useFigmaAccessToken } from "hooks/use-figma-access-token";

export function SceneCard({
  label,
  thumbnail: initialThumbnail,
  data,
}: {
  label: string;
  thumbnail: string;
  data: {
    file: string;
    id: string;
  };
}) {
  const fat = useFigmaAccessToken();

  const [thumbnail, setThumbnail] = useState(initialThumbnail);

  useEffect(() => {
    if (fat) {
      if (!thumbnail) {
        fetch.fetchNodeAsImage(data.file, fat, data.id).then((url) => {
          setThumbnail(url.__default);
        });
      }
    }
  }, [fat]);

  return <BaseHomeSceneCard label={label} thumbnail={thumbnail} />;
}
