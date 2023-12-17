import React, { useEffect, useState } from "react";
import { BaseHomeSceneCard } from "./base-home-scene-card";
import { fetch } from "@design-sdk/figma-remote";
import { useFigmaAuth } from "scaffolds/workspace/figma-auth";

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
  const fat = useFigmaAuth();

  const [thumbnail, setThumbnail] = useState(initialThumbnail);

  useEffect(() => {
    if (fat) {
      if (!thumbnail) {
        fetch
          .fetchNodeAsImage(
            data.file,
            {
              personalAccessToken: fat.personalAccessToken,
              accessToken: fat.accessToken.token,
            },
            data.id
          )
          .then((url) => {
            setThumbnail(url.__default);
          });
      }
    }
  }, [fat]);

  return <BaseHomeSceneCard label={label} thumbnail={thumbnail} />;
}
